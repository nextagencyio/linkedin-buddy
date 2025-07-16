// LinkedIn Buddy Content Script

class LinkedInBuddy {
  constructor() {
    this.chatWidget = null;
    this.toggleButton = null;
    this.isInitialized = false;
    this.imageObserver = null;
    this.sponsoredObserver = null;
    this.recommendedObserver = null;
    this.settings = {
      chatAssistant: false,
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

        // Check networkInfo if it exists
        if (profile.networkInfo && profile.networkInfo.followerCount !== undefined) {
          console.log(`LinkedIn Buddy: Got follower count from networkInfo: ${profile.networkInfo.followerCount}`);
          return profile.networkInfo.followerCount;
        }
      }

      // Try specific follower endpoints
      const followerData = await this.fetchFollowerData();
      if (followerData !== null) {
        console.log(`LinkedIn Buddy: Got follower count from follower endpoint: ${followerData}`);
        return followerData;
      }

      // Try to get from profile page
      const profilePageFollowers = await this.fetchFollowersFromProfilePage();
      if (profilePageFollowers !== null) {
        console.log(`LinkedIn Buddy: Got follower count from profile page: ${profilePageFollowers}`);
        return profilePageFollowers;
      }

      // Fallback: try to scrape from DOM
      const domFollowers = this.scrapeFollowerCountFromDOM();
      if (domFollowers !== null) {
        console.log(`LinkedIn Buddy: Got follower count from DOM: ${domFollowers}`);
        return domFollowers;
      }

      console.log('LinkedIn Buddy: Could not find follower count from any source');
      return null;
    } catch (error) {
      console.error('LinkedIn Buddy: Failed to get follower count:', error);
    }
    return null;
  }

  async fetchFollowerData() {
    try {
      const endpoints = [
        // Standard profile endpoints
        'identity/profiles/me/following',
        'identity/profiles/me/followers',
        'identity/profiles/me/followingInfo',
        'identity/followingState',
        'me/following',
        'me/followers',

        // Network manager specific endpoints (based on the URL structure)
        'identity/networkManager/followers',
        'networkManager/people-follow/followers',
        'mynetwork/network-manager/people-follow/followers',
        'voyagerSocialDashFollowers',
        'voyagerSocialDashFollowing',

        // Try search/query endpoints that might contain follower info
        'search/hits?keywords=followers',
        'identity/dash/followerInfo'
      ];

      for (const endpoint of endpoints) {
        console.log(`LinkedIn Buddy: Trying follower endpoint: ${endpoint}`);
        const data = await this.fetchVoyagerData(endpoint);
        if (data) {
          console.log(`LinkedIn Buddy: Follower response from ${endpoint}:`, data);

          // Direct follower count
          if (data.followerCount !== undefined) {
            console.log(`LinkedIn Buddy: Found direct followerCount: ${data.followerCount}`);
            return data.followerCount;
          }

          if (data.data && data.data.followerCount !== undefined) {
            console.log(`LinkedIn Buddy: Found followerCount in data: ${data.data.followerCount}`);
            return data.data.followerCount;
          }

          // Check for totalCount or count fields
          if (data.paging && data.paging.total !== undefined) {
            console.log(`LinkedIn Buddy: Found total count in paging: ${data.paging.total}`);
            return data.paging.total;
          }

          if (data.totalCount !== undefined) {
            console.log(`LinkedIn Buddy: Found totalCount: ${data.totalCount}`);
            return data.totalCount;
          }

          // Check if it's a list and has total info
          if (data.elements && Array.isArray(data.elements)) {
            console.log(`LinkedIn Buddy: Found ${data.elements.length} elements in ${endpoint}`);

            // If we have paging info, that might tell us the total
            if (data.paging && data.paging.total !== undefined) {
              return data.paging.total;
            }

            // Some endpoints might return all followers (if count is reasonable)
            if (data.elements.length > 0 && data.elements.length < 10000) {
              console.log(`LinkedIn Buddy: Using element count as follower count: ${data.elements.length}`);
              return data.elements.length;
            }
          }

          // Search through included data for follower info
          if (data.included && Array.isArray(data.included)) {
            for (const item of data.included) {
              if (item.followerCount !== undefined) {
                console.log(`LinkedIn Buddy: Found followerCount in included: ${item.followerCount}`);
                return item.followerCount;
              }
            }
          }
        }
      }
    } catch (error) {
      console.log('LinkedIn Buddy: Error fetching follower data:', error);
    }
    return null;
  }

  async fetchFollowersFromProfilePage() {
    try {
      // Use the correct LinkedIn followers page URL
      const followersUrl = 'https://www.linkedin.com/mynetwork/network-manager/people-follow/followers/';

      console.log(`LinkedIn Buddy: Trying to fetch follower count from: ${followersUrl}`);

      const response = await fetch(followersUrl, {
        credentials: 'same-origin',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        console.log(`LinkedIn Buddy: Could not fetch followers page (${response.status})`);
        return null;
      }

      const html = await response.text();
      console.log('LinkedIn Buddy: Successfully fetched followers page');

      // Look for follower count in the HTML - enhanced patterns for the followers page
      const patterns = [
        // Common patterns for follower count
        /(\d+(?:,\d+)*)\s*followers?/gi,
        /followers?\s*\((\d+(?:,\d+)*)\)/gi,
        /(\d+(?:,\d+)*)\s*people follow you/gi,

        // JSON data patterns
        /"followerCount"\s*:\s*(\d+)/gi,
        /'followerCount'\s*:\s*(\d+)/gi,
        /"totalFollowers"\s*:\s*(\d+)/gi,
        /"count"\s*:\s*(\d+)/gi,

        // Page title or header patterns
        /Your (\d+(?:,\d+)*) followers/gi,
        /(\d+(?:,\d+)*) followers following you/gi,

        // HTML element patterns
        /<h1[^>]*>(\d+(?:,\d+)*)[^<]*followers?<\/h1>/gi,
        /<span[^>]*>(\d+(?:,\d+)*)[^<]*followers?<\/span>/gi,

        // Network manager specific patterns
        /network-manager.*?(\d+(?:,\d+)*)/gi,
        /people-follow.*?(\d+(?:,\d+)*)/gi
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          const count = parseInt(match[1].replace(/,/g, ''));
          if (count >= 0 && count < 1000000) { // Reasonable range
            console.log(`LinkedIn Buddy: Found follower count in followers page: ${count} (pattern: ${pattern})`);
            return count;
          }
        }
      }

      // If no patterns match, log part of the HTML for debugging
      const htmlSnippet = html.substring(0, 1000);
      console.log('LinkedIn Buddy: No follower count found. HTML snippet:', htmlSnippet);

    } catch (error) {
      console.log('LinkedIn Buddy: Could not fetch follower count from followers page:', error);
    }
    return null;
  }

  async getConnectionsCount() {
    try {
      // First try the API
      const networkInfo = await this.getNetworkInfo();
      if (networkInfo && networkInfo.connectionsCount !== undefined && networkInfo.connectionsCount > 500) {
        console.log(`LinkedIn Buddy: Got real connection count from API: ${networkInfo.connectionsCount}`);
        return networkInfo.connectionsCount;
      }

      // If API returns 500 or null, try to get the real count from My Network page
      const realCount = await this.fetchRealConnectionsCount();
      if (realCount && realCount > 500) {
        console.log(`LinkedIn Buddy: Got real connection count from network page: ${realCount}`);
        return realCount;
      }

      // Fallback: try to scrape from current DOM
      const domCount = this.scrapeConnectionsCountFromDOM();
      if (domCount && domCount > 500) {
        console.log(`LinkedIn Buddy: Got real connection count from DOM: ${domCount}`);
        return domCount;
      }

      // If we only got 500 or less, it's likely the limited public view
      if (networkInfo && networkInfo.connectionsCount !== undefined) {
        console.log(`LinkedIn Buddy: Only got limited count: ${networkInfo.connectionsCount}, but showing anyway`);
        return networkInfo.connectionsCount;
      }

      return domCount;
    } catch (error) {
      console.error('LinkedIn Buddy: Failed to get connections count:', error);
    }
    return null;
  }

  async fetchRealConnectionsCount() {
    try {
      // Try to fetch the My Network page to get the real connection count
      const response = await fetch('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        console.log('LinkedIn Buddy: Could not fetch network page');
        return null;
      }

      const html = await response.text();

      // Parse the HTML to find the connection count
      const patterns = [
        /(\d+(?:,\d+)*)\s*connections?/gi,
        /"connectionsCount"\s*:\s*(\d+)/gi,
        /'connectionsCount'\s*:\s*(\d+)/gi,
        /connections.*?(\d+(?:,\d+)*)/gi
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          const count = parseInt(match[1].replace(/,/g, ''));
          if (count > 500 && count < 100000) { // Reasonable range
            console.log(`LinkedIn Buddy: Found real connection count in network page HTML: ${count}`);
            return count;
          }
        }
      }

    } catch (error) {
      console.log('LinkedIn Buddy: Could not fetch real connections count from network page:', error);
    }
    return null;
  }

  scrapeFollowerCountFromDOM() {
    // Try to find follower count in existing DOM elements
    try {
      console.log('LinkedIn Buddy: Attempting to scrape follower count from DOM...');

      // Enhanced selectors for follower count
      const selectors = [
        // Direct follower links and elements
        '[data-control-name*="followers"]',
        '[href*="/followers/"]',
        '[href*="/me/followers/"]',

        // Profile specific selectors
        '.pv-top-card-profile-picture__image ~ * .t-14',
        '.pv-text-details__left-panel .t-14',
        '.pv-top-card .t-14',

        // Navigation and menu items
        '.global-nav__secondary-link[href*="followers"]',
        '.global-nav__primary-link[href*="followers"]',

        // Stats and numbers
        '.artdeco-card .t-bold',
        '.entity-list-item .t-bold',
        '.feed-identity-widget-item__stat strong',

        // General text elements that might contain follower info
        '.t-12.t-black--light',
        '.t-14.t-black--light',
        '.text-body-small',
        '.text-align-left .t-bold',

        // Try broader searches
        '*[class*="followers"]',
        '*[class*="follower"]'
      ];

      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent.trim();
            console.log(`LinkedIn Buddy: Checking follower element "${selector}": "${text}"`);

            // Multiple patterns to match follower counts
            const patterns = [
              /(\d+(?:,\d+)*)\s*followers?/i,
              /followers?\s*(\d+(?:,\d+)*)/i,
              /^(\d+(?:,\d+)*)$/, // Just a number by itself
              /(\d+(?:,\d+)*)\s*people follow/i
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match) {
                const count = parseInt(match[1].replace(/,/g, ''));
                // Return any reasonable follower count (0 to 1M)
                if (count >= 0 && count <= 1000000) {
                  console.log(`LinkedIn Buddy: Found follower count in DOM: ${count} from "${text}"`);
                  return count;
                }
              }
            }
          }
        } catch (selectorError) {
          console.log(`LinkedIn Buddy: Error with selector ${selector}:`, selectorError);
        }
      }

      // Special search in page text for follower mentions
      const bodyText = document.body.textContent;
      const bodyMatches = [...bodyText.matchAll(/(\d+(?:,\d+)*)\s*followers?/gi)];
      for (const match of bodyMatches) {
        const count = parseInt(match[1].replace(/,/g, ''));
        if (count >= 0 && count <= 1000000) {
          console.log(`LinkedIn Buddy: Found follower count in page text: ${count}`);
          return count;
        }
      }

    } catch (error) {
      console.log('LinkedIn Buddy: Could not scrape follower count from DOM:', error);
    }

    console.log('LinkedIn Buddy: No follower count found in DOM');
    return null;
  }

  scrapeConnectionsCountFromDOM() {
    // Try to find connections count in existing DOM elements
    try {
      // Look for the real connection count in various places
      const selectors = [
        // Network page specific selectors
        '[data-test-id*="connections-count"]',
        '.mn-connections__header .t-20',
        '.mn-connections__header strong',

        // Profile navigation items
        '[data-control-name*="network"] .t-12',
        '[href*="/mynetwork/"] .t-12',
        '[href*="/connections/"] .t-12',

        // Network widget selectors
        '.network-widget-item__count',
        '.network-summary-card__count',

        // General selectors that might contain connection info
        '.feed-identity-widget-item__stat strong',
        '.entity-list-item .t-bold',

        // Try searching for actual numbers without "500+" limitation
        '*[class*="connections"] .t-12',
        '*[class*="network"] .t-12'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent.trim();
          console.log(`LinkedIn Buddy: Checking element "${selector}": "${text}"`);

          // Look for patterns like "1,560 connections" or just "1,560"
          const patterns = [
            /(\d+(?:,\d+)*)\s*connections?/i,
            /connections?\s*(\d+(?:,\d+)*)/i,
            /^(\d+(?:,\d+)*)$/
          ];

          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              const count = parseInt(match[1].replace(/,/g, ''));
              // Only return if it's a reasonable connection count (more than 500 or less than 100000)
              if (count > 500 || count < 100000) {
                console.log(`LinkedIn Buddy: Found connection count in DOM: ${count}`);
                return count;
              }
            }
          }
        }
      }

      // Special check for profile breadcrumb or header that might show real count
      const profileElements = document.querySelectorAll('h1, .pv-text-details__left-panel .t-14, .ph5 .t-14');
      for (const element of profileElements) {
        const text = element.textContent;
        if (text.includes('connections') && !text.includes('500+')) {
          const match = text.match(/(\d+(?:,\d+)*)\s*connections?/i);
          if (match) {
            const count = parseInt(match[1].replace(/,/g, ''));
            if (count > 500) {
              console.log(`LinkedIn Buddy: Found real connection count in profile: ${count}`);
              return count;
            }
          }
        }
      }

    } catch (error) {
      console.log('LinkedIn Buddy: Could not scrape connections count from DOM:', error);
    }
    return null;
  }

  formatNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
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

  startAutoHideRecommended() {
    // Create observer for automatically hiding recommended posts
    if (this.recommendedObserver) {
      this.recommendedObserver.disconnect();
    }

    this.recommendedObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            this.hideNewRecommendedPosts(node);
          }
        });
      });
    });

    this.recommendedObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also hide existing recommended posts
    this.hideNewRecommendedPosts(document);
  }

  stopAutoHideRecommended() {
    if (this.recommendedObserver) {
      this.recommendedObserver.disconnect();
      this.recommendedObserver = null;
    }
  }

  hideNewRecommendedPosts(container) {
    let hiddenCount = 0;

    // Find posts with "Recommended for you" header
    const recommendedHeaders = container.querySelectorAll ? container.querySelectorAll('.update-components-header__text-view') : [];

    recommendedHeaders.forEach(header => {
      if (header.textContent.trim() === 'Recommended for you') {
        // Find the containing feed post
        const feedPost = header.closest('.feed-shared-update-v2');
        if (feedPost && feedPost.style.display !== 'none') {
          feedPost.style.display = 'none';
          hiddenCount++;
          console.log('LinkedIn Buddy: Hidden recommended post', feedPost);
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
      const elements = container.querySelectorAll ? container.querySelectorAll(selector) : [];
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
    this.setupMessageListener();
    this.setupUrlChangeListener();
    // Clean up any existing stats injections
    this.cleanupStatsInjections();
    this.isInitialized = true;
  }

  cleanupStatsInjections() {
    const addedStats = document.querySelectorAll('.linkedin-buddy-stat');
    addedStats.forEach(stat => stat.remove());
    console.log(`LinkedIn Buddy: Cleaned up ${addedStats.length} existing stat injections`);
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
    chrome.storage.sync.get(['chatAssistant', 'autoExpandPosts', 'autoHideSponsored', 'autoHideRecommended', 'hideImages'], (result) => {
      this.settings = {
        chatAssistant: result.chatAssistant || false,
        autoExpandPosts: result.autoExpandPosts !== undefined ? result.autoExpandPosts : true,
        autoHideSponsored: result.autoHideSponsored || false,
        autoHideRecommended: result.autoHideRecommended || false,
        hideImages: result.hideImages || false,
      };
      this.applySettings();
    });
  }

  applySettings() {
    this.toggleChatAssistant(this.settings.chatAssistant);
    this.toggleAutoExpandPosts(this.settings.autoExpandPosts);
    this.toggleAutoHideSponsored(this.settings.autoHideSponsored);
    this.toggleAutoHideRecommended(this.settings.autoHideRecommended);
    this.toggleHideImages(this.settings.hideImages);
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



  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
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
    if (enabled) {
      this.startAutoHideSponsored();
    } else {
      this.stopAutoHideSponsored();
    }
  }

  toggleAutoHideRecommended(enabled) {
    if (enabled) {
      this.startAutoHideRecommended();
    } else {
      this.stopAutoHideRecommended();
    }
  }

  toggleHideImages(enabled) {
    if (enabled) {
      this.startImageHiding();
    } else {
      this.stopImageHiding();
      this.restoreAllImages();
    }
  }

  startImageHiding() {
    // Create observer for automatically hiding images in posts
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }

    this.imageObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            this.hideImagesInNode(node);
          }
        });
      });
    });

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

  hideImagesInNode(node) {
    // Find image containers in the node
    const imageContainers = node.querySelectorAll ?
      node.querySelectorAll('.update-components-image') : [];

    imageContainers.forEach(container => {
      if (container.querySelector('.linkedin-buddy-show-image-btn')) {
        return; // Already processed
      }

      const img = container.querySelector('.update-components-image__image');
      if (img && img.style.display !== 'none') {
        this.hideImage(container, img);
      }
    });

    // Also check if the node itself is an image container
    if (node.classList && node.classList.contains('update-components-image')) {
      const img = node.querySelector('.update-components-image__image');
      if (img && img.style.display !== 'none' && !node.querySelector('.linkedin-buddy-show-image-btn')) {
        this.hideImage(node, img);
      }
    }
  }

  hideImage(container, img) {
    // Create the show image button
    const showButton = document.createElement('div');
    showButton.className = 'linkedin-buddy-show-image-btn';
    showButton.innerHTML = `
      <button type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14.5 3h-13A1.5 1.5 0 000 4.5v7A1.5 1.5 0 001.5 13h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 3zM3 6a1 1 0 110-2 1 1 0 010 2zm11 5H2V9l2.5-2.5L6 8l4.5-4.5L13 6v5z"/>
        </svg>
        Show Image
      </button>
    `;

    // Style the button to be compact
    showButton.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 4px;
      padding: 8px 12px;
    `;

    showButton.querySelector('button').style.cssText = `
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
    `;

    // Add click handler to show the image
    showButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      img.style.display = '';
      showButton.remove();
    });

    // Hide the image and add the button
    img.style.display = 'none';
    container.style.position = 'relative';
    container.appendChild(showButton);
  }

  restoreAllImages() {
    // Remove all show image buttons and restore images
    const showButtons = document.querySelectorAll('.linkedin-buddy-show-image-btn');
    showButtons.forEach(button => {
      const container = button.parentElement;
      const img = container.querySelector('.update-components-image__image');
      if (img) {
        img.style.display = '';
      }
      button.remove();
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

  hideRecommendedPosts() {
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
