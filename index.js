const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');

// Load environment variables.
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq client.
let groq = null;
try {
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'placeholder_api_key_replace_with_real_key') {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    console.log('✅ Groq API client initialized successfully');
  } else {
    console.log('⚠️  GROQ_API_KEY not configured. RAG search will use fallback responses.');
    console.log('   Create a .env file with your Groq API key to enable full functionality.');
  }
} catch (error) {
  console.error('❌ Failed to initialize Groq client:', error.message);
  console.log('   Server will continue with limited functionality.');
}

// Middleware.
app.use(cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Store for recent post content (in-memory for now).
let postDatabase = [];
const MAX_POSTS = 100; // Limit stored posts.

// Health check endpoint.
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    postsStored: postDatabase.length,
  });
});

// Endpoint to receive and store post content from Chrome extension.
app.post('/api/posts', (req, res) => {
  try {
    const { posts } = req.body;

    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({ error: 'Posts array is required' });
    }

    // Add new posts to database with timestamp.
    const newPosts = posts.map(post => ({
      ...post,
      timestamp: new Date().toISOString(),
      id: post.id || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }));

    // Add to database and maintain size limit.
    postDatabase = [...newPosts, ...postDatabase].slice(0, MAX_POSTS);

    res.json({
      success: true,
      postsReceived: newPosts.length,
      totalStored: postDatabase.length,
    });
  } catch (error) {
    console.error('Error storing posts:', error);
    res.status(500).json({ error: 'Failed to store posts' });
  }
});

// RAG search endpoint using Groq API.
app.post('/api/chat', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!groq) {
      // Fallback response when Groq is not available
      const fallbackResponse = `I would analyze the LinkedIn posts for you, but the Groq API is not configured.

To enable full RAG search functionality:
1. Get a free API key from https://console.groq.com/
2. Create a .env file in the project root
3. Add: GROQ_API_KEY=your_actual_api_key_here
4. Restart the server

For now, I can tell you that I have ${postDatabase.length} LinkedIn posts available for analysis.`;

      return res.json({
        success: true,
        response: fallbackResponse,
        relevantPosts: [],
        totalPostsSearched: postDatabase.length,
        query,
        mode: 'fallback'
      });
    }

    // Prepare context from stored posts.
    const context = postDatabase
      .slice(0, maxResults * 2) // Get more posts to choose from.
      .map(post => {
        const content = [
          post.author ? `Author: ${post.author}` : '',
          post.text ? `Content: ${post.text}` : '',
          post.hashtags ? `Tags: ${post.hashtags.join(', ')}` : '',
          post.engagement ? `Engagement: ${post.engagement}` : '',
        ].filter(Boolean).join('\n');

        return `Post ID: ${post.id}\n${content}\n---`;
      })
      .join('\n\n');

    // Create RAG prompt.
    const systemPrompt = `You are an AI assistant helping analyze LinkedIn posts. Use the provided post content to answer questions accurately and provide relevant insights. If the information isn't available in the posts, say so clearly.

Available LinkedIn Posts:
${context}`;

    const userPrompt = `Based on the LinkedIn posts provided, please answer this question: ${query}

Please provide:
1. A direct answer to the question
2. Relevant post references if applicable
3. Any insights or patterns you notice from the content`;

    // Call Groq API.
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.1-70b-versatile',
      temperature: 0.3,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No response from Groq API');
    }

    // Find most relevant posts for reference.
    const relevantPosts = postDatabase
      .slice(0, maxResults)
      .map(post => ({
        id: post.id,
        author: post.author,
        text: post.text?.substring(0, 200) + '...',
        timestamp: post.timestamp,
      }));

    res.json({
      success: true,
      response,
      relevantPosts,
      totalPostsSearched: postDatabase.length,
      query,
    });

  } catch (error) {
    console.error('Error in RAG search:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error.message,
    });
  }
});

// Get stored posts (for debugging).
app.get('/api/posts', (req, res) => {
  const { limit = 10 } = req.query;
  const posts = postDatabase.slice(0, parseInt(limit));

  res.json({
    posts: posts.map(post => ({
      id: post.id,
      author: post.author,
      text: post.text?.substring(0, 100) + '...',
      timestamp: post.timestamp,
    })),
    total: postDatabase.length,
  });
});

// Clear stored posts.
app.delete('/api/posts', (req, res) => {
  postDatabase = [];
  res.json({ success: true, message: 'All posts cleared' });
});

// Start server.
app.listen(PORT, () => {
  console.log(`LinkedIn Buddy API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Groq API configured: ${!!process.env.GROQ_API_KEY}`);
});

module.exports = app;
