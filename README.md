# Screen Genius

An Electron application designed to assist with exams and programming interviews by using AI to analyze screenshots and provide answers.

## Key Features

### 1. Screenshot Capture and Analysis
- **📸 Full Screenshot**: `Ctrl+Shift+S` shortcut
- **🎯 Region Screenshot**: `Ctrl+Shift+Z` shortcut (no UI button; invisible overlay)
- **Selection**: Drag to select area; press ESC to cancel
- **AI-powered analysis**: OpenAI GPT-5 and Google Gemini Vision
- Support for up to 5 screenshots simultaneously



### 2. Three Answer Modes

#### Code Mode
- Provides brief explanation of algorithm/data structure
- Includes complete code implementation
- Suitable for programming interviews

#### Explanation Mode
- Provides detailed answers
- Includes reasoning and analysis
- Suitable for theoretical questions

#### Multiple Choice Mode
- Provides only the correct answer(s) (e.g., "a" or "a, c")
- No explanations or reasoning
- Suitable for multiple choice exams
- Short and direct responses

### 3. Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+A` | Show/hide window |
| `Ctrl+Shift+S` | 📸 Take full screenshot |
| `Ctrl+Shift+Z` | 🎯 Take region screenshot (invisible overlay) |
| `Ctrl+Shift+P` | Analyze screenshots |
| `Ctrl+Shift+L` | Switch answer mode (Code ↔ Explanation ↔ Multiple Choice) |
| `Ctrl+Shift+M` | Switch AI model (OpenAI ↔ Gemini ↔ Both) |
| `Ctrl+Shift+Q` | Process clipboard text |
| `Ctrl+Shift+C` | Copy response to clipboard |
| `Ctrl+Shift+D` | Delete all screenshots |

### 4. Settings

#### API Keys
- **OpenAI API Key**: For using GPT-4/5
- **Gemini API Key**: For using Google Gemini

#### Preferences
- **Programming Language**: Preferred programming language
- **Default AI Model**: Default AI model (OpenAI/Gemini/Both)
- **Answer Style**: Default answer mode

## Usage

1. Use `Ctrl+Shift+S` to capture a full screenshot, or `Ctrl+Shift+Z` to capture a region.
   - Region capture uses an invisible overlay: just click-drag to select; press ESC to cancel.
2. Press `Ctrl+Shift+P` to analyze the current screenshots with the selected model(s).
3. Optionally, copy the latest AI response with `Ctrl+Shift+C`.
4. You can also process text already in your clipboard using `Ctrl+Shift+Q`.

## Notes

- Application sends screenshots/questions only to the configured AI provider(s) for processing.
- API keys are stored locally and never sent to our servers.
- The window can be hidden to avoid distraction.

## Installation

```bash
npm install
npm run build
npm start
```

## License

MIT License

