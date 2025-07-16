# LinkedIn Buddy

A powerful browser extension that enhances your LinkedIn experience with additional features and functionality.

## 🚀 Features

### Core Features
- **Enhanced Feed**: Visual improvements to your LinkedIn feed
- **Auto-Expand Posts**: Automatically expands "see more" content in posts
- **Quick Actions**: Convenient action buttons for common tasks
- **AI Chat Assistant**: Intelligent chat with RAG search powered by Groq API
  - **Post Analysis**: Automatically extracts and analyzes LinkedIn post content
  - **Smart Search**: Ask questions about trends, topics, and authors from your feed
  - **Contextual Responses**: Uses real LinkedIn data for accurate, relevant answers

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
│   ├── content.js      # Main content script (with RAG integration)
│   ├── popup.js        # Extension popup logic
│   ├── popup.html      # Extension popup interface
│   ├── styles.css      # Custom styles
│   ├── manifest.json   # Extension manifest
│   └── README.md       # Extension documentation
├── index.js            # Node.js server with Groq API integration
├── package.json        # Node.js dependencies for API services
├── .env.example        # Environment variables template
└── README.md          # Main project documentation
```

## 🛠 Installation

### Backend Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Create a `.env` file in the project root:
   ```bash
   # Groq API Configuration
   GROQ_API_KEY=your_groq_api_key_here

   # Server Configuration
   PORT=3000

   # Optional: Environment
   NODE_ENV=development
   ```

3. **Get Groq API Key**
   - Sign up at [https://console.groq.com/](https://console.groq.com/)
   - Create an API key and add it to your `.env` file

4. **Start the Server**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

### Chrome Extension Setup

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

### Chat Assistant with RAG Search

1. **Enable the Feature**
   - Make sure the Node.js server is running on `http://localhost:3000`
   - Visit LinkedIn and enable "Chat Assistant" in the extension popup

2. **Start Chatting**
   - Click the chat button (💬) in the bottom left to open the chat widget
   - The extension automatically extracts content from LinkedIn posts
   - Ask questions about posts, trends, authors, or any content you see

3. **Example Queries**
   - "What are the main topics being discussed in recent posts?"
   - "Who is posting about AI or machine learning?"
   - "Summarize the most engaging posts from today"
   - "What trends do you see in the hashtags being used?"
   - "Tell me about posts related to [specific topic]"

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

## 🔌 API Endpoints

The Node.js backend provides these REST endpoints:

### Health Check
- `GET /health` - Server health status and post count

### Post Management
- `POST /api/posts` - Receive post content from Chrome extension
- `GET /api/posts?limit=10` - View stored posts (for debugging)
- `DELETE /api/posts` - Clear all stored posts

### Chat & RAG Search
- `POST /api/chat` - Intelligent search using Groq API
  ```json
  {
    "query": "What are the trending topics?",
    "maxResults": 5
  }
  ```

### Example API Usage
```bash
# Health check
curl http://localhost:3000/health

# Chat query
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What are people posting about AI?"}'
```

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
