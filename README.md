# Screen Genius

An Electron application designed to assist with exams and programming interviews by using AI to analyze screenshots and provide answers.

## Key Features

### 1. Screenshot Capture and Analysis
- **📸 Full Screenshot**: `Ctrl+Shift+S` shortcut
- **🎯 Region Screenshot**: `Ctrl+Shift+Z` shortcut  
- **Interactive selection**: Drag to select area, ESC to cancel
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

#### Multiple Choice Mode ⭐ NEW
- Provides only the correct answer(s) (e.g., "a" or "a, c")
- No explanations or reasoning
- Suitable for multiple choice exams
- Short and direct responses

### 3. Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+A` | Show/hide window |
| `Ctrl+Shift+S` | 📸 Take full screenshot |
| `Ctrl+Shift+Z` | 🎯 Take region screenshot |
| `Ctrl+Shift+P` | Analyze screenshots |
| `Ctrl+Shift+L` | Switch answer mode (Code ↔ Explanation ↔ Multiple Choice) |
| `Ctrl+Shift+M` | Switch AI model (OpenAI ↔ Gemini ↔ Both) |
| `Ctrl+Shift+1` | Switch OpenAI model to GPT-5 |
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

## How to Use Smart Capture (Recommended) 🧠

### Setup (One-time only):
1. **Install Tampermonkey** browser extension
2. **Install our bypass script**: `copy-protection-bypass.js`
3. **Script auto-runs** on all websites to bypass copy protection

### One-Click Solution:
1. **Navigate** to the page with the question/problem
2. **Press** `Ctrl+Shift+Z` or click "🧠 Smart Capture" button
3. **Automatically** tries all methods in sequence:
   - 🌐 **Text Extraction** (bypasses copy protection via userscript)
   - 📋 **Clipboard** (if you copied text manually)
   - 📸 **Screenshot** (AI vision analysis as fallback)
4. **AI processes** and **auto-copies** the best response!

### Manual Copy Protection Bypass:
- **Auto-bypass**: Script runs automatically on page load
- **Manual trigger**: `Ctrl+Shift+B` to manually bypass protection
- **Extract & Copy**: `Ctrl+Shift+X` to extract text and copy to clipboard

## How to Bypass Copy Protection (Manual) ⭐

### Method 1: Text Extraction (Recommended)
1. **Navigate** to the website with protected text
2. **Press** `Ctrl+Shift+E` or click "🌐" button
3. **AI automatically** extracts and processes the text
4. **Result** appears instantly in both OpenAI and Gemini responses

### Method 2: Screenshot Analysis (Fallback)
1. **Take screenshot** with `Ctrl+Shift+S` when text extraction fails
2. **Process** with `Ctrl+Shift+P` for AI analysis
3. **Works with** images, PDFs, and complex layouts

### What Copy Protections are Bypassed:
- ✅ CSS `user-select: none`
- ✅ JavaScript right-click disable
- ✅ Text selection blocking
- ✅ Overlay elements preventing selection
- ✅ Most exam platform protections

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

