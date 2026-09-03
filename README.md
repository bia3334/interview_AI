# Screen Genius

A free desktop app that reads your screen or listens to your call, asks the AI you choose, and shows the answer in a window that screen shares and recordings cannot see.

Windows and macOS. Bring your own API key, or run fully offline with LM Studio.

**Website:** https://screen-genius.vercel.app · **Downloads:** [Releases](https://github.com/bia3334/interview_AI/releases)

## Two modes

Pick one when the app opens. Both are hidden from screen capture.

| | Exam | Interview |
|---|---|---|
| For | Anything on your screen | Anything you hear |
| Window | See-through, click-through, hotkeys only | Larger readable panel, always clickable |
| Input | Full or region screenshot, on-device OCR, clipboard | System audio from the call (Zoom, Meet, Teams) |
| Output | Several providers side by side, formatted code and math | One provider, spoken-style answer in English or Vietnamese |
| Listening | — | Realtime streaming (OpenAI Realtime API) or file-based (Whisper / Gemini) with a local pause detector |

## What's inside

- **Five providers** — OpenAI, Google Gemini, Claude, Z.AI (GLM) and local LM Studio. Enable any mix and compare answers in parallel columns.
- **Capture** — full screen or DPI-accurate region crop, up to five screenshots per question.
- **OCR** — Tesseract runs on your machine and turns screenshots into text before sending. Auto-enabled for text-only local models.
- **Live listening** — records the audio coming out of your call, not just your mic. Transcribes and answers in the language the question was asked in.
- **Documents** — import PDF, Word, Excel, PowerPoint, CSV, JSON or text. Key points are extracted on import and used as context.
- **Notes** — Markdown, highlighted code and KaTeX math, rendered live. Attach a note as context or show it beside answers.
- **Answer styles** — code with explanation, detailed walkthrough, or multiple-choice letter only. Multi-turn follow-ups and saved system-prompt templates.
- **History and cost** — every Q&A saved locally, searchable, taggable, exportable to Markdown or JSON. Token and cost totals per provider.
- **Privacy** — OS-level content protection, click-through mode, a panic key that wipes and quits. No account, no telemetry.

## Install

Download the installer from [Releases](https://github.com/bia3334/interview_AI/releases):

- **Windows** — `Screen.Genius.Setup.<version>.exe` (Windows 10 / 11, 64-bit)
- **macOS** — `ScreenGenius-arm64.dmg` (Apple Silicon) or `ScreenGenius-x64.dmg` (Intel). The build is unsigned: on first launch, right-click the app and choose Open.

First run:

1. Pick **Exam** or **Interview** on the launch screen.
2. Open **Settings** and paste at least one API key, or enable LM Studio (default endpoint `http://localhost:1234/v1`).
3. Tick the providers you want and press **Test** next to each.
4. Press `Ctrl+Shift+A` to hide the window. It is excluded from screen shares whether shown or hidden.

Interview mode needs an OpenAI key for realtime transcription, or an OpenAI or Gemini key for file-based transcription.

## Shortcuts

All global, all work while the window is hidden, all rebindable in Settings.

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+A` | Show or hide the window |
| `Ctrl+Shift+W` | Toggle click-through |
| `Ctrl+Shift+O` | Toggle the floating answer bubble |
| `Ctrl+Shift+S` | Full screenshot |
| `Ctrl+Shift+Z` | Region screenshot |
| `Ctrl+Shift+X` | Extract text from screenshots (OCR) |
| `Ctrl+Shift+V` | Start or stop listening |
| `Ctrl+Shift+P` | Ask the AI (screenshots, or the pending transcript in Interview mode) |
| `Ctrl+Shift+Q` | Use clipboard text as the question |
| `Ctrl+Shift+D` | Clear screenshots |
| `Ctrl+Shift+C` | Copy the latest answer |
| `Ctrl+Shift+Backspace` | Panic: wipe screenshots, answers and clipboard, then quit |

## Run from source

Requires Node.js 22 and npm.

```bash
git clone https://github.com/bia3334/interview_AI.git
cd interview_AI
npm install
npm start          # builds Angular, compiles the main process, launches Electron
```

Package a release:

```bash
npm run build      # Windows installer → release/
npm run build:mac  # macOS .dmg (or push a v* tag to build on GitHub Actions)
```

Electron 29 + Angular 21. Architecture notes for contributors are in [CLAUDE.md](CLAUDE.md).

## API keys

- OpenAI: https://platform.openai.com/api-keys
- Gemini: https://aistudio.google.com/app/apikey
- Claude: https://console.anthropic.com/settings/keys
- Z.AI: https://z.ai/manage-apikey/apikey-list
- LM Studio: no key, run a local server on port 1234

Keys are stored on your machine and only ever sent to the provider they belong to.

## Troubleshooting

- **Shortcuts do nothing** — another app owns the same hotkey. Rebind in Settings or close the other app.
- **Screenshots are blank** — check the OS screen-recording permission for the app (macOS: System Settings → Privacy & Security → Screen Recording).
- **No audio in Interview mode** — the app captures system audio through the OS loopback, not the microphone. This works out of the box on Windows. On macOS, install a loopback audio device such as BlackHole.
- **API errors** — press Test next to the provider in Settings. Most failures are a wrong model name or an exhausted quota.

## Support

Free and open source. If it helped you, [buy me a coffee](https://buymeacoffee.com/screengenius).

## License

MIT.

Screen Genius is a productivity and learning tool. Use it responsibly and within the rules that apply to you, including the terms of any exam, interview or platform you use it alongside.
