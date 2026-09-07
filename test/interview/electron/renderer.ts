// Drives the app's real listener services inside a bare page. Bundled by
// run.js with esbuild (Angular's @Injectable is shimmed away).
import { LiveListenerService } from '../../../src/app/services/live-listener.service';
import { RealtimeListenerService } from '../../../src/app/services/realtime-listener.service';

declare const testAPI: {
  getConfig(): Promise<{ scenario: string; runMs: number }>;
  sendRealtimeAudio(pcm16: ArrayBuffer): void;
  report(result: unknown): void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The scenarios listen on the 'default' input device — the app's real
 * getUserMedia path (macOS via BlackHole, or a microphone) — which main.js
 * points at Chromium's fake capture device fed from the interviewer WAV.
 * The Windows loopback path differs only in how the MediaStream is obtained
 * (see call-audio.ts); everything downstream is shared.
 */
const SOURCE = 'default';

async function runLoopback() {
  // Untouched app path: Electron's setDisplayMediaRequestHandler answers with
  // audio: 'loopback'. Reports what that yields on this OS: whether a system
  // audio track comes back at all, and whether it carries any signal.
  const svc = new LiveListenerService();
  let maxLevel = 0;
  let levelTicks = 0;
  svc.level$.subscribe((v) => { levelTicks += 1; if (v > maxLevel) maxLevel = v; });
  try {
    await svc.start('loopback');
    await sleep(2000);
    svc.stop();
    return { ok: true, note: 'getDisplayMedia returned a system audio track', maxLevel, levelTicks };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function runStandard(runMs: number) {
  const svc = new LiveListenerService();
  let maxLevel = 0;
  let levelTicks = 0;
  const ended: string[] = [];
  const raw: Array<{ blob: Blob; mimeType: string; durationMs: number; startedAt: number }> = [];
  svc.level$.subscribe((v) => { levelTicks += 1; if (v > maxLevel) maxLevel = v; });
  svc.segment$.subscribe((s) => raw.push(s));
  svc.ended$.subscribe((r) => ended.push(r));

  const t0 = Date.now();
  await svc.start(SOURCE);
  await sleep(runMs);
  svc.stop();
  await sleep(750); // MediaRecorder.onstop is async

  // Decode each emitted file the way a transcriber would have to.
  const segments = [];
  for (const s of raw) {
    const bytes = await s.blob.arrayBuffer();
    let decodedMs: number | null = null;
    let decodeError: string | null = null;
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(bytes.slice(0));
      decodedMs = Math.round(buf.duration * 1000);
      await ctx.close();
    } catch (err: any) {
      decodeError = err?.message || String(err);
    }
    segments.push({
      mimeType: s.mimeType,
      bytes: bytes.byteLength,
      durationMs: s.durationMs,
      startedAtMs: s.startedAt - t0,
      decodedMs,
      decodeError,
    });
  }
  return { ok: true, segments, maxLevel, levelTicks, ended };
}

async function runRealtime(runMs: number) {
  const chunks = { count: 0, samples: 0, maxRms: 0 };
  const electronStub = {
    sendRealtimeAudio: (buf: ArrayBuffer) => {
      chunks.count += 1;
      const pcm = new Int16Array(buf);
      chunks.samples += pcm.length;
      let sum = 0;
      for (let i = 0; i < pcm.length; i++) { const v = pcm[i] / 32768; sum += v * v; }
      const r = Math.sqrt(sum / Math.max(1, pcm.length));
      if (r > chunks.maxRms) chunks.maxRms = r;
      testAPI.sendRealtimeAudio(buf);
    },
  };
  const svc = new RealtimeListenerService(electronStub as any);
  let maxLevel = 0;
  const ended: string[] = [];
  svc.level$.subscribe((v) => { if (v > maxLevel) maxLevel = v; });
  svc.ended$.subscribe((r) => ended.push(r));

  await svc.start(SOURCE);
  const contextSampleRate = (svc as any).audioContext?.sampleRate ?? null;
  await sleep(runMs);
  svc.stop();
  await sleep(250);
  return {
    ok: true,
    contextSampleRate,
    chunks: { ...chunks, audioMs: Math.round((chunks.samples / 24000) * 1000) },
    maxLevel,
    ended,
  };
}

(async () => {
  const cfg = await testAPI.getConfig();
  try {
    let result: unknown;
    if (cfg.scenario === 'loopback') result = await runLoopback();
    else if (cfg.scenario === 'standard') result = await runStandard(cfg.runMs);
    else if (cfg.scenario === 'realtime') result = await runRealtime(cfg.runMs);
    else result = { ok: false, error: `unknown scenario ${cfg.scenario}` };
    testAPI.report({ scenario: cfg.scenario, ...(result as object) });
  } catch (err: any) {
    testAPI.report({ scenario: cfg.scenario, ok: false, error: err?.message || String(err), stack: err?.stack });
  }
})();
