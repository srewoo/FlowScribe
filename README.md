# FlowScribe - AI-Powered Test Automation Recorder

FlowScribe is a Chrome extension that records browser interactions and generates test automation scripts for popular frameworks like Playwright, Selenium, Cypress, and Puppeteer.

## ✨ Recent Improvements

This extension has been **completely refactored** for better maintainability:

- **Consolidated Components**: Merged 3 popup versions and 3 background scripts into single unified implementations
- **Modern Build System**: Replaced custom build script with standard Webpack configuration
- **Static Modules**: Converted dynamically generated code to maintainable static files
- **Clean Architecture**: Removed duplicate files and unnecessary development tools
- **Single Source of Truth**: Consolidated manifest files and removed redundant configurations

## ✨ Key Features

### 🤖 AI-Powered Recording
- **Smart Element Detection**: Automatically identifies the best selectors for reliable test automation
- **Context-Aware Recording**: Understands user intent and generates meaningful test steps
- **Optional AI Enhancement**: Bring your own OpenAI, Anthropic, or Google AI key to refine generated scripts

### 🎯 Multi-Framework Support
- **Playwright** (TypeScript/JavaScript)
- **Selenium** (Java, Python, C#, JavaScript)
- **Cypress** (TypeScript/JavaScript)
- **Puppeteer** (JavaScript)

### 🔧 Advanced Capabilities
- **Network Monitoring**: Capture and validate API requests/responses (sensitive headers redacted)
- **Page Object Generation**: Automatically create maintainable page object models
- **Cross-Frame Recording**: Works seamlessly with iframes and complex SPAs

## 🛠️ Installation

### Manual Installation (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/your-org/flowscribe.git
   cd flowscribe
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist-chrome` folder from your project directory

4. Verify installation:
   - You should see the FlowScribe icon (🎯 FS) in your Chrome toolbar
   - Click it to open the popup interface

### Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store once published.

## 📖 Quick Start

### First Test Recording

1. **Open any web page** you want to practice on (a login form or to-do app works well)

2. **Start Recording**: 
   - Click the FlowScribe icon in your toolbar
   - Select your preferred framework (Playwright, Selenium, Cypress, or Puppeteer)
   - Click "Start Recording" 

3. **Perform Actions**: 
   - Fill out the form fields on the test page
   - Click buttons, check boxes, select dropdowns
   - Try interacting with the iframe content

4. **Stop Recording**: 
   - Click "Stop Recording" in the FlowScribe popup
   - Review the captured actions in the popup

5. **Generate Script**: 
   - Click "Generate Script"
   - Copy the generated code to your testing project
   - Run it in your chosen testing framework

### Production Usage

1. **Navigate to Your App**: Go to the web application you want to test
2. **Record User Journey**: Follow the same process as above on your actual application
3. **Review Actions**: Check that all important interactions were captured
4. **Generate & Customize**: Generate the script and customize as needed for your test suite

## 🎮 Usage Guide

### Recording Your First Test
1. Navigate to the web page you want to test
2. Open FlowScribe popup
3. Select your preferred framework (Playwright, Selenium, etc.)
4. Click "Start Recording"
5. Perform your test scenario (clicks, form fills, navigation)
6. Click "Stop Recording"
7. Review captured actions in the "Actions" tab
8. Click "Generate Script" to create your test code

### Advanced Features
- **Element Inspector**: Pick any element on the page and preview the selector FlowScribe would use
- **AI Script Enhancement**: Optionally refine generated scripts with your own AI provider key
- **Network Capture**: Record API calls and generate mocks for your framework
- **Page Object Models**: Generate maintainable page object classes alongside your test

## ⚙️ Configuration

### AI Settings
Configure your preferred AI provider in Settings:
- **OpenAI**: GPT-4.1, GPT-4.1-mini, GPT-4.1-nano
- **Anthropic**: Claude Sonnet 4.5, Claude Haiku 4.5
- **Google AI**: Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash

### Recording Preferences
- Auto-scroll to elements
- Capture network requests
- Smart wait strategies
- Screenshot on failure

### Code Generation Options
- Programming language (TypeScript/JavaScript)
- Include descriptive comments
- Generate Page Objects
- Code formatting preferences

## 🔐 Privacy & Security

FlowScribe is designed with privacy as a core principle:
- **Local Processing**: Recordings stay in your browser's local storage; nothing is sent anywhere unless you enable AI enhancement
- **Encrypted API Key**: Your AI provider API key is encrypted (AES-GCM) before being stored
- **Sensitive Data Masking**: Password/token fields and sensitive network headers are masked/redacted at capture
- **Minimal Data Collection**: No telemetry; only what's needed to record and generate scripts
- **User Control**: You decide whether to send any data to an AI service, using your own key

[Read our full Privacy Policy](src/extension/pages/privacy-policy.html)

## 🤝 Contributing

We welcome contributions! Open an issue or pull request on GitHub to get started.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/your-org/flowscribe.git
cd flowscribe

# Install dependencies
npm install

# Build the extension
npm run build

# The built extension will be in the 'dist-chrome' folder
# Load it in Chrome using chrome://extensions/
```

### Project Structure
```
manifest.json          # MV3 manifest (extension root)
src/
├── background/        # Service worker: sessions, AI orchestration, storage
├── content/           # In-page recorder + element picker
├── popup/             # Extension popup UI (record / assertions / history)
├── generators/        # Framework-specific test-script emitters
├── pom/               # Page Object Model generator
├── network/           # Network request recorder
└── utils/             # Shared utilities (AI service, wait strategy, logger)

dist-chrome/           # Built extension (ready to load in Chrome)
```

In-app help is available from the popup's ⚙️ menu (Help & Privacy Policy).

## 🐛 Issues & Support

- **Bug Reports**: [GitHub Issues](https://github.com/srewoo/FlowScribe/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/srewoo/FlowScribe/discussions)
- **Support**: srewoo@gmail.com

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with modern web technologies and AI
- Inspired by the need for better test automation tools
- Thanks to the open-source testing community

---

**FlowScribe** - Transform your manual testing workflow into automated excellence.
