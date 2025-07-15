// LinkedIn Buddy Content Script

class LinkedInBuddy {
  constructor() {
    this.chatWidget = null;
    this.toggleButton = null;
    this.quickActions = null;
    this.isInitialized = false;
    this.settings = {
      enhancedFeed: false,
      quickActions: false,
      chatAssistant: false,
      autoExpandPosts: true
    };
    
    this.init();
  }

  init() {
    if (this.isInitialized) return;
    
    this.loadSettings();
    this.createChatToggleButton();
    this.createChatWidget();
    this.createQuickActions();
    this.setupMessageListener();
    this.isInitialized = true;
  }

  loadSettings() {
    chrome.storage.sync.get(['enhancedFeed', 'quickActions', 'chatAssistant', 'autoExpandPosts'], (result) => {
      this.settings = {
        enhancedFeed: result.enhancedFeed || false,
        quickActions: result.quickActions || false,
        chatAssistant: result.chatAssistant || false,
        autoExpandPosts: result.autoExpandPosts !== undefined ? result.autoExpandPosts : true
      };
      this.applySettings();
    });
  }

  applySettings() {
    this.toggleEnhancedFeed(this.settings.enhancedFeed);
    this.toggleQuickActions(this.settings.quickActions);
    this.toggleChatAssistant(this.settings.chatAssistant);
    this.toggleAutoExpandPosts(this.settings.autoExpandPosts);
  }

  createChatToggleButton() {
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'linkedin-buddy-toggle';
    this.toggleButton.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 2.98.97 4.29L1 23l6.71-1.97C9.02 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="currentColor"/>
        <circle cx="8.5" cy="12" r="1.5" fill="white"/>
        <circle cx="12" cy="12" r="1.5" fill="white"/>
        <circle cx="15.5" cy="12" r="1.5" fill="white"/>
      </svg>
    `;
    this.toggleButton.title = 'Open LinkedIn Buddy Chat';
    
    this.toggleButton.addEventListener('click', () => {
      this.toggleChat();
    });
    
    document.body.appendChild(this.toggleButton);
  }

  createChatWidget() {
    this.chatWidget = document.createElement('div');
    this.chatWidget.className = 'linkedin-buddy-chat';
    this.chatWidget.innerHTML = `
      <div class="chat-header">
        <h3>LinkedIn Buddy</h3>
        <button class="chat-close">×</button>
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="chat-message assistant">
          Hello! I'm your LinkedIn Buddy. How can I help you today?
        </div>
      </div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" placeholder="Type your message..." id="chatInput">
        <button class="chat-send" id="chatSend">Send</button>
      </div>
    `;
    
    document.body.appendChild(this.chatWidget);
    
    // Add event listeners
    this.chatWidget.querySelector('.chat-close').addEventListener('click', () => {
      this.toggleChat();
    });
    
    const chatInput = this.chatWidget.querySelector('#chatInput');
    const chatSend = this.chatWidget.querySelector('#chatSend');
    
    chatSend.addEventListener('click', () => {
      this.sendMessage();
    });
    
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
  }

  createQuickActions() {
    this.quickActions = document.createElement('div');
    this.quickActions.className = 'linkedin-buddy-quick-actions';
    this.quickActions.innerHTML = `
      <button class="quick-action-btn" data-action="copyProfile">Copy Profile URL</button>
      <button class="quick-action-btn" data-action="exportConnections">Export Connections</button>
      <button class="quick-action-btn" data-action="hideSponsored">Hide Sponsored Posts</button>
      <button class="quick-action-btn" data-action="enhanceSearch">Enhance Search</button>
    `;
    
    document.body.appendChild(this.quickActions);
    
    // Add event listeners for quick actions
    this.quickActions.addEventListener('click', (e) => {
      if (e.target.classList.contains('quick-action-btn')) {
        this.executeQuickAction(e.target.dataset.action);
      }
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'toggleEnhancedFeed':
          this.toggleEnhancedFeed(message.enabled);
          break;
        case 'toggleQuickActions':
          this.toggleQuickActions(message.enabled);
          break;
        case 'toggleChatAssistant':
          this.toggleChatAssistant(message.enabled);
          break;
        case 'openChat':
          this.openChat();
          break;
        case 'toggleAutoExpandPosts':
          this.toggleAutoExpandPosts(message.enabled);
          break;
      }
    });
  }

  toggleChat() {
    if (this.chatWidget.classList.contains('visible')) {
      this.chatWidget.classList.remove('visible');
      this.toggleButton.classList.remove('hidden');
    } else {
      this.chatWidget.classList.add('visible');
      this.toggleButton.classList.add('hidden');
    }
  }

  openChat() {
    this.chatWidget.classList.add('visible');
    this.toggleButton.classList.add('hidden');
  }

  sendMessage() {
    const input = this.chatWidget.querySelector('#chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    this.addMessageToChat(message, 'user');
    input.value = '';
    
    // Simulate assistant response
    setTimeout(() => {
      this.handleUserMessage(message);
    }, 500);
  }

  addMessageToChat(message, sender) {
    const messagesContainer = this.chatWidget.querySelector('#chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  handleUserMessage(message) {
    const lowerMessage = message.toLowerCase();
    let response = '';
    
    if (lowerMessage.includes('profile') || lowerMessage.includes('url')) {
      response = 'I can help you copy your profile URL or analyze profile information. Try using the Quick Actions menu!';
    } else if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
      response = 'I can help you manage your connections and networking activities. What would you like to do?';
    } else if (lowerMessage.includes('post') || lowerMessage.includes('content')) {
      response = 'I can help you analyze posts, hide sponsored content, or enhance your feed experience.';
    } else if (lowerMessage.includes('search')) {
      response = 'I can enhance your LinkedIn search with additional filters and insights.';
    } else {
      response = 'I can help you with various LinkedIn tasks like managing connections, analyzing profiles, enhancing your feed, and more. What would you like to do?';
    }
    
    this.addMessageToChat(response, 'assistant');
  }

  toggleEnhancedFeed(enabled) {
    if (enabled) {
      document.body.classList.add('linkedin-buddy-enhanced');
      this.enhanceFeedItems();
    } else {
      document.body.classList.remove('linkedin-buddy-enhanced');
    }
  }

  enhanceFeedItems() {
    // Monitor for new feed items and enhance them
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            const feedItems = node.querySelectorAll && node.querySelectorAll('[data-id^="urn:li:activity"]');
            if (feedItems) {
              feedItems.forEach(item => {
                item.classList.add('feed-item');
              });
            }
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  toggleQuickActions(enabled) {
    if (enabled) {
      this.quickActions.classList.add('visible');
    } else {
      this.quickActions.classList.remove('visible');
    }
  }

  toggleChatAssistant(enabled) {
    if (enabled) {
      this.toggleButton.style.display = 'flex';
    } else {
      this.toggleButton.style.display = 'none';
      this.chatWidget.classList.remove('visible');
    }
  }

  executeQuickAction(action) {
    switch (action) {
      case 'copyProfile':
        const profileUrl = window.location.href;
        navigator.clipboard.writeText(profileUrl);
        this.showNotification('Profile URL copied to clipboard!');
        break;
      case 'exportConnections':
        this.showNotification('Connection export feature coming soon!');
        break;
      case 'hideSponsored':
        this.hideSponsoredPosts();
        break;
      case 'enhanceSearch':
        this.showNotification('Search enhancement feature coming soon!');
        break;
    }
  }

  hideSponsoredPosts() {
    const sponsoredPosts = document.querySelectorAll('[data-id*="urn:li:sponsoredUpdate"], [aria-label*="Promoted"], [aria-label*="Sponsored"]');
    sponsoredPosts.forEach(post => {
      post.style.display = 'none';
    });
    this.showNotification(`Hidden ${sponsoredPosts.length} sponsored posts`);
  }

  toggleAutoExpandPosts(enabled) {
    if (enabled) {
      document.body.classList.add('linkedin-buddy-auto-expand');
      this.triggerContentLoad();
      this.removeEllipsisSpans();
      this.startObservingForNewPosts();
    } else {
      document.body.classList.remove('linkedin-buddy-auto-expand');
      this.stopObservingForNewPosts();
    }
  }

  triggerContentLoad() {
    // Find all "see more" buttons and trigger their content to load
    const seeMoreButtons = document.querySelectorAll(`
      .feed-shared-inline-show-more-text:not(.feed-shared-inline-show-more-text--expanded),
      .feed-shared-inline-show-more-text--minimal-padding:not(.feed-shared-inline-show-more-text--expanded),
      .feed-shared-inline-show-more-text--3-lines:not(.feed-shared-inline-show-more-text--expanded)
    `);
    
    seeMoreButtons.forEach(button => {
      // Trigger a hover event to potentially load the content
      const hoverEvent = new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      button.dispatchEvent(hoverEvent);
    });
  }

  removeEllipsisSpans() {
    // Remove existing ellipsis spans
    const ellipsisSpans = document.querySelectorAll(`
      .feed-shared-text span[aria-hidden="true"],
      .feed-shared-update-v2__description span[aria-hidden="true"],
      span[aria-hidden="true"]
    `);
    
    ellipsisSpans.forEach(span => {
      const text = span.textContent;
      if (text.includes('…') || text.includes('...') || text.includes('more')) {
        span.remove();
      }
    });
    
    // Also hide any "more" buttons that might still be visible
    this.hideMoreButtons();
  }

  hideMoreButtons() {
    // Find only the specific "more" buttons in feed posts
    const moreSelectors = [
      '.feed-shared-inline-show-more-text',
      '.feed-shared-inline-show-more-text--minimal-padding',
      '.feed-shared-inline-show-more-text--3-lines',
      '.feed-shared-inline-show-more-text__see-more-less-toggle',
      '.see-more',
      '.feed-shared-inline-show-more-text__dynamic-more-text',
      '.feed-shared-inline-show-more-text__dynamic-bidi-text'
    ];
    
    moreSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        element.style.display = 'none';
      });
    });
  }

  startObservingForNewPosts() {
    if (this.autoExpandObserver) {
      this.autoExpandObserver.disconnect();
    }
    
    this.autoExpandObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Trigger content load for any new "see more" buttons
            const newSeeMoreButtons = node.querySelectorAll && node.querySelectorAll(`
              .feed-shared-inline-show-more-text:not(.feed-shared-inline-show-more-text--expanded),
              .feed-shared-inline-show-more-text--minimal-padding:not(.feed-shared-inline-show-more-text--expanded),
              .feed-shared-inline-show-more-text--3-lines:not(.feed-shared-inline-show-more-text--expanded)
            `);
            
            if (newSeeMoreButtons) {
              newSeeMoreButtons.forEach(button => {
                const hoverEvent = new MouseEvent('mouseenter', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                button.dispatchEvent(hoverEvent);
              });
            }
            
            // Remove ellipsis spans from new content
            this.removeEllipsisSpans();
          }
        });
      });
    });
    
    this.autoExpandObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stopObservingForNewPosts() {
    if (this.autoExpandObserver) {
      this.autoExpandObserver.disconnect();
      this.autoExpandObserver = null;
    }
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0077b5;
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize LinkedIn Buddy when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LinkedInBuddy();
  });
} else {
  new LinkedInBuddy();
}