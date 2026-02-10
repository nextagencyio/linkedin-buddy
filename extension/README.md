# LinkedIn Buddy Chrome Extension

A Chrome extension that enhances your LinkedIn feed with auto-expand and image hiding features.

## Features

- **Auto-Expand Posts**: Automatically shows full post content without clicking "see more"
- **Hide Post Images**: Removes images and videos from feed posts for text-focused reading

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select this folder
5. The extension will be installed and ready to use

## Usage

1. **Extension Popup**: Click the LinkedIn Buddy icon in your browser toolbar to toggle features
2. Settings are saved automatically and persist across sessions

## Files

- `manifest.json` - Extension configuration
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality
- `content.js` - Main content script that runs on LinkedIn
- `styles.css` - Styling for the extension features
- `icon16.png` - Toolbar icon
- `icon48.png` - Extension management icon
- `icon128.png` - Chrome Web Store icon

## Development

To modify the extension:

1. Make changes to the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh button on the LinkedIn Buddy extension
4. Reload any LinkedIn tabs to see changes

## Permissions

The extension requires:
- `activeTab` - To interact with LinkedIn pages
- `storage` - To save user preferences
- `host_permissions` for `https://www.linkedin.com/*` - To run on LinkedIn

## License

MIT
