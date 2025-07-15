# LinkedIn Buddy Chrome Extension

A Chrome extension that enhances your LinkedIn experience with additional features and a helpful chat assistant.

## Features

- **Enhanced Feed**: Visual improvements to your LinkedIn feed
- **Quick Actions**: Fast access to common LinkedIn tasks
- **Chat Assistant**: AI-powered chat widget for LinkedIn help
- **Page Modifications**: Hide sponsored posts and other customizations

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select this folder
5. The extension will be installed and ready to use

## Usage

1. **Extension Popup**: Click the LinkedIn Buddy icon in your browser toolbar to toggle features
2. **Chat Assistant**: Visit linkedin.com and click the chat button (💬) in the bottom right
3. **Quick Actions**: Enable quick actions in the popup to see additional tools

## Features in Detail

### Enhanced Feed
- Adds visual indicators to feed items
- Improved hover effects for better interaction

### Quick Actions
- Copy profile URL to clipboard
- Hide sponsored posts
- Export connections (coming soon)
- Enhanced search (coming soon)

### Chat Assistant
- Interactive chat widget
- Context-aware responses
- Help with LinkedIn tasks

## Files Structure

- `manifest.json` - Extension configuration
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality
- `content.js` - Main content script that runs on LinkedIn
- `styles.css` - Styling for the extension features

## Development

To modify the extension:

1. Make changes to the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh button on the LinkedIn Buddy extension
4. Reload any LinkedIn tabs to see changes

## Icon Files

You'll need to create the following icon files:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

These should be LinkedIn-themed icons representing the extension.

## Permissions

The extension requires:
- `activeTab` - To interact with LinkedIn pages
- `storage` - To save user preferences
- `host_permissions` for `https://www.linkedin.com/*` - To run on LinkedIn

## Contributing

This is a basic implementation that can be extended with more features. Feel free to add:
- More sophisticated AI responses
- Advanced LinkedIn automation
- Better UI/UX improvements
- Additional quick actions

## License

This project is for educational purposes. Please respect LinkedIn's terms of service when using this extension.