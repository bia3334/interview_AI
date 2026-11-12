# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron + Angular desktop app ("Screen Genius / Open Interview Coder") that runs invisibly over the screen, captures screenshots, and queries AI providers (OpenAI, Gemini, Z.AI, LM Studio) for assistance. Windows is the primary target.

## Commands

```bash
npm start          # Dev: builds Angular → compiles TS → copies HTMLs → launches Electron
npm run dev        # Alias for npm start
npm run ng:build   # Build Angular only (dev)
npm run build      # Production (Windows): Angular (prod) → TS compile → electron-builder → release/
npm run build:mac  # Production (macOS): Angular (prod) → TS compile → electron-builder → release/*.dmg
npm run clean      # Clean dist/
```

## CI/CD Workflows

- `.github/workflows/ci.yml`: Pre-merge check running on PRs to `main` (validates TS compile, Angular prod build, asset scripts, and cross-platform packaging).
- `.github/workflows/release.yml`: After-merge CD workflow running on push to `main` (or version tags / manual dispatch). Auto-computes semver, packages Windows and macOS binaries, and publishes a new GitHub Release with auto-generated release notes.
- `scripts/prepare-release.js`: Computes next semver tag from git tags / commit message conventions.

## Architecture

The codebase has three layers that communicate through a strict bridge pattern:

**Main Process** (`src/main/`) — Electron backend. Orchestrated from `src/main.ts`. Logic is split into:
- `ipc/` — IPC handler modules (ai, screenshots, overlay, documents, files, preferences, voice)
- `ai/` — API clients for each provider (`clients.ts`) and prompt templates (`prompts.ts`)
- `network.ts` — outbound proxy: resolves the system proxy per provider host through Chromium (`HTTPS_PROXY` overrides) and hands clients an agent via `getProxyAgent(url)`. Every new provider client (OpenAI SDK `httpAgent`, node-fetch `agent`, ws `agent`) must pass it, or it fails with "Connection error" behind a corporate proxy
- `window.ts` — window creation, visibility toggling, click-through mode
- `store.ts` — `electron-store` wrapper for persistent user preferences
- `shortcuts.ts` — debounced global keyboard shortcut registration
- `constants/` — `IPC_CHANNELS`, `AI_MODELS`, `AI_PROVIDER`, `MAX_SCREENSHOTS` (5), shortcut definitions

**Preload Bridge** (`src/preload/`) — Implements `contextBridge.exposeInMainWorld()` to safely expose IPC to the renderer. **Both files must stay in sync**: `index.ts` (impl) ↔ `types.d.ts` (TypeScript interface). Failing to sync them breaks the Angular build.

**Renderer** (`src/app/`) — Angular UI. Never calls Node APIs directly.
- `services/electron.service.ts` — the single bridge to the main process; wraps all IPC calls and exposes RxJS `Subject`/`BehaviorSubject` for reactive updates
- `components/` — prompt-tab (input + screenshot queue), settings-tab, history-tab, shortcuts-tab, toast

**Shared Types** — IPC payload types live in `src/preload/types.d.ts` (imported with `import type` from the renderer; a value import breaks the Angular build because the `.d.ts` has no runtime module).

**App Modes** — On launch the renderer shows a picker (`components/mode-select`) and the user chooses one of two modes (`src/app/constants/app-mode.ts`, persisted as `appMode` in the store only to preselect next time):
- `exam` — the stealth overlay: tabs (prompt/history/settings/shortcuts), click-through window, screenshots/OCR, multi-provider panels, overlay bubble.
- `interview` — `components/interview`: a floating assistant for live calls. The shell hides its header/footer in this mode; the component draws its own command bar (the drag region: Listen + clock, Interview/Meeting switch, Assist/Ask, settings, fold, switch mode, hide, quit) over a glass panel with five views: Assist, Transcript, Notes, Sessions, Settings. `body.mode-interview` (in `styles/app.css`) sets the `--iv-*` colour tokens and makes the window ground transparent; model-written HTML (answers, notes) is styled there too because component styles are scoped. Content protection stays on.
  - **Session kind** (`interviewSessionKind`): `interview` (I am the candidate; each transcribed question is auto-answered via `generateInterviewPrompt`) or `meeting` (nothing is auto-answered; quick actions work on the recent transcript). Both go through the `sendInterviewPrompt` IPC, which takes `sessionKind`, `action` (`answer|assist|say-next|follow-up|recap`) and `transcript`; prompts live in `src/main/ai/meeting.ts` (pure: `generateAssistPrompt`, `generateMeetingNotesPrompt`, session types and Markdown export).
  - **Notes**: `generateMeetingNotes` IPC gets the notes so far plus only the transcript lines added since and returns the full updated notes (cost stays flat over a long meeting). With `interviewAutoNotes` the component refreshes about once a minute while listening and runs a `final` pass (adds a `# ` title) when listening stops.
  - **Sessions**: `src/main/ipc/meeting.ts` stores one JSON file per session under `<userData>/meetings/` (`listMeetingSessions/getMeetingSession/saveMeetingSession/deleteMeetingSession/exportMeetingSession`); the component saves after every answer and notes update. Ids become file names, so `isSafeSessionId` gates every path.
  - **Window**: interview mode has its own compact geometry (`interviewWindowBounds`, default 920x700 top-centre) kept apart from the exam overlay's `windowPosition`/`windowSize`; `window.ts#applyAppMode` swaps them and `setInterviewPanelCollapsed` shrinks the window to the bar.
  - **Audio** comes from `services/call-audio.ts#captureCallAudio(source, { includeMic })` — `interviewAudioSource` is `'loopback'` (Windows system audio via `setDisplayMediaRequestHandler`), `'default'` or an input deviceId (BlackHole on macOS, or a microphone; `requestMicrophoneAccess` IPC asks macOS first). `interviewIncludeMic` mixes the default microphone into a loopback capture so my side is transcribed too (no speaker labels); streams must be stopped with `releaseCallAudio`. Two listening modes (`interviewListenMode`): **standard** — `services/live-listener.service.ts` captures audio, cuts utterances with a local energy VAD, each is transcribed as a file (`transcribe-audio`, language `auto|en|vi`); **realtime** — `services/realtime-listener.service.ts` streams 24 kHz PCM16 over `realtime:audio` to `src/main/audio/realtime-transcription.ts`, a `ws` client for the OpenAI Realtime API transcription session (server VAD; `realtime-transcript` events `delta/completed/speech_started/...` back to the renderer; GA `session.update` shape with a one-shot fallback to the pre-GA `transcription_session.update`). Ctrl+Shift+V toggles listening and Ctrl+Shift+P answers the pending transcript (Assist in a meeting); same global shortcuts as exam, only the active mode's component subscribes.
- `src/main/ipc/mode.ts` owns `getAppMode/setAppMode/getInterviewSettings/saveInterviewSettings/setInterviewPanelCollapsed`; `window.ts#applyAppMode` switches click-through. The window starts interactive so the picker is clickable; choosing Exam re-applies stealth.
- Interview background context (the candidate's CV, the job description, notes): `src/main/ai/interview-context.ts` (pure types + `buildInterviewContextPrefix`), `src/main/ipc/interview-context.ts` (`getInterviewContext/saveInterviewContext/importInterviewContextFile`, store key `interviewContext`). `sendInterviewPrompt` and `generateMeetingNotes` prefix it ahead of any exam-mode document context; with `kind: 'meeting'` the same slots are labelled About me / Meeting brief / Notes. The interview component's Settings view edits the three slots (file import via `readDocumentContent`, or pasted text).

**Extra Windows** — `src/overlay.html` (floating AI answer bubble) and `src/region-selection.html` (transparent fullscreen crop tool) are copied to `dist/angular/` during build.

## Key Patterns

**IPC Protocol (strict)** — All handlers must return `{ success: boolean, data?: T, error?: string }`. Never throw across the IPC bridge; catch in Main, log with `electron-log`, return `{ success: false, error: '...' }`. The Angular service must check `res.success` before updating state.

**Adding a new IPC channel:**
1. Define payload interface in `src/shared/types.ts`
2. Register handler in `src/main/ipc/`, add channel name to `IPC_CHANNELS` in `src/main/constants/app.ts`
3. Declare in `src/preload/types.d.ts`, expose in `src/preload/index.ts`
4. Call via `ElectronService` in Angular

**State:** Renderer uses RxJS `BehaviorSubject`; Main uses `electron-store`.

**Security:** `contextIsolation: true`, `nodeIntegration: false`, `setContentProtection(true)`.

## Gotchas

- **Windows file locking**: Use `safeDeleteFile()` with retry logic when deleting screenshots immediately after capture.
- **DPI scaling**: Region selection coordinates must be multiplied by `screen.getPrimaryDisplay().scaleFactor` before cropping.
- **Preload sync**: Any change to `src/preload/index.ts` must have a matching update in `src/preload/types.d.ts`.
- **Build output**: Dev builds go to `dist/`; packaged releases go to `release/`.

## Global Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+A` | Toggle main window visibility |
| `Ctrl+Shift+W` | Toggle click-through mode |
| `Ctrl+Shift+O` | Toggle overlay bubble |
| `Ctrl+Shift+S` | Full screenshot |
| `Ctrl+Shift+Z` | Region screenshot |
| `Ctrl+Shift+X` | OCR extract text |
| `Ctrl+Shift+P` | Analyze screenshots with AI |
| `Ctrl+Shift+D` | Clear screenshots |
| `Ctrl+Shift+Q` | Clipboard text as prompt |
| `Ctrl+Shift+C` | Copy latest AI response |
| `Ctrl+Shift+Backspace` | Panic: wipe screenshots/response/clipboard and quit instantly |
