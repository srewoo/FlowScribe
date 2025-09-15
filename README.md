# FlowScribe - AI-Powered Test Automation Recorder

**Consolidated Architecture - Clean & Maintainable**

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
- **Self-Healing Scripts**: Creates robust scripts that adapt to UI changes

### 🎯 Multi-Framework Support
- **Playwright** (TypeScript/JavaScript)
- **Selenium** (Java, Python, C#, JavaScript)
- **Cypress** (TypeScript/JavaScript)
- **Puppeteer** (JavaScript)

### 🔧 Advanced Capabilities
- **Visual AI Engine**: Screenshot-based element detection and validation
- **Network Monitoring**: Capture and validate API requests/responses
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
   - Select the `dist` folder from your project directory

4. Verify installation:
   - You should see the FlowScribe icon (🎯 FS) in your Chrome toolbar
   - Click it to open the popup interface

### Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store once published.

## 📖 Quick Start

### First Test Recording

1. **Open Test Page**: Open [test-page.html](./test-page.html) in your browser for practice
   
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
- **Element Inspector**: Analyze elements and preview optimal selectors
- **Script Editor**: Edit and enhance generated scripts with AI assistance
- **Test Execution**: Run tests directly from the extension
- **Reports**: View detailed execution results and performance metrics

## ⚙️ Configuration

### AI Settings
Configure your preferred AI provider in Settings:
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude-3, Claude-2
- **Google AI**: Gemini Pro, Gemini Pro Vision

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
- **Local Processing**: Recordings are processed locally when possible
- **Encrypted Storage**: All data is encrypted before storage
- **Minimal Data Collection**: Only essential data for functionality
- **User Control**: You decide what data to share with AI services

[Read our full Privacy Policy](src/extension/popup/privacy-policy.html)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/your-org/flowscribe.git
cd flowscribe

# Install dependencies
npm install

# Build the extension
npm run build

# The built extension will be in the 'dist' folder
# Load it in Chrome using chrome://extensions/
```

### Project Structure
```
src/
├── extension/          # Extension manifest and icons
│   ├── manifest.json
│   └── icons/
├── content/           # Content script for recording
│   └── content.js
├── background/        # Service worker for processing
│   └── background.js
├── popup/            # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── utils/            # Shared utilities

dist/                 # Built extension (ready for Chrome)
test-page.html       # Test page for trying FlowScribe
```

## 📚 Documentation

- [User Guide](docs/user-guide.md)
- [API Reference](docs/api-reference.md)
- [Framework Integration](docs/framework-integration.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🐛 Issues & Support

- **Bug Reports**: [GitHub Issues](https://github.com/your-org/flowscribe/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/your-org/flowscribe/discussions)
- **Support**: support@flowscribe.com

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with modern web technologies and AI
- Inspired by the need for better test automation tools
- Thanks to the open-source testing community

---

**FlowScribe** - Transform your manual testing workflow into automated excellence.
