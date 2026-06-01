# 🎯 Interview AI

> **Ace your coding interviews with AI-powered assistance**

An invisible desktop overlay that captures your screen, analyzes questions with AI (OpenAI/Gemini/Z.AI), and provides instant answers — all without leaving your interview window.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-28-green)
![License](https://img.shields.io/badge/license-MIT-orange)

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/screengenius)

---

## Features

### Smart Screenshot Analysis
- **Full screen capture** — Grab everything with one hotkey
- **Region selection** — Select specific areas for focused analysis
- **Multi-image support** — Queue up to 5 screenshots for context

### Multiple AI Providers
- **OpenAI GPT** — Powerful reasoning and code generation
- **Google Gemini** — Fast responses with great accuracy
- **Z.AI (GLM)** — OpenAI-compatible endpoint support
- **LM Studio** — Local AI models for offline use
- **Flexible selection** — Enable any combination of providers to compare side-by-side

### Document Q&A with Key Info Extraction
- **Import PDFs & text files** — Load study materials, lecture notes
- **Auto-extracts key information** — AI summarizes important facts, formulas, concepts
- **Smart context** — AI answers based on your documents first

### OCR Text Extraction
- **Tesseract OCR** — Extract text from screenshots locally
- **Multi-language support** — English, Vietnamese, and more
- **Automatic for local AI** — Enabled automatically when using LM Studio

### Answer Styles
- **Code mode** — Get clean, working code with explanations
- **Explanation mode** — Detailed step-by-step breakdowns
- **Multiple choice mode** — Just the answer, no fluff

### Built for Speed
- **Global hotkeys** — Works even when app is hidden
- **Invisible overlay** — Stays on top without blocking your screen
- **Clipboard integration** — Copy questions, paste answers instantly

---

## Quick Start

### Prerequisites
- Windows 10/11
- Node.js 18+
- OpenAI API key and/or Google Gemini API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/interview-ai.git
cd interview-ai

# Install dependencies
npm install

# Run the app
npm start
```

### First Time Setup
1. Open the app (it appears as a small window)
2. Go to **Settings** tab
3. Enter your API keys (OpenAI, Gemini, and/or Z.AI)
4. Select which AI providers to enable (checkboxes)
5. Press `Ctrl+Shift+A` to hide the window — it's now invisible!

---

## ⌨Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` | Show/hide the app window |
| `Ctrl+Shift+W` | Toggle mouse events (click-through) |
| `Ctrl+Shift+O` | Toggle overlay |
| `Ctrl+Shift+S` | Take full screenshot |
| `Ctrl+Shift+Z` | Take region screenshot |
| `Ctrl+Shift+X` | Extract text from screenshots (OCR) |
| `Ctrl+Shift+P` | Analyze screenshots with AI |
| `Ctrl+Shift+D` | Clear all screenshots |
| `Ctrl+Shift+Q` | Process clipboard text as prompt |
| `Ctrl+Shift+C` | Copy latest AI response |

---

## How to Use

### During a Coding Interview

1. **Hide the app** — Press `Ctrl+Shift+A` (window becomes invisible)
2. **See a question** — Press `Ctrl+Shift+S` for full screen or `Ctrl+Shift+Z` to select a region
3. **Get the answer** — Press `Ctrl+Shift+P` to analyze
4. **Show the app** — Press `Ctrl+Shift+A` to see the AI response
5. **Copy if needed** — Press `Ctrl+Shift+C` to copy to clipboard

### With Study Materials (PDF/Notes)

1. Go to **Settings → API & Models → Documents**
2. Click **Import document** and select your PDF or text file
3. Wait for key information extraction (shows ✨ when ready)
4. Click **View** to see the extracted key information
5. Click **Activate** to use that document as context
6. Now all your questions will reference this document first!

### Quick Clipboard Mode

1. Copy any question text to clipboard
2. Press `Ctrl+Shift+Q`
3. AI processes it and copies the answer back to clipboard

---

## Configuration

### API Keys
Get your keys from:
- OpenAI: https://platform.openai.com/api-keys
- Gemini: https://makersuite.google.com/app/apikey
- Z.AI: https://z.ai/manage-apikey/apikey-list

### AI Provider Selection
- Go to **Settings → API & Models**
- Check the providers you want to use (OpenAI ✓, Gemini ✓, Z.AI ✓)
- Configure custom model names for each provider
- Click **Save Model Settings**
- All enabled providers will show responses side-by-side

### LM Studio (Local AI)
- Enable LM Studio for offline, free AI responses
- Configure the endpoint (default: `http://localhost:1234/v1`)
- OCR is automatically enabled for text-only local models

### AI Behavior Settings
- **Custom System Prompts** — Define how AI should respond
- **Built-in Templates** — Concise Coder, Interview Helper, Exam Mode, etc.
- **Editable Templates** — Customize or create your own prompt templates
- **Preferred Language** — Set default programming language for code answers

---

## Building for Distribution

```bash
# Build production release
npm run build

# Output appears in release/win-unpacked/
```

---

## Tech Stack

- **Electron** — Cross-platform desktop app
- **Angular** — Frontend UI framework
- **OpenAI API** — GPT models for analysis
- **Google Gemini API** — Alternative AI provider
- **Z.AI / LM Studio** — OpenAI-compatible endpoints
- **Tesseract.js** — Local OCR text extraction
- **KaTeX** — Math equation rendering

---

## Privacy & Security

- ✅ **Local processing** — Your API keys stay on your machine
- ✅ **No data collection** — We don't store or transmit your screenshots
- ✅ **Sandboxed renderer** — Secure architecture with context isolation
- ✅ **Open source** — Audit the code yourself

---

## Troubleshooting

**App not responding to shortcuts?**
- Make sure no other app is using the same hotkeys
- Try running as Administrator

**Screenshots not working?**
- Check Windows privacy settings for screen capture
- Try restarting the app

**API errors?**
- Verify your API keys in Settings
- Check your API quota/billing

**High DPI display issues?**
- The app auto-scales for DPI; if region selection is off, restart the app

---

## ☕ Support

This project is **free and open source**. If it helped you, consider supporting development:

<a href="https://buymeacoffee.com/screengenius">
  <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy me a coffee" />
</a>

Every coffee helps keep the project maintained and improving. Thank you! 🙏

---

## 📄 License

MIT License — feel free to use, modify, and distribute.

---

## Contributing

Pull requests welcome! Please open an issue first to discuss major changes.

---

<p align="center">
  <b>Good luck with your interviews/exams! 🍀</b>
</p>

