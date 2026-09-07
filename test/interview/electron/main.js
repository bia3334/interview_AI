// Electron main for the interview audio scenarios. Launched by run.js once
// per scenario (the fake capture file restarts with each process).
//
//   --scenario loopback  the app's real getDisplayMedia + audio:'loopback' path
//   --scenario standard  LiveListenerService: energy VAD → one webm per utterance
//   --scenario realtime  RealtimeListenerService → PCM16 over IPC →
//                        RealtimeTranscriber (one per model) → mock Realtime API
'use strict';
const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const scenario = arg('scenario', 'standard');
const wav = arg('wav');
const outPath = arg('out');
const realtimeUrl = arg('realtime-url', '');
const transcriberPath = arg('transcriber', '');
const runMs = Number(arg('run-ms', '13000'));
const pageDir = arg('page-dir', __dirname);

// Headless container: no GPU, no sandbox, and Chromium's fake capture device
// fed from the synthetic interviewer recording (played once, then silence).
// The loopback scenario deliberately runs without the fake device: it
// reports what the OS really returns for audio:'loopback'.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (scenario !== 'loopback') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  if (wav) app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${wav}%noloop`);
}

const rendererConsole = [];
const transcribers = new Map(); // model → { transcriber, events }
const log = {
  info: (...a) => console.log('[main]', ...a),
  warn: (...a) => console.log('[main:warn]', ...a),
  error: (...a) => console.log('[main:error]', ...a),
};

function finish(code, result) {
  const events = {};
  for (const [model, t] of transcribers) events[model] = t.events;
  const payload = { scenario, result, transcribers: events, rendererConsole };
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  for (const [, t] of transcribers) t.transcriber.stop();
  setTimeout(() => app.exit(code), 300);
}

app.whenReady().then(() => {
  // Same handler as src/main.ts — the app's real answer to getDisplayMedia.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) callback({ video: sources[0], audio: 'loopback' });
      else callback({});
    }).catch((err) => {
      log.error('desktopCapturer.getSources failed:', err);
      callback({});
    });
  });

  if (scenario === 'realtime') {
    const { RealtimeTranscriber } = require(transcriberPath);
    for (const model of ['gpt-live-transcribe', 'gpt-4o-mini-transcribe']) {
      const events = [];
      const t0 = Date.now();
      const transcriber = new RealtimeTranscriber({
        apiKey: 'sk-test',
        model,
        language: 'auto',
        url: realtimeUrl,
        log,
        onEvent: (evt) => events.push({ at: Date.now() - t0, ...evt }),
      });
      transcribers.set(model, { transcriber, events });
      transcriber.start();
    }
  }

  ipcMain.handle('test:config', () => ({ scenario, runMs }));
  // Same channel + shape as src/main/ipc/voice.ts.
  ipcMain.on('realtime:audio', (_event, chunk) => {
    const buf = Buffer.from(chunk);
    for (const [, t] of transcribers) t.transcriber.sendAudio(buf);
  });
  ipcMain.on('test:result', (_event, result) => {
    // Give the transcribers a beat to receive the last `completed` events.
    setTimeout(() => finish(0, result), scenario === 'realtime' ? 1500 : 100);
  });

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    rendererConsole.push({ level, message });
    console.log(`[renderer ${level}] ${message}`);
  });
  win.loadFile(path.join(pageDir, 'index.html'));

  setTimeout(() => {
    log.error(`scenario ${scenario} timed out`);
    finish(2, { ok: false, error: 'timeout' });
  }, runMs + 25000);
});

app.on('window-all-closed', () => app.quit());
