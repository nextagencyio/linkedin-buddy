// LinkedIn Buddy Content Script

class LinkedInBuddy {
  constructor() {
    this.isInitialized = false;
    this.imageObserver = null;
    this.sponsoredObserver = null;
    this.recommendedObserver = null;
    this.settings = {
      autoExpandPosts: true,
      autoHideSponsored: false,
      autoHideRecommended: false,
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

  startAutoHideSponsored() {
    // Create observer for automatically hiding sponsored posts
    if (this.sponsoredObserver) {
      this.sponsoredObserver.disconnect();
    }

    // Run immediately
    this.hideSponsoredPosts();

    // Set up observer for new posts
    this.sponsoredObserver = new MutationObserver((mutations) => {
      // Only process mutations if we're on the homepage and not notifications
      if (!this.isHomepage() || this.isNotificationsPage()) {
        return;
      }

      let shouldCheck = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            if (node.classList?.contains('feed-shared-update-v2') ||
              node.querySelector?.('.feed-shared-update-v2')) {
              shouldCheck = true;
            }
          }
        });
      });

      if (shouldCheck) {
        // Throttle the check
        clearTimeout(this.sponsoredTimeout);
        this.sponsoredTimeout = setTimeout(() => {
          this.hideSponsoredPosts();
        }, 500);
      }
    });

    this.sponsoredObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stopAutoHideSponsored() {
    if (this.sponsoredObserver) {
      this.sponsoredObserver.disconnect();
      this.sponsoredObserver = null;
    }
    if (this.sponsoredTimeout) {
      clearTimeout(this.sponsoredTimeout);
      this.sponsoredTimeout = null;
    }
  }

  startAutoHideRecommended() {
    // Create observer for automatically hiding recommended posts
    if (this.recommendedObserver) {
      this.recommendedObserver.disconnect();
    }

    // Run immediately
    this.hideRecommendedPosts();

    // Set up observer for new posts
    this.recommendedObserver = new MutationObserver((mutations) => {
      // Only process mutations if we're on the homepage and not notifications
      if (!this.isHomepage() || this.isNotificationsPage()) {
        return;
      }

      let shouldCheck = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.classList?.contains('feed-shared-update-v2') ||
              node.querySelector?.('.feed-shared-update-v2') ||
              node.querySelector?.('.update-components-header__text-view')) {
              shouldCheck = true;
            }
          }
        });
      });

      if (shouldCheck) {
        clearTimeout(this.recommendedTimeout);
        this.recommendedTimeout = setTimeout(() => {
          this.hideRecommendedPosts();
        }, 500);
      }
    });

    this.recommendedObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stopAutoHideRecommended() {
    if (this.recommendedObserver) {
      this.recommendedObserver.disconnect();
      this.recommendedObserver = null;
    }
    if (this.recommendedTimeout) {
      clearTimeout(this.recommendedTimeout);
      this.recommendedTimeout = null;
    }
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

  autoHideRecommendedContent() {
    // Only auto-hide on homepage/feed page
    if (!this.isHomepage() || this.isNotificationsPage()) {
      return;
    }

    let hiddenCount = 0;

    // Find posts with "Recommended for you" header
    const recommendedHeaders = document.querySelectorAll('.update-components-header__text-view');

    recommendedHeaders.forEach(header => {
      if (header.textContent.trim() === 'Recommended for you') {
        const feedPost = header.closest('.feed-shared-update-v2');
        if (feedPost && feedPost.style.display !== 'none') {
          feedPost.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Auto-hidden recommended post', feedPost);
        }
      }
    });

    // Also check for aggregated recommendation containers
    const aggregatedSelectors = [
      '[data-urn*="urn:li:aggregate:"]',
      '.feed-shared-aggregated-content',
      '.update-components-feed-discovery-entity'
    ];

    aggregatedSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const hasRecommendedText = element.textContent.includes('Recommended for you') ||
          element.textContent.includes('People who are in') ||
          element.textContent.includes('Trending pages in your network') ||
          element.querySelector('.update-components-feed-discovery-entity');

        if (hasRecommendedText) {
          const postContainer = element.closest('.feed-shared-update-v2') || element;
          if (postContainer && postContainer.style.display !== 'none') {
            postContainer.style.display = 'none';
            hiddenCount++;
            console.log('LinkedIn Buddy: Hidden recommended aggregated content', postContainer);
          }
        }
      });
    });

    if (hiddenCount > 0) {
      console.log(`LinkedIn Buddy: Auto-hidden ${hiddenCount} recommended posts`);
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
        this.settings.autoHideSponsored ||
        this.settings.autoHideRecommended ||
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
    chrome.storage.sync.get(['autoExpandPosts', 'autoHideSponsored', 'autoHideRecommended', 'hideImages'], (result) => {
      this.settings = {
        autoExpandPosts: result.autoExpandPosts !== undefined ? result.autoExpandPosts : true,
        autoHideSponsored: result.autoHideSponsored || false,
        autoHideRecommended: result.autoHideRecommended || false,
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
    this.toggleAutoHideSponsored(this.settings.autoHideSponsored);
    this.toggleAutoHideRecommended(this.settings.autoHideRecommended);
    this.toggleHideImages(this.settings.hideImages);

    // If no features are enabled, ensure we clean up everything
    if (!this.isAnyFeatureEnabled()) {
      this.cleanupAllFeatures();
    }
  }

  cleanupAllFeatures() {
    this.stopAutoHideSponsored();
    this.stopAutoHideRecommended();
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
        case 'toggleAutoHideSponsored':
          this.toggleAutoHideSponsored(message.enabled);
          break;
        case 'toggleAutoHideRecommended':
          this.toggleAutoHideRecommended(message.enabled);
          break;
        case 'toggleHideImages':
          this.toggleHideImages(message.enabled);
          break;
      }
    });
  }

  toggleAutoHideSponsored(enabled) {
    if (enabled && this.isHomepage() && !this.isNotificationsPage()) {
      this.startAutoHideSponsored();
    } else {
      this.stopAutoHideSponsored();
    }
  }

  toggleAutoHideRecommended(enabled) {
    if (enabled && this.isHomepage() && !this.isNotificationsPage()) {
      this.startAutoHideRecommended();
    } else {
      this.stopAutoHideRecommended();
    }
  }

  toggleHideImages(enabled) {
    if (enabled && this.isHomepage() && !this.isNotificationsPage()) {
      this.startImageHiding();
    } else {
      this.stopImageHiding();
      this.restoreAllImages();
    }
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
      case 'hideRecommended':
        this.hideRecommendedPosts();
        // Also enable auto-hide for convenience
        this.toggleAutoHideRecommended(true);
        break;
      case 'enhanceSearch':
        this.showNotification('Search enhancement feature coming soon!');
        break;
    }
  }

  hideSponsoredPosts() {
    // Only hide posts on homepage/feed page
    if (!this.isHomepage() || this.isNotificationsPage()) {
      return;
    }

    let hiddenCount = 0;

    // Find all feed posts using multiple selectors for better coverage
    const postSelectors = [
      '.feed-shared-update-v2',
      '[data-id^="urn:li:activity"]',
      '[data-test-id="main-feed-activity-card"]'
    ];

    let feedPosts = [];
    postSelectors.forEach(selector => {
      const posts = document.querySelectorAll(selector);
      feedPosts = feedPosts.concat(Array.from(posts));
    });

    // Remove duplicates
    feedPosts = [...new Set(feedPosts)];

    feedPosts.forEach(post => {
      // Skip if already hidden
      if (post.style.display === 'none') return;

      // Check if post has the dismiss/hide button - if not, it's likely a sponsored post
      const hideButton = post.querySelector('.feed-shared-control-menu__hide-post-button');

      if (!hideButton) {
        // Enhanced detection for sponsored content
        const postText = post.textContent || '';

        // Check for promoted/sponsored text with better patterns
        const hasPromotedText = /\b(Promoted|Sponsored)\b/i.test(postText) ||
          /\b(Promoted by|Sponsored by)\b/i.test(postText) ||
          /\bAd\b/i.test(postText);

        // Check for follow button (common in sponsored posts)
        const hasFollowButton = post.querySelector('.update-components-actor__follow-button');

        // Check for other sponsored indicators
        const hasPromotedLabel = post.querySelector('[aria-label*="Promoted"]') ||
          post.querySelector('[aria-label*="Sponsored"]');

        // Check for sponsored data attributes
        const hasSponsoredData = post.hasAttribute('data-id') &&
          post.getAttribute('data-id').includes('sponsoredUpdate');

        // Check specifically for "Promoted" in actor sub-description
        const actorSubDescription = post.querySelector('.update-components-actor__sub-description');
        const hasPromotedInSubDesc = actorSubDescription &&
          /\b(Promoted|Sponsored)\b/i.test(actorSubDescription.textContent);

        // Check for sponsored content links (common pattern)
        const hasSponsoredLink = post.querySelector('a[href*="utm_"]') ||
          post.querySelector('a[attributionsrc*="ads.linkedin.com"]');

        // If no hide button AND has sponsored indicators, hide it
        if (hasPromotedText || hasPromotedInSubDesc || hasFollowButton || hasPromotedLabel || hasSponsoredData || hasSponsoredLink) {
          post.style.display = 'none';
          hiddenCount++;
        }
      }
    });

    // Also check for explicit sponsored selectors as backup
    const sponsoredSelectors = [
      '[data-id*="urn:li:sponsoredUpdate"]',
      '[data-id*="sponsoredUpdate"]',
      '[aria-label*="Promoted"]',
      '[aria-label*="Sponsored"]',
      '[data-test-id*="sponsored"]',
      '.ad-banner-container',
      '.sponsored-post'
    ];

    sponsoredSelectors.forEach(selector => {
      const sponsoredPosts = document.querySelectorAll(selector);
      sponsoredPosts.forEach(post => {
        const postContainer = post.closest('.feed-shared-update-v2') ||
          post.closest('[data-id^="urn:li:activity"]') ||
          post.closest('[data-test-id="main-feed-activity-card"]') ||
          post;
        if (postContainer && postContainer.style.display !== 'none') {
          postContainer.style.display = 'none';
          hiddenCount++;
        }
      });
    });

    this.showNotification(`Hidden ${hiddenCount} sponsored posts`);
  }

  hideRecommendedPosts() {
    // Only hide posts on homepage/feed page
    if (!this.isHomepage() || this.isNotificationsPage()) {
      console.log('LinkedIn Buddy: Skipping recommended post hiding - not on homepage/feed');
      return;
    }

    let hiddenCount = 0;

    // Find posts with "Recommended for you" header
    const recommendedHeaders = document.querySelectorAll('.update-components-header__text-view');
    console.log(`LinkedIn Buddy: Found ${recommendedHeaders.length} header elements to check`);

    recommendedHeaders.forEach((header, index) => {
      if (header.textContent.trim() === 'Recommended for you') {
        // Find the containing feed post
        const feedPost = header.closest('.feed-shared-update-v2');
        if (feedPost && feedPost.style.display !== 'none') {
          feedPost.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Hidden recommended post (manual)', feedPost);
        }
      }
    });

    // Also look for aggregated recommendation containers
    const aggregatedSelectors = [
      '[data-urn*="urn:li:aggregate:"]',
      '.feed-shared-aggregated-content',
      '.update-components-feed-discovery-entity'
    ];

    aggregatedSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        // Check if this contains recommendation content
        const hasRecommendedText = element.textContent.includes('Recommended for you') ||
          element.textContent.includes('People who are in') ||
          element.textContent.includes('Trending pages in your network') ||
          element.querySelector('.update-components-feed-discovery-entity');

        if (hasRecommendedText) {
          const postContainer = element.closest('.feed-shared-update-v2') || element;
          if (postContainer && postContainer.style.display !== 'none') {
            postContainer.style.display = 'none';
            hiddenCount++;
            console.log('LinkedIn Buddy: Hidden recommended aggregated content (manual)', postContainer);
          }
        }
      });
    });

    this.showNotification(`Hidden ${hiddenCount} recommended posts`);
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
