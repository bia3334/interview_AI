#!/usr/bin/env node
// Interview-mode audio pipeline test (Google Meet style call audio).
//
//   node test/interview/run.js [--only loopback|standard|realtime|fallback|context]
//
// What it checks, without speakers, a microphone, an API key or a live call:
//   loopback  what the app's untouched getDisplayMedia + audio:'loopback'
//             request yields on this OS (informational — Windows-only feature)
//   standard  LiveListenerService cuts the synthetic interviewer audio into
//             one decodable webm/opus file per utterance, drops the chime
//   realtime  RealtimeListenerService streams 24 kHz PCM16 → IPC →
//             RealtimeTranscriber → mock Realtime API; both VAD styles
//             (gpt-live-transcribe client VAD, gpt-4o-mini-transcribe server
//             VAD) yield one completed transcript per utterance
//   fallback  RealtimeTranscriber retries with the pre-GA protocol when the
//             GA session.update is rejected (node only, no Electron)
//   context   the CV / JD / notes prefix placed ahead of every interview
//             question is built, clipped and omitted correctly (node only)
//
// Renderer services run in a real Electron/Chromium under Xvfb; the audio
// comes from Chromium's fake capture device fed with gen-meet-audio.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const esbuild = require('esbuild');
const audio = require('./gen-meet-audio');
const mock = require('./mock-realtime-server');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(__dirname, '.build');
const only = (() => { const i = process.argv.indexOf('--only'); return i > -1 ? process.argv[i + 1] : null; })();
const want = (name) => !only || only === name;

const results = [];
function check(scenario, name, pass, detail) {
  results.push({ scenario, name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  (${detail})` : ''}`);
}
const near = (v, target, tol) => typeof v === 'number' && Math.abs(v - target) <= tol;

async function prepare() {
  fs.mkdirSync(BUILD, { recursive: true });
  const wav = path.join(BUILD, 'meet-interviewer.wav');
  audio.generate(wav);

  await esbuild.build({
    entryPoints: [path.join(__dirname, 'electron', 'renderer.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    outfile: path.join(BUILD, 'renderer.js'),
    alias: { '@angular/core': path.join(__dirname, 'shims', 'angular-core.js') },
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    logLevel: 'warning',
  });
  fs.writeFileSync(
    path.join(BUILD, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>interview audio test</title><script src="renderer.js"></script>'
  );

  // The main-process transcriber, compiled on its own so the harness doesn't
  // depend on a full `tsc` run. `ws` resolves from the repo's node_modules.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main', 'audio', 'realtime-transcription.ts'), 'utf8');
  const out = await esbuild.transform(src, { loader: 'ts', format: 'cjs', platform: 'node', target: 'node18' });
  const transcriber = path.join(BUILD, 'realtime-transcription.js');
  fs.writeFileSync(transcriber, out.code);
  return { wav, transcriber };
}

function electronArgs() {
  const electron = require('electron');
  const useXvfb = !process.env.DISPLAY && spawnSync('which', ['xvfb-run']).status === 0;
  return useXvfb
    ? { cmd: 'xvfb-run', pre: ['-a', '--server-args=-screen 0 1280x800x24', electron] }
    : { cmd: electron, pre: [] };
}

function runElectron(scenario, extra, runMs) {
  const out = path.join(BUILD, `${scenario}.json`);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const { cmd, pre } = electronArgs();
  const args = [
    ...pre,
    // Chromium refuses to start sandboxed as root (CI containers); the
    // switch must be on the command line, not added by the main script.
    ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []),
    path.join(__dirname, 'electron', 'main.js'),
    `--scenario=${scenario}`,
    `--out=${out}`,
    `--run-ms=${runMs}`,
    `--page-dir=${BUILD}`,
    ...extra,
  ];
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' } });
    const lines = [];
    const tap = (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        // Chromium's dbus/GL chatter in a container is noise; keep our lines.
        if (/^\[(main|renderer)/.test(line)) console.log('    ' + line);
        lines.push(line);
      }
    };
    child.stdout.on('data', tap);
    child.stderr.on('data', tap);
    const killer = setTimeout(() => child.kill('SIGKILL'), runMs + 40000);
    child.on('exit', (code) => {
      clearTimeout(killer);
      const payload = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
      resolve({ code, payload, lines });
    });
  });
}

async function scenarioLoopback(prep) {
  console.log('\n[loopback] app-native getDisplayMedia + audio:"loopback" on this OS');
  const { payload } = await runElectron('loopback', [], 3000);
  const r = payload && payload.result;
  if (!r) { check('loopback', 'scenario produced a result', false, 'no result file (hang or crash)'); return; }
  const summary = r.ok
    ? `${r.note}; max rms ${r.maxLevel.toFixed(4)} over ${r.levelTicks} ticks`
    : `rejected: ${r.error}`;
  if (r.ok && process.platform !== 'win32') {
    // Without an OS audio backend (typical CI container) Chromium falls back
    // to a fake audio manager whose input is a test tone, so a non-zero level
    // here is not evidence of real loopback capture.
    console.log('    note: on a machine with no audio backend Chromium substitutes a fake input stream (test tone); only a Windows run verifies WASAPI loopback');
  }
  if (process.platform === 'win32') {
    // The shipped path: WASAPI loopback of the default output device.
    check('loopback', 'system audio track captured (Windows)', r.ok, summary);
  } else {
    // Electron documents loopback audio as Windows-only, yet Linux/macOS may
    // still hand back a track (silent when the OS has no loopback source).
    // Either outcome is acceptable here as long as the app neither hangs nor
    // throws something other than its own message; record what happened.
    const clean = r.ok || /audio/i.test(r.error || '');
    check('loopback', `${process.platform}: request resolved cleanly (informational)`, clean, summary);
  }
}

async function scenarioStandard(prep) {
  console.log('\n[standard] LiveListenerService: energy VAD → one webm file per utterance');
  const runMs = audio.totalMs() + 1500;
  const { payload } = await runElectron('standard', [`--wav=${prep.wav}`], runMs);
  const r = payload && payload.result;
  if (!r || !r.ok) { check('standard', 'listener started on the call audio', false, (r && r.error) || 'no result'); return; }
  const expected = audio.expectedUtterances(350);
  const segs = r.segments || [];
  check('standard', 'audio level seen by the meter', r.maxLevel > 0.05, `max rms ${r.maxLevel.toFixed(3)}, ${r.levelTicks} ticks`);
  check('standard', `utterances cut: ${expected.length} expected`, segs.length === expected.length, `got ${segs.length}: ${segs.map((s) => `${s.decodedMs}ms`).join(', ')}`);
  segs.forEach((s, i) => {
    const exp = expected[i];
    check('standard', `segment ${i + 1} is a decodable opus/webm file`, /webm|ogg/.test(s.mimeType) && s.bytes > 0 && s.decodedMs !== null && !s.decodeError, `${s.mimeType}, ${s.bytes} B, ${s.decodedMs} ms${s.decodeError ? ', ' + s.decodeError : ''}`);
    if (exp) {
      // The file spans from the previous cut to ~1.1 s after speech stops, so
      // it must contain at least the whole utterance and not the next one.
      const maxMs = exp.ms + 1100 + 1600 + 1000 + 500;
      check('standard', `segment ${i + 1} contains "${exp.label}" (${exp.ms} ms) whole`, s.decodedMs >= exp.ms && s.decodedMs <= maxMs, `${s.decodedMs} ms`);
    }
  });
  check('standard', 'capture did not end on its own', (r.ended || []).length === 0, (r.ended || []).join('; ') || 'no ended$ events');
}

async function scenarioRealtime(prep, server) {
  console.log('\n[realtime] RealtimeListenerService → IPC → RealtimeTranscriber → mock Realtime API');
  const runMs = audio.totalMs() + 1500;
  const before = server.connections.length;
  const { payload } = await runElectron('realtime', [`--wav=${prep.wav}`, `--realtime-url=${server.url}`, `--transcriber=${prep.transcriber}`], runMs);
  const r = payload && payload.result;
  if (!r || !r.ok) { check('realtime', 'listener started on the call audio', false, (r && r.error) || 'no result'); return; }
  const expected = audio.expectedUtterances(300);

  check('realtime', 'renderer streamed PCM16 chunks', r.chunks.count > 0, `${r.chunks.count} chunks from a ${r.contextSampleRate} Hz context`);
  check('realtime', 'streamed audio length matches the call', near(r.chunks.audioMs, runMs, 1500), `${r.chunks.audioMs} ms sent for ${runMs} ms of capture`);
  check('realtime', 'resampled audio carries the speech (not silence)', r.chunks.maxRms > 0.05, `max rms ${r.chunks.maxRms.toFixed(3)}`);

  const conns = server.connections.slice(before);
  for (const [model, events] of Object.entries(payload.transcribers || {})) {
    const conn = conns.find((c) => c.model === model);
    const tag = `${model}`;
    check('realtime', `${tag}: session configured over the GA protocol`, conn && conn.protocol === 'ga' && events.some((e) => e.type === 'ready'), conn ? `${conn.protocol}, vad=${conn.turnDetection ? 'server' : 'client'}` : 'no connection');
    check('realtime', `${tag}: Authorization header carries the key`, conn && conn.headers.authorization === 'Bearer sk-test');
    const completed = events.filter((e) => e.type === 'completed');
    check('realtime', `${tag}: ${expected.length} completed transcripts, click dropped`, completed.length === expected.length, completed.map((c) => `"${c.transcript}"`).join(' | ') || 'none');
    const utts = conn ? conn.utterances : [];
    utts.forEach((u, i) => {
      const exp = expected[i];
      if (exp) check('realtime', `${tag}: utterance ${i + 1} ≈ ${exp.ms} ms of speech reached the server`, near(u.speechMs, exp.ms, 400), `${u.speechMs} ms`);
    });
    const errors = events.filter((e) => e.type === 'error');
    check('realtime', `${tag}: no error events surfaced to the UI`, errors.length === 0, errors.map((e) => e.message).join('; ') || 'none');
    if (model === 'gpt-live-transcribe') {
      check('realtime', `${tag}: deltas streamed before each completed`, events.some((e) => e.type === 'delta'));
      check('realtime', `${tag}: client VAD sent one commit per utterance`, conn && conn.received['input_audio_buffer.commit'] === expected.length, conn && `${conn.received['input_audio_buffer.commit'] || 0} commits`);
    } else {
      check('realtime', `${tag}: server VAD requested (turn_detection sent)`, conn && conn.turnDetection && conn.turnDetection.type === 'server_vad');
      check('realtime', `${tag}: speech_started/stopped relayed`, events.some((e) => e.type === 'speech_started') && events.some((e) => e.type === 'speech_stopped'));
    }
  }
}

// Node-only: GA session rejected → transcriber reconnects with the pre-GA
// protocol and still delivers a transcript for a spoken utterance.
async function scenarioFallback(prep) {
  console.log('\n[fallback] RealtimeTranscriber: GA session.update rejected → legacy protocol');
  const { RealtimeTranscriber } = require(prep.transcriber);
  const server = await mock.start({ rejectGa: true });
  const events = [];
  const t = new RealtimeTranscriber({
    apiKey: 'sk-test', model: 'gpt-live-transcribe', language: 'vi', url: server.url,
    log: { info() {}, warn() {}, error() {} },
    onEvent: (e) => events.push(e),
  });
  t.start();
  // Feed 24 kHz PCM16 from the WAV (every other sample) in real time: the
  // client VAD measures pauses on the wall clock.
  const wav = fs.readFileSync(prep.wav);
  const pcm48 = wav.subarray(44);
  const chunkSamples = 2048;
  const chunkMs = (chunkSamples / 24000) * 1000;
  const chunks = [];
  for (let i = 0; i + chunkSamples * 4 <= pcm48.length; i += chunkSamples * 4) {
    const c = Buffer.alloc(chunkSamples * 2);
    for (let j = 0; j < chunkSamples; j++) c.writeInt16LE(pcm48.readInt16LE(i + j * 4), j * 2);
    chunks.push(c);
  }
  // Only the first 5 s: one utterance and the pause after it.
  const limit = Math.ceil(5000 / chunkMs);
  for (let k = 0; k < Math.min(limit, chunks.length); k++) {
    t.sendAudio(chunks[k]);
    await new Promise((r) => setTimeout(r, chunkMs));
  }
  await new Promise((r) => setTimeout(r, 500));
  t.stop();
  await server.close();

  const conn = server.connections[server.connections.length - 1];
  check('fallback', 'GA rejection triggered one reconnect', server.connections.length === 2 && server.connections[0].rejectedGa, `${server.connections.length} connections`);
  check('fallback', 'second session used the legacy protocol + OpenAI-Beta header', conn && conn.protocol === 'legacy' && conn.headers.openaiBeta === 'realtime=v1', conn && `${conn.protocol}, beta=${conn.headers.openaiBeta}`);
  check('fallback', 'language hint forwarded', conn && conn.language === 'vi', conn && conn.language);
  check('fallback', 'ready reached the UI, rejection error did not', events.some((e) => e.type === 'ready') && !events.some((e) => e.type === 'error'), events.map((e) => e.type).join(','));
  const completed = events.filter((e) => e.type === 'completed');
  check('fallback', 'audio buffered during reconnect still produced a transcript', completed.length === 1 && conn && near(conn.utterances[0] && conn.utterances[0].speechMs, 2400, 400), completed.map((c) => c.transcript).join('|') || 'none');
}

// Node-only: the CV / JD / notes prefix that is placed ahead of every
// interview question (src/main/ai/interview-context.ts).
async function scenarioContext() {
  console.log('\n[context] interview prompt prefix from CV / JD / notes');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ai', 'interview-context.ts'), 'utf8');
  const out = await esbuild.transform(src, { loader: 'ts', format: 'cjs', platform: 'node', target: 'node18' });
  const modPath = path.join(BUILD, 'interview-context.js');
  fs.writeFileSync(modPath, out.code);
  const m = require(modPath);

  const empty = m.normalizeInterviewContext(undefined);
  check('context', 'missing store value normalizes to three empty slots', ['cv', 'jd', 'notes'].every((k) => empty[k] && empty[k].text === '' && empty[k].fileName === null));
  check('context', 'no context → empty prefix (question goes out untouched)', m.buildInterviewContextPrefix(empty) === '');

  const junk = m.normalizeInterviewContext({ cv: 'not-an-object', jd: { text: 42 }, notes: { text: 'ok', fileName: '' } });
  check('context', 'malformed entries are coerced, not thrown', junk.cv.text === '' && junk.jd.text === '' && junk.notes.text === 'ok' && junk.notes.fileName === null);

  const ctx = m.normalizeInterviewContext({
    cv: { text: 'Nguyen Van A — 3 years Angular + NestJS at FPT IS', fileName: 'cv.pdf', updatedAt: 1 },
    jd: { text: 'Senior Frontend Engineer: Angular, RxJS, mentoring', fileName: null, updatedAt: 1 },
    notes: { text: 'Mention the akaBot migration project', fileName: null, updatedAt: 1 },
  });
  const prefix = m.buildInterviewContextPrefix(ctx);
  check('context', 'prefix carries CV, JD and notes with their headers', /--- MY CV \(cv\.pdf\) ---\n.*Angular \+ NestJS/.test(prefix) && /--- JOB DESCRIPTION ---\n.*Senior Frontend/.test(prefix) && /--- MY NOTES ---\n.*akaBot/.test(prefix), `${prefix.length} chars`);
  check('context', 'prefix tells the model not to invent facts', /Never invent facts about me/.test(prefix));

  const long = m.normalizeInterviewContext({ cv: { text: 'x'.repeat(20000), fileName: null, updatedAt: 1 } });
  const clipped = m.buildInterviewContextPrefix(long);
  check('context', 'oversized CV is clipped to the slot limit with a marker', clipped.includes('[truncated: 5000 more characters]') && clipped.length < 15500, `${clipped.length} chars`);
  check('context', 'only slots with text are emitted', !clipped.includes('JOB DESCRIPTION') && !clipped.includes('MY NOTES'));
}

(async () => {
  console.log('Interview audio pipeline test');
  console.log(`  platform ${process.platform}, electron ${require('electron/package.json').version}, node ${process.version}`);
  const prep = await prepare();
  console.log(`  synthetic call audio: ${audio.totalMs()} ms — ${audio.TIMELINE.filter((t) => t.kind === 'speech').map((t) => `${t.label} ${t.ms} ms`).join(', ')}`);

  const server = await mock.start({ log: (m) => console.log('    [mock] ' + m) });
  try {
    if (want('loopback')) await scenarioLoopback(prep);
    if (want('standard')) await scenarioStandard(prep);
    if (want('realtime')) await scenarioRealtime(prep, server);
    if (want('fallback')) await scenarioFallback(prep);
    if (want('context')) await scenarioContext();
  } finally {
    await server.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(BUILD, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
