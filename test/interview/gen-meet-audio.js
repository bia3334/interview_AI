// Generates a synthetic "interviewer on Google Meet" recording: a 48 kHz mono
// PCM16 WAV with speech-like bursts separated by silence. Chromium plays it
// through its fake capture device so the real listener services can be
// exercised without speakers, a microphone, or a live call.
//
// The bursts are not intelligible speech (no TTS engine is available in CI),
// but they have the properties the energy VAD reacts to: a voiced harmonic
// stack at ~140 Hz with a syllable-rate amplitude envelope, plus some
// breath noise. Silences carry a tiny dither so the noise floor is non-zero,
// like a real loopback capture.
'use strict';
const fs = require('fs');

const SAMPLE_RATE = 48000;

/** Timeline of what the "interviewer" does. Kept in one place so the
 *  assertions in run.js and the mock server agree with the audio. */
const TIMELINE = [
  { kind: 'silence', ms: 1000 },
  { kind: 'speech', ms: 2400, label: 'question 1' },
  { kind: 'silence', ms: 1600 },
  { kind: 'speech', ms: 3000, label: 'question 2' },
  { kind: 'silence', ms: 1600 },
  // A click / keyboard tap: shorter than every VAD's minimum-speech gate
  // (300 ms realtime, 350 ms standard) and must NOT become a transcript.
  // The gates count whole analysis windows (50 ms ticks in standard mode,
  // ~85–95 ms PCM chunks in realtime mode), so a burst is over-counted by up
  // to two windows; 120 ms stays under the gate either way. (A real Meet
  // join chime is ~600 ms and passes all gates — see the notes in run.js.)
  { kind: 'speech', ms: 120, label: 'click' },
  { kind: 'silence', ms: 2280 },
];

function totalMs() {
  return TIMELINE.reduce((s, t) => s + t.ms, 0);
}

function expectedUtterances(minSpeechMs) {
  return TIMELINE.filter((t) => t.kind === 'speech' && t.ms >= minSpeechMs);
}

function synth() {
  const total = Math.round((totalMs() / 1000) * SAMPLE_RATE);
  const out = new Float32Array(total);
  let cursor = 0;
  let seed = 1234567;
  const rnd = () => {
    // xorshift32, deterministic across runs
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };

  for (const part of TIMELINE) {
    const n = Math.round((part.ms / 1000) * SAMPLE_RATE);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      let s = rnd() * 0.001; // room tone / dither
      if (part.kind === 'speech') {
        const f0 = 140 + 12 * Math.sin(2 * Math.PI * 5.5 * t); // vibrato-ish pitch
        let voiced = 0;
        for (let h = 1; h <= 8; h++) voiced += Math.sin(2 * Math.PI * f0 * h * t) / h;
        const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t); // ~4 syllables/s
        const edge = Math.min(1, i / (0.02 * SAMPLE_RATE), (n - i) / (0.02 * SAMPLE_RATE));
        s += (voiced * 0.12 + rnd() * 0.02) * syllable * edge;
      }
      out[cursor + i] = s;
    }
    cursor += n;
  }
  return out;
}

function writeWav(path, samples) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + i * 2);
  }
  fs.writeFileSync(path, buf);
}

function generate(path) {
  writeWav(path, synth());
  return { path, sampleRate: SAMPLE_RATE, totalMs: totalMs() };
}

module.exports = { SAMPLE_RATE, TIMELINE, totalMs, expectedUtterances, generate };

if (require.main === module) {
  const out = process.argv[2] || 'meet-interviewer.wav';
  const info = generate(out);
  console.log(`wrote ${info.path}: ${info.totalMs} ms @ ${info.sampleRate} Hz`);
}
