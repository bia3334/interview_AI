# Screen Genius

An Electron application designed to assist with exams and programming interviews by using AI to analyze screenshots and provide answers.

## Key Features

### 1. Screenshot Capture and Analysis
- Quick screenshot capture with `Ctrl+Shift+S` shortcut
- AI-powered screenshot analysis (OpenAI GPT-4 and Google Gemini)
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

#### Multiple Choice Mode ⭐ NEW
- Provides only the correct answer(s) (e.g., "a" or "a, c")
- No explanations or reasoning
- Suitable for multiple choice exams
- Short and direct responses

### 3. Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+A` | Show/hide window |
| `Ctrl+Shift+S` | Take screenshot |
| `Ctrl+Shift+P` | Analyze screenshots |
| `Ctrl+Shift+L` | Switch answer mode (Code ↔ Explanation ↔ Multiple Choice) |
| `Ctrl+Shift+M` | Switch AI model (OpenAI ↔ Gemini ↔ Both) |
| `Ctrl+Shift+1` | Switch OpenAI model to GPT-4o |
| `Ctrl+Shift+2` | Switch OpenAI model to GPT-4.1 |
| `Ctrl+Shift+Q` | Process clipboard text |
| `Ctrl+Shift+C` | Copy response to clipboard |
| `Ctrl+Shift+D` | Delete all screenshots |

### 4. Settings

#### API Keys
- **OpenAI API Key**: For using GPT-4
- **Gemini API Key**: For using Google Gemini

#### Preferences
- **Programming Language**: Preferred programming language
- **Default AI Model**: Default AI model (OpenAI/Gemini/Both)
- **Answer Style**: Default answer mode

## How to Use Multiple Choice Mode

1. **Select mode**: Go to Settings → Answer Style → Choose "Multiple Choice (answer only)"
2. **Or use shortcut**: `Ctrl+Shift+L` to switch modes
3. **Take screenshot**: Capture the multiple choice question
4. **Analyze**: AI will return only the correct answer(s) (e.g., "a" or "a, c")

## Notes

- Application works completely offline (only sends data to OpenAI/Google APIs)
- API keys are stored locally and never sent to our servers
- Window can be completely hidden to avoid detection

## Installation

```bash
npm install
npm run build
npm start
```

## License

MIT License

