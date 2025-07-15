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
      autoExpandPosts: true,
      autoHideSponsored: false,
    };

    this.init();
  }

  startAutoHideSponsored() {
    // Create observer for automatically hiding sponsored posts
    if (this.sponsoredObserver) {
      this.sponsoredObserver.disconnect();
    }

    this.sponsoredObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            this.hideNewSponsoredPosts(node);
          }
        });
      });
    });

    this.sponsoredObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also hide existing sponsored posts
    this.hideNewSponsoredPosts(document);
  }

  hideNewSponsoredPosts(container) {
    let hiddenCount = 0;

    // Find all feed posts
    const feedPosts = container.querySelectorAll ? container.querySelectorAll('.feed-shared-update-v2') : [];

    feedPosts.forEach(post => {
      // Check if post has the dismiss/hide button - if not, it's likely a sponsored post
      const hideButton = post.querySelector('.feed-shared-control-menu__hide-post-button');

      if (!hideButton && post.style.display !== 'none') {
        // Double-check with some additional indicators to be sure
        const hasPromotedText = post.textContent.includes('Promoted by') ||
          post.textContent.includes('Sponsored by') ||
          post.textContent.includes('Promoted') ||
          post.textContent.includes('Sponsored');

        const hasFollowButton = post.querySelector('.update-components-actor__follow-button');

        // If no hide button AND (has promoted text OR has follow button), it's likely sponsored
        if (hasPromotedText || hasFollowButton) {
          post.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Hidden sponsored post (no dismiss button)', {
            post: post,
            hasPromotedText: hasPromotedText,
            hasFollowButton: !!hasFollowButton,
            promotedText: hasPromotedText ? post.textContent.match(/(Promoted by|Sponsored by)[^.]*/) : null
          });
        }
      }
    });

    // Also check for explicit sponsored selectors as backup
    const sponsoredSelectors = [
      '[data-id*="urn:li:sponsoredUpdate"]',
      '[aria-label*="Promoted"]',
      '[aria-label*="Sponsored"]',
      '[data-test-id*="sponsored"]'
    ];

    sponsoredSelectors.forEach(selector => {
      const sponsoredPosts = container.querySelectorAll ? container.querySelectorAll(selector) : [];
      sponsoredPosts.forEach(post => {
        const postContainer = post.closest('.feed-shared-update-v2') || post.closest('[data-id^="urn:li:activity"]') || post;
        if (postContainer && postContainer.style.display !== 'none') {
          postContainer.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Hidden sponsored post (selector match)', selector, postContainer);
        }
      });
    });

    if (hiddenCount > 0) {
      console.log(`LinkedIn Buddy: Auto-hidden ${hiddenCount} sponsored posts`);
    }
  }

  stopAutoHideSponsored() {
    if (this.sponsoredObserver) {
      this.sponsoredObserver.disconnect();
      this.sponsoredObserver = null;
    }
  }

  isHomepage() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    // LinkedIn homepage/feed patterns
    const isHomepage = (
      pathname === '/feed/' ||
      pathname === '/' ||
      pathname.startsWith('/feed') ||
      url.includes('/feed/')
    );

    // Debug logging (can be removed in production)
    if (window.location.hostname.includes('linkedin.com')) {
      console.log('LinkedIn Buddy - Auto-Expand Posts:', isHomepage ? 'ENABLED (Homepage)' : 'DISABLED (Not Homepage)', 'URL:', url);
    }

    return isHomepage;
  }

  init() {
    if (this.isInitialized) return;

    this.loadSettings();
    this.createChatToggleButton();
    this.createChatWidget();
    this.createQuickActions();
    this.setupMessageListener();
    this.setupUrlChangeListener();
    this.isInitialized = true;
  }

  setupUrlChangeListener() {
    // Listen for URL changes in SPA navigation
    const observer = new MutationObserver(() => {
      if (this.currentUrl !== window.location.href) {
        const previousUrl = this.currentUrl;
        this.currentUrl = window.location.href;

        // Clean up previous page modifications if we're leaving the homepage
        if (previousUrl && previousUrl.includes('/feed/') && !this.isHomepage()) {
          this.cleanupAutoExpandModifications();
        }

        // Reapply auto-expand setting when URL changes
        this.toggleAutoExpandPosts(this.settings.autoExpandPosts);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.currentUrl = window.location.href;
  }

  cleanupAutoExpandModifications() {
    // Remove any inline styles that might have been applied
    const styledElements = document.querySelectorAll('[style*="display: none"]');
    styledElements.forEach(element => {
      if (element.style.display === 'none') {
        element.style.display = '';
      }
    });

    // Ensure the CSS class is removed
    document.body.classList.remove('linkedin-buddy-auto-expand');
  }

  loadSettings() {
    chrome.storage.sync.get(['enhancedFeed', 'quickActions', 'chatAssistant', 'autoExpandPosts', 'autoHideSponsored'], (result) => {
      this.settings = {
        enhancedFeed: result.enhancedFeed || false,
        quickActions: result.quickActions || false,
        chatAssistant: result.chatAssistant || false,
        autoExpandPosts: result.autoExpandPosts !== undefined ? result.autoExpandPosts : true,
        autoHideSponsored: result.autoHideSponsored || false
      };
      this.applySettings();
    });
  }

  applySettings() {
    this.toggleEnhancedFeed(this.settings.enhancedFeed);
    this.toggleQuickActions(this.settings.quickActions);
    this.toggleChatAssistant(this.settings.chatAssistant);
    this.toggleAutoExpandPosts(this.settings.autoExpandPosts);
    this.toggleAutoHideSponsored(this.settings.autoHideSponsored);
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
        case 'toggleAutoHideSponsored':
          this.toggleAutoHideSponsored(message.enabled);
          break;
      }
    });
  }

  toggleAutoHideSponsored(enabled) {
    if (enabled) {
      this.startAutoHideSponsored();
    } else {
      this.stopAutoHideSponsored();
    }
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
        // Also enable auto-hide for convenience
        this.toggleAutoHideSponsored(true);
        break;
      case 'enhanceSearch':
        this.showNotification('Search enhancement feature coming soon!');
        break;
    }
  }

  hideSponsoredPosts() {
    let hiddenCount = 0;

    // Find all feed posts
    const feedPosts = document.querySelectorAll('.feed-shared-update-v2');
    console.log(`LinkedIn Buddy: Found ${feedPosts.length} feed posts to check`);

    feedPosts.forEach((post, index) => {
      // Check if post has the dismiss/hide button - if not, it's likely a sponsored post
      const hideButton = post.querySelector('.feed-shared-control-menu__hide-post-button');

      if (!hideButton && post.style.display !== 'none') {
        // Double-check with some additional indicators to be sure
        const hasPromotedText = post.textContent.includes('Promoted by') ||
          post.textContent.includes('Sponsored by') ||
          post.textContent.includes('Promoted') ||
          post.textContent.includes('Sponsored');

        const hasFollowButton = post.querySelector('.update-components-actor__follow-button');

        // If no hide button AND (has promoted text OR has follow button), it's likely sponsored
        if (hasPromotedText || hasFollowButton) {
          post.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Hidden sponsored post (no dismiss button - manual)', {
            post: post,
            hasPromotedText: hasPromotedText,
            hasFollowButton: !!hasFollowButton,
            promotedText: hasPromotedText ? post.textContent.match(/(Promoted by|Sponsored by)[^.]*/) : null
          });
        }
      }
    });

    // Also check for explicit sponsored selectors as backup
    const sponsoredSelectors = [
      '[data-id*="urn:li:sponsoredUpdate"]',
      '[aria-label*="Promoted"]',
      '[aria-label*="Sponsored"]',
      '[data-test-id*="sponsored"]'
    ];

    sponsoredSelectors.forEach(selector => {
      const sponsoredPosts = document.querySelectorAll(selector);
      sponsoredPosts.forEach(post => {
        const postContainer = post.closest('.feed-shared-update-v2') || post.closest('[data-id^="urn:li:activity"]') || post;
        if (postContainer && postContainer.style.display !== 'none') {
          postContainer.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Hidden sponsored post (selector match - manual)', selector, postContainer);
        }
      });
    });

    this.showNotification(`Hidden ${hiddenCount} sponsored posts`);
  }

  toggleAutoExpandPosts(enabled) {
    if (enabled && this.isHomepage()) {
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
    // Only trigger content load if we're on the homepage
    if (!this.isHomepage()) {
      return;
    }

    // Find all "see more" buttons ONLY in main post content, not in comments
    const seeMoreButtons = document.querySelectorAll(`
      .feed-shared-update-v2__description .feed-shared-inline-show-more-text:not(.feed-shared-inline-show-more-text--expanded),
      .feed-shared-update-v2__description .feed-shared-inline-show-more-text--minimal-padding:not(.feed-shared-inline-show-more-text--expanded),
      .feed-shared-update-v2__description .feed-shared-inline-show-more-text--3-lines:not(.feed-shared-inline-show-more-text--expanded)
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
    // Only remove ellipsis spans if we're on the homepage
    if (!this.isHomepage()) {
      return;
    }

    // Remove existing ellipsis spans ONLY from main post content, not comments
    const ellipsisSpans = document.querySelectorAll(`
      .feed-shared-update-v2__description .feed-shared-text span[aria-hidden="true"],
      .feed-shared-update-v2__description span[aria-hidden="true"]
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
    // Only hide buttons if we're on the homepage
    if (!this.isHomepage()) {
      return;
    }

    // Find only the specific "more" buttons in main post content, not in comments
    const moreSelectors = [
      '.feed-shared-update-v2__description .feed-shared-inline-show-more-text',
      '.feed-shared-update-v2__description .feed-shared-inline-show-more-text--minimal-padding',
      '.feed-shared-update-v2__description .feed-shared-inline-show-more-text--3-lines',
      '.feed-shared-update-v2__description .feed-shared-inline-show-more-text__see-more-less-toggle',
      '.feed-shared-update-v2__description .feed-shared-inline-show-more-text__dynamic-more-text',
      '.feed-shared-update-v2__description .feed-shared-inline-show-more-text__dynamic-bidi-text'
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
      // Only process mutations if we're on the homepage
      if (!this.isHomepage()) {
        return;
      }

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Trigger content load for any new "see more" buttons ONLY in main post content
            const newSeeMoreButtons = node.querySelectorAll && node.querySelectorAll(`
              .feed-shared-update-v2__description .feed-shared-inline-show-more-text:not(.feed-shared-inline-show-more-text--expanded),
              .feed-shared-update-v2__description .feed-shared-inline-show-more-text--minimal-padding:not(.feed-shared-inline-show-more-text--expanded),
              .feed-shared-update-v2__description .feed-shared-inline-show-more-text--3-lines:not(.feed-shared-inline-show-more-text--expanded)
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
