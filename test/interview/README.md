# Interview mode audio test (Google Meet style call)

`npm run test:interview` exercises the interview-mode listening pipeline the
way a Google Meet / Zoom / Teams call feeds it, without speakers, a
microphone, an API key or a live call. It launches the real Electron/Chromium
under Xvfb (or the current display), plays a synthetic "interviewer"
recording through Chromium's fake capture device, and drives the app's own
services on the `default` input-device source (the same `getUserMedia` path
macOS uses through BlackHole, or a microphone):

| Scenario | What runs | What is checked |
|---|---|---|
| `loopback` | The untouched app path: `getDisplayMedia` answered by `setDisplayMediaRequestHandler` with `audio: 'loopback'` | Windows: a system audio track is returned (the shipped WASAPI path). Elsewhere the result is informational: the request must resolve or fail cleanly with the app's own message. Electron documents loopback audio as Windows-only; Linux Electron 29 still returns a track, and a container without an audio backend gets Chromium's fake test-tone input, so only a Windows run proves real capture. |
| `standard` | `LiveListenerService` (energy VAD, `MediaRecorder`) | One decodable `audio/webm;codecs=opus` file per utterance, each containing the whole question; a 120 ms click is dropped; capture does not end on its own. |
| `realtime` | `RealtimeListenerService` → `realtime:audio` IPC → `RealtimeTranscriber` (one per model) → mock Realtime API | 24 kHz PCM16 streamed for the whole call; GA `session.update` accepted; `gpt-live-transcribe` (client VAD) commits once per utterance and streams deltas; `gpt-4o-mini-transcribe` (server VAD) relays speech_started/stopped; each utterance reaches the server with the right amount of speech; no error events. |
| `fallback` | `RealtimeTranscriber` against a mock that rejects the GA session shape (node only) | One reconnect with the pre-GA protocol and `OpenAI-Beta` header, language hint forwarded, audio buffered during the reconnect still transcribed. |
| `context` | `buildInterviewContextPrefix` from `src/main/ai/interview-context.ts` (node only) | Empty context → empty prefix; CV, JD and notes emitted with headers and the no-invented-facts rule; oversized slots clipped with a marker; malformed store values coerced. |
| `meeting` | `src/main/ai/meeting.ts` and the session files of `src/main/ipc/meeting.ts` (node only) | Quick-action prompts carry the recent transcript (its end, when long), the action and the language rule; the notes prompt sends the previous notes plus only the new lines, and the final pass asks for a title; sessions are written atomically with a derived title, listed newest first, exported as one Markdown document, and unsafe ids never reach the file system. |

Run one scenario with `node test/interview/run.js --only realtime` (or `context` / `meeting`, which need no Electron).

## Files

- `gen-meet-audio.js` — writes the 12 s, 48 kHz interviewer WAV. The `TIMELINE`
  (question 1 = 2.4 s, pause, question 2 = 3.0 s, pause, 120 ms click) is the
  single source of truth for the assertions.
- `mock-realtime-server.js` — stand-in for `wss://api.openai.com/v1/realtime?intent=transcription`
  speaking both the GA and pre-GA shapes and both turn-detection styles.
  Transcripts are synthetic but report how much speech the server heard.
- `electron/main.js`, `electron/preload.js`, `electron/renderer.ts` — the
  Electron harness. `renderer.ts` imports the real services from
  `src/app/services`; `run.js` bundles it with esbuild (shipped with the
  Angular CLI) and shims `@angular/core`.
- `.build/` — generated bundle, WAV and per-scenario JSON results (gitignored).

## What this does not cover

- Speech recognition quality. The bursts are speech-shaped noise, so Whisper /
  Gemini / the Realtime models are never called; transcription itself needs a
  key and a real voice.
- The `InterviewComponent` debounce and answer flow (Angular component, no
  TestBed here) and the `sendInterviewPrompt` provider calls.
- Windows WASAPI loopback itself. In CI the `loopback` scenario documents the
  non-Windows behaviour; on a Windows machine it verifies the real path.

## Google Meet notes (from the code and this run)

- Meet's audio reaches the app through the OS loopback of the **default
  output device**, so it works with speakers or headphones as long as Chrome
  plays Meet on the default device. If Meet's speaker setting points at
  another device, the loopback hears nothing.
- Only the far end is captured: the candidate's own microphone is not part of
  the output mix, so their answers do not get transcribed and re-answered.
- Meet's join/leave chime (~0.6 s) is longer than the VAD gates (300/350 ms)
  and is sent to the transcriber like any utterance; Whisper usually returns
  an empty string for it, which the component discards.
- The window has `setContentProtection(true)`, so a Meet screen or window
  share does not show it.
- macOS: Electron's `audio: 'loopback'` is Windows-only. The Source picker
  falls back to input devices there: install BlackHole, set a Multi-Output
  Device (speakers + BlackHole) as the system output and pick BlackHole.
- Call on another device (a phone on speaker): pick a microphone as the
  source. It hears the candidate too, so answer on demand.
