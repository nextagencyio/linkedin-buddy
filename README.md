# LinkedIn Buddy

A powerful browser extension that enhances your LinkedIn experience with additional features and functionality.

## 🚀 Features

### Core Features
- **Enhanced Feed**: Visual improvements to your LinkedIn feed
- **Auto-Expand Posts**: Automatically expands "see more" content in posts
- **Quick Actions**: Convenient action buttons for common tasks
- **Chat Assistant**: Built-in chat widget for assistance

### Content Filtering
- **Hide Sponsored Posts**: Automatically removes sponsored content from your feed
- **Hide Recommended Posts**: Removes "Recommended for you" sections with suggested connections

### Analytics Enhancement
- **Enhanced Stats Widget**: Adds missing stats to your LinkedIn sidebar
  - **Follower Count**: Shows how many people follow you
  - **Connections Count**: Displays your total number of connections
  - Integrates seamlessly with existing LinkedIn analytics

## 📁 Project Structure

```
linkedin-buddy/
├── extension/           # Browser extension files
│   ├── content.js      # Main content script
│   ├── popup.js        # Extension popup logic
│   ├── popup.html      # Extension popup interface
│   ├── styles.css      # Custom styles
│   ├── manifest.json   # Extension manifest
│   └── README.md       # Extension documentation
├── package.json        # Node.js dependencies for API services
└── README.md          # Main project documentation
```

## 🛠 Installation

1. **Download the Extension**
   - Clone this repository or download the ZIP file
   - Extract to a local folder

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the `extension` folder

3. **Configure Settings**
   - Click the LinkedIn Buddy extension icon in your browser toolbar
   - Toggle the features you want to enable
   - Your preferences will be saved automatically

## 🔧 Usage

### Enhanced Stats Widget
1. Enable "Enhanced Stats Widget" in the extension popup
2. Visit your LinkedIn homepage
3. Check the left sidebar analytics widget
4. You'll now see additional stats:
   - **Followers**: Number of people following your profile
   - **Connections**: Your total connection count

### Content Filtering
- **Hide Sponsored Posts**: Toggle to automatically remove sponsored content
- **Hide Recommended Posts**: Toggle to remove suggestion sections
- Use Quick Actions for manual filtering

### Feed Enhancement
- **Auto-Expand Posts**: Automatically shows full post content without clicking "see more"
- **Enhanced Feed**: Visual improvements to the LinkedIn interface

## 🔐 Privacy & Security

- **Local Processing**: All data processing happens locally in your browser
- **No Data Collection**: The extension doesn't send your data to external servers
- **LinkedIn API**: Uses LinkedIn's internal APIs with your existing authentication
- **Secure**: Only accesses LinkedIn domains with your explicit permission

## 🐛 Troubleshooting

### Stats Widget Not Working
- Ensure you're logged into LinkedIn
- Refresh the LinkedIn homepage
- Check browser console for any error messages
- Try disabling and re-enabling the feature

### Content Not Loading
- Make sure you're on the LinkedIn homepage (`linkedin.com/feed/`)
- Allow the page to fully load before expecting changes
- Check that LinkedIn's interface hasn't significantly changed

## 🤝 Contributing

Contributions are welcome! Please feel free to:
- Report bugs by opening an issue
- Suggest new features
- Submit pull requests for improvements

## ⚠️ Disclaimer

This extension is provided as-is for educational and personal use. Please respect LinkedIn's Terms of Service and use responsibly. The extension enhances the existing LinkedIn interface but doesn't violate any platform policies.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔄 Version History

- **v1.2.0**: Added Enhanced Stats Widget with follower/connection counts
- **v1.1.0**: Added Hide Recommended Posts feature
- **v1.0.0**: Initial release with core features

---

**Made with ❤️ for the LinkedIn community**
