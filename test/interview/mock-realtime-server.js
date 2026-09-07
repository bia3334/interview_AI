// Minimal stand-in for the OpenAI Realtime API transcription session
// (wss://api.openai.com/v1/realtime?intent=transcription), enough to drive
// src/main/audio/realtime-transcription.ts end to end without a key.
//
// It speaks both wire shapes the client knows:
//   GA      — session.update { session: { type: 'transcription', audio: ... } }
//   pre-GA  — transcription_session.update { session: { input_audio_format, ... } }
// and both turn-detection styles:
//   client VAD (turn_detection null) — the client sends input_audio_buffer.commit
//   server VAD                        — this server runs an energy VAD on the
//                                       appended PCM and emits speech_started /
//                                       speech_stopped / completed itself.
// Transcripts are synthetic, but each one reports how much speech the server
// actually heard, which is what the assertions check.
'use strict';
const { WebSocketServer } = require('ws');

const SAMPLE_RATE = 24000;
const MIN_THRESHOLD = 0.012;

function rms(pcm16) {
  const n = Math.floor(pcm16.length / 2);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = pcm16.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

function start(options = {}) {
  const { rejectGa = false, minSpeechMs = 300, log = () => {} } = options;
  const connections = [];

  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    wss.on('error', reject);
    wss.on('listening', () => {
      const { port } = wss.address();
      resolve({
        port,
        url: `ws://127.0.0.1:${port}/v1/realtime?intent=transcription`,
        connections,
        close: () => new Promise((res) => wss.close(() => res())),
      });
    });

    wss.on('connection', (ws, req) => {
      const conn = {
        index: connections.length,
        headers: {
          authorization: req.headers['authorization'] || null,
          openaiBeta: req.headers['openai-beta'] || null,
        },
        protocol: null, // 'ga' | 'legacy'
        rejectedGa: false,
        turnDetection: undefined, // null → client VAD, object → server VAD
        model: null,
        language: undefined,
        received: {}, // message type → count
        utterances: [],
        errorsSent: [],
        // audio accounting since last commit / completed
        bufferedMs: 0,
        speechMs: 0,
        speechActive: false,
        lastSpeechAt: 0,
        noiseFloor: 0.008,
        utteranceIndex: 0,
      };
      connections.push(conn);

      const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
      const silenceMs = () => (conn.turnDetection && conn.turnDetection.silence_duration_ms) || 650;

      const finishUtterance = () => {
        const n = ++conn.utteranceIndex;
        const itemId = `item_${conn.index}_${n}`;
        const record = {
          n,
          itemId,
          speechMs: Math.round(conn.speechMs),
          bufferedMs: Math.round(conn.bufferedMs),
          mode: conn.turnDetection ? 'server_vad' : 'client_vad',
        };
        conn.utterances.push(record);
        const transcript = `[mock] utterance ${n}: ${record.speechMs} ms speech in ${record.bufferedMs} ms audio`;
        // Stream a few deltas the way gpt-live-transcribe does, then the final.
        for (const word of transcript.split(' ')) {
          send({ type: 'conversation.item.input_audio_transcription.delta', item_id: itemId, delta: `${word} ` });
        }
        send({ type: 'conversation.item.input_audio_transcription.completed', item_id: itemId, transcript });
        log(`mock#${conn.index}: completed ${transcript}`);
        conn.bufferedMs = 0;
        conn.speechMs = 0;
        conn.speechActive = false;
      };

      // Server-side turn detection (only when the client asked for server VAD).
      const serverVad = (level, chunkMs) => {
        const now = Date.now();
        const threshold = Math.max(MIN_THRESHOLD, conn.noiseFloor * 3);
        if (level > threshold) {
          if (!conn.speechActive) {
            conn.speechActive = true;
            send({ type: 'input_audio_buffer.speech_started', item_id: `item_${conn.index}_${conn.utteranceIndex + 1}` });
          }
          conn.lastSpeechAt = now;
          conn.speechMs += chunkMs;
        } else {
          conn.noiseFloor = conn.noiseFloor * 0.95 + level * 0.05;
          if (conn.speechActive && now - conn.lastSpeechAt >= silenceMs()) {
            conn.speechActive = false;
            send({ type: 'input_audio_buffer.speech_stopped', item_id: `item_${conn.index}_${conn.utteranceIndex + 1}` });
            if (conn.speechMs >= minSpeechMs) finishUtterance();
            else { conn.speechMs = 0; conn.bufferedMs = 0; }
          }
        }
      };

      // Speech accounting for client-VAD sessions (no events, just measurement).
      const measure = (level, chunkMs) => {
        const threshold = Math.max(MIN_THRESHOLD, conn.noiseFloor * 3);
        if (level > threshold) conn.speechMs += chunkMs;
        else conn.noiseFloor = conn.noiseFloor * 0.95 + level * 0.05;
      };

      send({ type: 'session.created', session: { id: `sess_${conn.index}` } });

      ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        conn.received[msg.type] = (conn.received[msg.type] || 0) + 1;

        switch (msg.type) {
          case 'session.update': {
            if (rejectGa && !conn.rejectedGa) {
              conn.rejectedGa = true;
              const message = "Unknown parameter: 'session.type'.";
              conn.errorsSent.push(message);
              send({ type: 'error', error: { type: 'invalid_request_error', message } });
              return;
            }
            const input = (msg.session && msg.session.audio && msg.session.audio.input) || {};
            conn.protocol = 'ga';
            conn.model = input.transcription && input.transcription.model;
            conn.language = input.transcription && input.transcription.language;
            conn.turnDetection = input.turn_detection === undefined ? null : input.turn_detection;
            send({ type: 'session.updated', session: msg.session });
            break;
          }
          case 'transcription_session.update': {
            const s = msg.session || {};
            conn.protocol = 'legacy';
            conn.model = s.input_audio_transcription && s.input_audio_transcription.model;
            conn.language = s.input_audio_transcription && s.input_audio_transcription.language;
            conn.turnDetection = s.turn_detection === undefined ? null : s.turn_detection;
            send({ type: 'transcription_session.updated', session: s });
            break;
          }
          case 'input_audio_buffer.append': {
            const pcm = Buffer.from(msg.audio || '', 'base64');
            const chunkMs = (pcm.length / 2 / SAMPLE_RATE) * 1000;
            conn.bufferedMs += chunkMs;
            const level = rms(pcm);
            if (conn.turnDetection) serverVad(level, chunkMs);
            else measure(level, chunkMs);
            break;
          }
          case 'input_audio_buffer.commit': {
            if (conn.bufferedMs < 100) {
              const message = 'Error committing input audio buffer: buffer too small.';
              conn.errorsSent.push(message);
              send({ type: 'error', error: { type: 'invalid_request_error', message } });
              return;
            }
            finishUtterance();
            break;
          }
          default:
            break;
        }
      });
    });
  });
}

module.exports = { start, rms };
