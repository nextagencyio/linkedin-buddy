// LinkedIn Buddy Content Script

class LinkedInBuddy {
  constructor() {
    this.isInitialized = false;
    this.imageObserver = null;
    this.settings = {
      autoExpandPosts: true,
      hideImages: false,
    };

    this.init();
  }

  // LinkedIn Voyager API integration methods
  getLinkedInAuthTokens() {
    const cookies = document.cookie.split(';');
    const tokens = {};

    cookies.forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name === 'li_at') {
        tokens.liAt = value;
      } else if (name === 'JSESSIONID') {
        tokens.jsessionId = value.replace(/"/g, '');
      }
    });

    return tokens;
  }

  async fetchVoyagerData(endpoint, params = {}) {
    const tokens = this.getLinkedInAuthTokens();

    if (!tokens.jsessionId) {
      console.log('LinkedIn Buddy: No CSRF token found');
      return null;
    }

    const url = new URL(`https://www.linkedin.com/voyager/api/${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'csrf-token': tokens.jsessionId,
          'accept': 'application/vnd.linkedin.normalized+json+2.1',
          'x-restli-protocol-version': '2.0.0',
        },
        credentials: 'same-origin'
      });

      if (!response.ok) {
        console.warn(`LinkedIn Buddy: API request failed: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('LinkedIn Buddy: Voyager API request failed:', error);
      return null;
    }
  }

  async getCurrentUserProfile() {
    try {
      // Try multiple profile endpoints to get follower data
      const endpoints = [
        'identity/profiles/me',
        'identity/profiles/me/profileView',
        'identity/profiles/me/insights',
        'me',
        'identity/dash/me'
      ];

      for (const endpoint of endpoints) {
        console.log(`LinkedIn Buddy: Trying profile endpoint: ${endpoint}`);
        const data = await this.fetchVoyagerData(endpoint);
        if (data) {
          console.log(`LinkedIn Buddy: Profile response from ${endpoint}:`, data);

          // Look for follower count in various places
          if (data.data) {
            if (data.data.followingInfo) {
              console.log('LinkedIn Buddy: Found followingInfo:', data.data.followingInfo);
              return data.data;
            }
            if (data.data.followerCount !== undefined) {
              console.log(`LinkedIn Buddy: Found followerCount in data: ${data.data.followerCount}`);
              return data.data;
            }
          }

          // Check root level
          if (data.followingInfo || data.followerCount !== undefined) {
            console.log('LinkedIn Buddy: Found follower data at root level');
            return data;
          }

          // Check included array for follower data
          if (data.included) {
            for (const item of data.included) {
              if (item.followingInfo || item.followerCount !== undefined) {
                console.log('LinkedIn Buddy: Found follower data in included array:', item);
                return item;
              }
            }
          }

          // Return first valid response for fallback
          if (data.data) {
            return data.data;
          }
        }
      }
    } catch (error) {
      console.error('LinkedIn Buddy: Failed to get current user profile:', error);
    }
    return null;
  }

  async getNetworkInfo() {
    try {
      // Try multiple endpoints to get the real connection count
      const endpoints = [
        'identity/profiles/me/networkinfo',
        'identity/dashNetworkInfo',
        'me',
        'identity/profiles/me'
      ];

      for (const endpoint of endpoints) {
        console.log(`LinkedIn Buddy: Trying endpoint: ${endpoint}`);
        const data = await this.fetchVoyagerData(endpoint);
        if (data) {
          console.log(`LinkedIn Buddy: Response from ${endpoint}:`, data);

          // Look for connection count in various places in the response
          if (data.data && data.data.connectionsCount !== undefined) {
            console.log(`LinkedIn Buddy: Found connectionsCount: ${data.data.connectionsCount}`);
            return data.data;
          }

          if (data.connectionsCount !== undefined) {
            console.log(`LinkedIn Buddy: Found connectionsCount at root: ${data.connectionsCount}`);
            return { connectionsCount: data.connectionsCount };
          }

          // Check for networkInfo nested object
          if (data.data && data.data.networkInfo) {
            console.log(`LinkedIn Buddy: Found networkInfo:`, data.data.networkInfo);
            return data.data.networkInfo;
          }

          // Check included array for network data
          if (data.included) {
            for (const item of data.included) {
              if (item.connectionsCount !== undefined) {
                console.log(`LinkedIn Buddy: Found connectionsCount in included: ${item.connectionsCount}`);
                return { connectionsCount: item.connectionsCount };
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('LinkedIn Buddy: Failed to get network info:', error);
    }
    return null;
  }

  async getFollowerCount() {
    try {
      // Try to get follower count from the profile data
      const profile = await this.getCurrentUserProfile();
      if (profile) {
        console.log('LinkedIn Buddy: Profile data for follower extraction:', profile);

        // Check various possible locations for follower count
        if (profile.followingInfo && profile.followingInfo.followerCount !== undefined) {
          console.log(`LinkedIn Buddy: Got follower count from followingInfo: ${profile.followingInfo.followerCount}`);
          return profile.followingInfo.followerCount;
        }

        if (profile.followerCount !== undefined) {
          console.log(`LinkedIn Buddy: Got follower count from root: ${profile.followerCount}`);
          return profile.followerCount;
        }
      }
    } catch (error) {
      console.error('LinkedIn Buddy: Failed to get follower count:', error);
    }
    return null;
  }

  hideImagesInNode(node) {
    // Only hide images if we're on the homepage
    if (!this.isHomepage() || this.isNotificationsPage()) {
      return;
    }

    // Find image containers ONLY within feed posts, not in other areas
    const imageSelectors = [
      '.update-components-image',
      '.feed-shared-image',
      '.feed-shared-update-v2__content .ivm-view-attr__img-wrapper',
    ];

    imageSelectors.forEach(selector => {
      const images = node.querySelectorAll ? node.querySelectorAll(selector) : [];
      images.forEach(img => {
        // Only hide if it's inside a feed post
        const feedPost = img.closest('.feed-shared-update-v2');
        if (feedPost) {
          // Store original display style
          if (!img.hasAttribute('data-original-display')) {
            img.setAttribute('data-original-display', img.style.display || '');
          }
          img.style.display = 'none';
        }
      });
    });

    // Also hide video containers in posts
    const videoSelectors = [
      '.update-components-video',
      '.feed-shared-video',
    ];

    videoSelectors.forEach(selector => {
      const videos = node.querySelectorAll ? node.querySelectorAll(selector) : [];
      videos.forEach(video => {
        const feedPost = video.closest('.feed-shared-update-v2');
        if (feedPost) {
          if (!video.hasAttribute('data-original-display')) {
            video.setAttribute('data-original-display', video.style.display || '');
          }
          video.style.display = 'none';
        }
      });
    });
  }

  restoreAllImages() {
    // Restore images
    const hiddenImages = document.querySelectorAll('[data-original-display]');
    hiddenImages.forEach(element => {
      const originalDisplay = element.getAttribute('data-original-display');
      element.style.display = originalDisplay;
      element.removeAttribute('data-original-display');
    });

    // Remove any "Show Image" buttons we may have added
    const showButtons = document.querySelectorAll('.linkedin-buddy-show-image-btn');
    showButtons.forEach(button => {
      // Restore the hidden content
      const container = button.parentElement;
      const hiddenContent = container?.querySelector('[style*="display: none"]');
      if (hiddenContent) {
        hiddenContent.style.display = '';
      }

      // Also restore iframe if it was hidden
      const iframe = container?.querySelector('iframe[style*="display: none"]');
      if (iframe) {
        iframe.style.display = '';
      }

      // Restore container dimensions
      if (container) {
        const originalContainerStyle = container.getAttribute('data-original-style');
        if (originalContainerStyle) {
          container.style.cssText = originalContainerStyle;
        } else {
          // Fallback restoration
          container.style.position = '';
          container.style.height = '';
          container.style.paddingTop = '';
        }

        // Show the iframe
        const iframeEl = container.querySelector('iframe');
        if (iframeEl) {
          iframeEl.style.display = '';
        }
      }

      button.remove();
    });
  }

  startImageHiding() {
    // Create observer for automatically hiding images in posts
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }

    // Throttle the observer to prevent excessive processing
    let processingTimeout = null;
    const throttledProcess = (mutations) => {
      if (processingTimeout) {
        clearTimeout(processingTimeout);
      }

      processingTimeout = setTimeout(() => {
        try {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                // Check if this node or any of its children contain images
                if (node.matches && (
                  node.matches('.update-components-image') ||
                  node.querySelector('.update-components-image') ||
                  node.matches('.feed-shared-update-v2') ||
                  node.querySelector('.feed-shared-update-v2')
                )) {
                  this.hideImagesInNode(node);
                }
              }
            });
          });
        } catch (error) {
          console.warn('LinkedIn Buddy: Error in image observer:', error);
        }
      }, 200);
    };

    this.imageObserver = new MutationObserver(throttledProcess);

    this.imageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Hide existing images
    this.hideImagesInNode(document.body);
  }

  stopImageHiding() {
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
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
      url.includes('/feed/') ||
      // Handle case where we're on root LinkedIn domain
      (pathname === '' && url === 'https://www.linkedin.com/')
    );

    return isHomepage;
  }

  isNotificationsPage() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    // LinkedIn notifications page patterns
    const isNotifications = (
      pathname.startsWith('/notifications') ||
      url.includes('/notifications/')
    );

    // Debug logging
    if (window.location.hostname.includes('linkedin.com') && isNotifications) {
      console.log('LinkedIn Buddy: On notifications page - disabling hide/expand features');
    }

    return isNotifications;
  }

  init() {
    if (this.isInitialized) return;

    // Always set up URL change listener and load settings
    this.loadSettings();
    this.setupUrlChangeListener();

    // Only initialize features if we're on the homepage
    if (this.isHomepage()) {
      this.initializeHomepageFeatures();
    }

    this.isInitialized = true;
  }

  initializeHomepageFeatures() {
    console.log('LinkedIn Buddy: Initializing homepage features');

    this.setupMessageListener();

    // Add periodic check to ensure features are working on homepage
    this.startPeriodicCheck();
  }

  startPeriodicCheck() {
    // Check every 5 seconds if we're on homepage but features aren't active
    this.periodicCheckInterval = setInterval(() => {
      if (this.isHomepage()) {
        this.applySettings();
      }
    }, 5000);
  }

  stopPeriodicCheck() {
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
      this.periodicCheckInterval = null;
    }
  }

  isAnyFeatureEnabled() {
    // All features only work on homepage/feed page
    if (this.isHomepage()) {
      return this.settings.autoExpandPosts ||
        this.settings.hideImages;
    }

    return false;
  }

  setupUrlChangeListener() {
    if (this.urlChangeObserver) {
      this.urlChangeObserver.disconnect();
    }

    // Enhanced URL change detection
    const handleUrlChange = () => {
      if (this.currentUrl !== window.location.href) {
        const previousUrl = this.currentUrl;
        this.currentUrl = window.location.href;

        console.log('LinkedIn Buddy: URL changed from', previousUrl, 'to', this.currentUrl);

        // Add small delay to ensure page is ready
        setTimeout(() => {
          this.handlePageNavigation(previousUrl);
        }, 100);
      }
    };

    // Listen for URL changes in SPA navigation
    this.urlChangeObserver = new MutationObserver(handleUrlChange);

    this.urlChangeObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleUrlChange);

    // Store the event listener for cleanup
    this.urlChangeHandler = handleUrlChange;

    this.currentUrl = window.location.href;
  }

  handlePageNavigation(previousUrl) {
    const wasOnHomepage = previousUrl && (previousUrl.includes('/feed/') || previousUrl === window.location.origin + '/' || previousUrl.endsWith('/'));
    const isNowOnHomepage = this.isHomepage();

    console.log('LinkedIn Buddy: Navigation check - was on homepage:', wasOnHomepage, 'now on homepage:', isNowOnHomepage);

    // Clean up features when leaving the homepage/feed
    if (wasOnHomepage && !isNowOnHomepage) {
      console.log('LinkedIn Buddy: Leaving homepage - cleaning up all features');
      this.cleanupAllFeatures();
    }

    // Initialize features when arriving at homepage
    if (!wasOnHomepage && isNowOnHomepage) {
      console.log('LinkedIn Buddy: Arriving at homepage - initializing features');
      setTimeout(() => {
        this.initializeHomepageFeatures();
        this.applySettings();
      }, 200);
    }

    // Always reapply settings on homepage to ensure everything is working
    if (isNowOnHomepage && wasOnHomepage) {
      console.log('LinkedIn Buddy: Still on homepage - ensuring all settings are applied');
      setTimeout(() => {
        this.applySettings();
      }, 200);
    }
  }

  stopUrlChangeListener() {
    if (this.urlChangeObserver) {
      this.urlChangeObserver.disconnect();
      this.urlChangeObserver = null;
    }

    if (this.urlChangeHandler) {
      window.removeEventListener('popstate', this.urlChangeHandler);
      this.urlChangeHandler = null;
    }
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
    chrome.storage.sync.get(['autoExpandPosts', 'hideImages'], (result) => {
      this.settings = {
        autoExpandPosts: result.autoExpandPosts !== undefined ? result.autoExpandPosts : true,
        hideImages: result.hideImages || false,
      };

      console.log('LinkedIn Buddy: Settings loaded:', this.settings, 'Current page:', window.location.href);

      // Apply settings with a small delay to ensure page is ready
      setTimeout(() => {
        this.applySettings();
      }, 100);
    });
  }

  applySettings() {
    console.log('LinkedIn Buddy: Applying settings on page:', window.location.href, 'isHomepage:', this.isHomepage());

    this.toggleAutoExpandPosts(this.settings.autoExpandPosts);
    this.toggleHideImages(this.settings.hideImages);

    // If no features are enabled, ensure we clean up everything
    if (!this.isAnyFeatureEnabled()) {
      this.cleanupAllFeatures();
    }
  }

  cleanupAllFeatures() {
    this.stopImageHiding();
    this.restoreAllImages();
    this.stopObservingForNewPosts();
    this.stopPeriodicCheck();

    document.body.classList.remove('linkedin-buddy-auto-expand');
    document.body.classList.remove('linkedin-buddy-enhanced');
    console.log('LinkedIn Buddy: All features disabled - cleaned up');
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'toggleAutoExpandPosts':
          this.toggleAutoExpandPosts(message.enabled);
          break;
        case 'toggleHideImages':
          this.toggleHideImages(message.enabled);
          break;
      }
    });
  }

  toggleHideImages(enabled) {
    if (enabled && this.isHomepage() && !this.isNotificationsPage()) {
      this.startImageHiding();
    } else {
      this.stopImageHiding();
      this.restoreAllImages();
    }
  }

  toggleAutoExpandPosts(enabled) {
    if (enabled && this.isHomepage() && !this.isNotificationsPage()) {
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
