// LinkedIn Buddy Content Script

class LinkedInBuddy {
  constructor() {
    this.chatWidget = null;
    this.toggleButton = null;
    this.isInitialized = false;
    this.imageObserver = null;
    this.sponsoredObserver = null;
    this.recommendedObserver = null;
    this.apiBaseUrl = 'http://localhost:3000';
    this.postDatabase = [];
    this.lastPostSync = 0;
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

    // Throttle processing to avoid interference
    let sponsoredTimeout = null;
    const throttledSponsoredProcess = (mutations) => {
      if (sponsoredTimeout) {
        clearTimeout(sponsoredTimeout);
      }

      sponsoredTimeout = setTimeout(() => {
        try {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                // Check if this node or any of its children contain posts
                if (node.matches && (
                  node.matches('.feed-shared-update-v2') ||
                  node.matches('[data-id^="urn:li:activity"]') ||
                  node.querySelector('.feed-shared-update-v2') ||
                  node.querySelector('[data-id^="urn:li:activity"]')
                )) {
                  this.hideNewSponsoredPosts(node);
                }
              }
            });
          });
        } catch (error) {
          console.warn('LinkedIn Buddy: Error in sponsored posts observer:', error);
        }
      }, 200);
    };

    this.sponsoredObserver = new MutationObserver(throttledSponsoredProcess);

    this.sponsoredObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also hide existing sponsored posts
    setTimeout(() => {
      this.hideNewSponsoredPosts(document);
    }, 1500);

    // Add periodic check to catch any sponsored posts that might slip through
    if (this.sponsoredPeriodicCheck) {
      clearInterval(this.sponsoredPeriodicCheck);
    }
    this.sponsoredPeriodicCheck = setInterval(() => {
      if (this.isHomepage() && !this.isNotificationsPage()) {
        this.hideNewSponsoredPosts(document);
      }
    }, 3000);
  }

  hideNewSponsoredPosts(container) {
    let hiddenCount = 0;

    // Find all feed posts using multiple selectors for better coverage
    const postSelectors = [
      '.feed-shared-update-v2',
      '[data-id^="urn:li:activity"]',
      '[data-test-id="main-feed-activity-card"]'
    ];

    let feedPosts = [];
    postSelectors.forEach(selector => {
      if (container.querySelectorAll) {
        const posts = container.querySelectorAll(selector);
        feedPosts = feedPosts.concat(Array.from(posts));
      }
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
      const sponsoredPosts = container.querySelectorAll ? container.querySelectorAll(selector) : [];
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
  }

  stopAutoHideSponsored() {
    if (this.sponsoredObserver) {
      this.sponsoredObserver.disconnect();
      this.sponsoredObserver = null;
    }
    if (this.sponsoredPeriodicCheck) {
      clearInterval(this.sponsoredPeriodicCheck);
      this.sponsoredPeriodicCheck = null;
    }
  }

  startAutoHideRecommended() {
    // Create observer for automatically hiding recommended posts
    if (this.recommendedObserver) {
      this.recommendedObserver.disconnect();
    }

    // Throttle processing to avoid interference
    let recommendedTimeout = null;
    const throttledRecommendedProcess = (mutations) => {
      if (recommendedTimeout) {
        clearTimeout(recommendedTimeout);
      }

      recommendedTimeout = setTimeout(() => {
        try {
          mutations.forEach((mutation) => {
            // Only process feed-related mutations
            const target = mutation.target;
            if (!target || !target.closest) return;

            const feedContainer = target.closest('.scaffold-layout__main') ||
              target.closest('.feed-container-v2');

            if (!feedContainer) return;

            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                this.hideNewRecommendedPosts(node);
              }
            });
          });
        } catch (error) {
          console.warn('LinkedIn Buddy: Error in recommended posts observer:', error);
        }
      }, 250);
    };

    this.recommendedObserver = new MutationObserver(throttledRecommendedProcess);

    this.recommendedObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also hide existing recommended posts
    setTimeout(() => {
      this.hideNewRecommendedPosts(document);
    }, 2000);
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
    
    this.createChatToggleButton();
    this.createChatWidget();
    this.setupMessageListener();
    

    // Start extracting and syncing post content
    this.startPostExtraction();

    // Add periodic check to ensure features are working on homepage
    this.startPeriodicCheck();
  }

  startPeriodicCheck() {
    // Check every 5 seconds if we're on homepage but features aren't active
    this.periodicCheckInterval = setInterval(() => {
      if (this.isHomepage() && this.settings.chatAssistant && this.toggleButton.style.display === 'none') {
        console.log('LinkedIn Buddy: Detected homepage but features not active - reapplying settings');
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
      return this.settings.chatAssistant ||
        this.settings.autoExpandPosts ||
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
      this.destroyHomepageElements();
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
    chrome.storage.sync.get(['chatAssistant', 'autoExpandPosts', 'autoHideSponsored', 'autoHideRecommended', 'hideImages'], (result) => {
      this.settings = {
        chatAssistant: result.chatAssistant || false,
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

    this.toggleChatAssistant(this.settings.chatAssistant);
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
    this.stopPostExtraction();
    this.stopPeriodicCheck();
    
    // Hide UI elements but don't remove them
    if (this.toggleButton) {
      this.toggleButton.style.display = 'none';
    }
    if (this.chatWidget) {
      this.chatWidget.classList.remove('visible');
    }
    
    document.body.classList.remove('linkedin-buddy-auto-expand');
    document.body.classList.remove('linkedin-buddy-enhanced');
    console.log('LinkedIn Buddy: All features disabled - cleaned up');
  }

  destroyHomepageElements() {
    console.log('LinkedIn Buddy: Destroying homepage elements');
    
    // Completely remove toggle button
    if (this.toggleButton && this.toggleButton.parentNode) {
      this.toggleButton.parentNode.removeChild(this.toggleButton);
      this.toggleButton = null;
    }

    // Completely remove chat widget
    if (this.chatWidget && this.chatWidget.parentNode) {
      this.chatWidget.parentNode.removeChild(this.chatWidget);
      this.chatWidget = null;
    }

    // Note: We keep the URL change listener active so we can detect
    // when the user returns to the homepage
  }

  createChatToggleButton() {
    // Don't create if it already exists
    if (this.toggleButton) {
      return;
    }
    
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

    // Hide by default until settings are loaded
    this.toggleButton.style.display = 'none';

    this.toggleButton.addEventListener('click', () => {
      this.toggleChat();
    });

    document.body.appendChild(this.toggleButton);
  }

  createChatWidget() {
    // Don't create if it already exists
    if (this.chatWidget) {
      return;
    }
    
    this.chatWidget = document.createElement('div');
    this.chatWidget.className = 'linkedin-buddy-chat';
    this.chatWidget.innerHTML = `
      <div class="chat-header">
        <h3>LinkedIn Buddy</h3>
        <div class="post-counter" id="postCounter">
          <span class="post-count">0</span> posts analyzed
        </div>
        <button class="chat-close">×</button>
      </div>
                  <div class="chat-messages" id="chatMessages">
        <div class="chat-message assistant" id="welcomeMessage">
          👋 Hi! I'm LinkedIn Buddy.
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

    // Initialize post counter
    this.updatePostCounter();

    // Generate dynamic welcome message with post summaries if on homepage
    setTimeout(() => {
      this.updateWelcomeMessage();
    }, 2000); // Wait for posts to load
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
          console.warn('LinkedIn Buddy: Error in image hiding observer:', error);
        }
      }, 100); // 100ms throttle
    };

    this.imageObserver = new MutationObserver(throttledProcess);

    this.imageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Hide existing images
    setTimeout(() => {
      this.hideImagesInNode(document.body);
    }, 1000);

    // Add periodic check to catch any images that might slip through
    if (this.imagePeriodicCheck) {
      clearInterval(this.imagePeriodicCheck);
    }
    this.imagePeriodicCheck = setInterval(() => {
      if (this.isHomepage() && !this.isNotificationsPage()) {
        this.hideImagesInNode(document.body);
      }
    }, 2000);
  }

  stopImageHiding() {
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }
    if (this.imagePeriodicCheck) {
      clearInterval(this.imagePeriodicCheck);
      this.imagePeriodicCheck = null;
    }
  }

  hideImagesInNode(node) {
    try {
      // Skip if node is not a proper element
      if (!node || !node.nodeType || node.nodeType !== 1) {
        return;
      }

      // Skip LinkedIn system containers to avoid interference
      if (node.classList && (
        node.classList.contains('application-outlet') ||
        node.classList.contains('voyager-application') ||
        node.classList.contains('notifications-container') ||
        node.getAttribute('data-app-name')
      )) {
        return;
      }

      // Find image containers in the node
      const imageContainers = node.querySelectorAll ?
        node.querySelectorAll('.update-components-image') : [];

      imageContainers.forEach(container => {
        if (container.querySelector('.linkedin-buddy-show-image-btn')) {
          return; // Already processed
        }

        const images = container.querySelectorAll('.update-components-image__image');
        if (images.length > 0) {
          this.hideImagesInContainer(container, images);
        }
      });

      // Find document/carousel containers in the node
      const documentContainers = node.querySelectorAll ?
        node.querySelectorAll('.update-components-document__container') : [];

      documentContainers.forEach(container => {
        if (container.querySelector('.linkedin-buddy-show-image-btn')) {
          return; // Already processed
        }

        const iframe = container.querySelector('iframe');
        if (iframe) {
          this.hideDocumentContainer(container, iframe);
        }
      });

      // Also check if the node itself is an image container
      if (node.classList && node.classList.contains('update-components-image')) {
        const images = node.querySelectorAll('.update-components-image__image');
        if (images.length > 0 && !node.querySelector('.linkedin-buddy-show-image-btn')) {
          this.hideImagesInContainer(node, images);
        }
      }

      // Also check if the node itself is a document container
      if (node.classList && node.classList.contains('update-components-document__container')) {
        const iframe = node.querySelector('iframe');
        if (iframe && !node.querySelector('.linkedin-buddy-show-image-btn')) {
          this.hideDocumentContainer(node, iframe);
        }
      }
    } catch (error) {
      console.warn('LinkedIn Buddy: Error processing node for image hiding:', error);
    }
  }

  hideImagesInContainer(container, images) {
    // Store original styles to restore later
    const originalContainerStyle = container.style.cssText;
    const originalPaddingTop = container.querySelector('.update-components-image__container')?.style.paddingTop;
    const originalAspectRatio = container.querySelector('.update-components-image__container')?.style.aspectRatio;

    // Count visible images
    const visibleImages = Array.from(images).filter(img => img.style.display !== 'none');
    if (visibleImages.length === 0) return;

    const imageCount = visibleImages.length;
    const buttonText = imageCount === 1 ? 'Show Image' : `Show ${imageCount} Images`;

    // Create the show image button
    const showButton = document.createElement('div');
    showButton.className = 'linkedin-buddy-show-image-btn';
    showButton.innerHTML = `
      <button type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14.5 3h-13A1.5 1.5 0 000 4.5v7A1.5 1.5 0 001.5 13h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 3zM3 6a1 1 0 110-2 1 1 0 010 2zm11 5H2V9l2.5-2.5L6 8l4.5-4.5L13 6v5z"/>
        </svg>
        ${buttonText}
      </button>
    `;

    // Store original styles as data attributes for restoration
    showButton.setAttribute('data-original-container-style', originalContainerStyle);
    if (originalPaddingTop) {
      showButton.setAttribute('data-original-padding-top', originalPaddingTop);
    }
    if (originalAspectRatio) {
      showButton.setAttribute('data-original-aspect-ratio', originalAspectRatio);
    }

    // Style the button to be compact
    showButton.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 4px;
      padding: 8px 12px;
      margin: 8px auto;
      width: fit-content;
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

    // Add click handler to show all images
    showButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Restore original styles
      const originalContainerStyle = showButton.getAttribute('data-original-container-style');
      const originalPaddingTop = showButton.getAttribute('data-original-padding-top');
      const originalAspectRatio = showButton.getAttribute('data-original-aspect-ratio');

      container.style.cssText = originalContainerStyle;

      const containerElement = container.querySelector('.update-components-image__container');
      if (containerElement) {
        if (originalPaddingTop) {
          containerElement.style.paddingTop = originalPaddingTop;
        }
        if (originalAspectRatio) {
          containerElement.style.aspectRatio = originalAspectRatio;
        }
      }

      // Restore aspect ratios on individual image link buttons
      const imageLinks = container.querySelectorAll('.update-components-image__image-link');
      imageLinks.forEach(link => {
        const originalAspectRatio = link.getAttribute('data-original-aspect-ratio');
        if (originalAspectRatio) {
          link.style.aspectRatio = originalAspectRatio;
          link.removeAttribute('data-original-aspect-ratio');
        }
        link.style.height = '';
      });

      // Show all images in this container
      visibleImages.forEach(img => {
        img.style.display = '';
      });

      showButton.remove();
    });

    // Hide all images
    visibleImages.forEach(img => {
      img.style.display = 'none';
    });

    // Remove the styles that create the aspect ratio and height
    const containerElement = container.querySelector('.update-components-image__container');
    if (containerElement) {
      containerElement.style.paddingTop = '0';
      containerElement.style.height = 'auto';
      containerElement.style.aspectRatio = 'auto';
    }

    // Also reset aspect ratios on individual image link buttons
    const imageLinks = container.querySelectorAll('.update-components-image__image-link');
    imageLinks.forEach(link => {
      // Store original aspect ratio for restoration
      const originalAspectRatio = link.style.aspectRatio;
      if (originalAspectRatio) {
        link.setAttribute('data-original-aspect-ratio', originalAspectRatio);
      }
      link.style.aspectRatio = 'auto';
      link.style.height = 'auto';
    });

    // Make container compact
    container.style.position = 'relative';
    container.style.height = 'auto';
    container.style.minHeight = 'auto';

    container.appendChild(showButton);
  }

  hideDocumentContainer(container, iframe) {
    // Store original styles to restore later
    const originalContainerStyle = container.style.cssText;

    // Create the show carousel button
    const showButton = document.createElement('div');
    showButton.className = 'linkedin-buddy-show-image-btn';
    showButton.innerHTML = `
      <button type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1zM2 3h12v10H2V3z"/>
          <path d="M4 5h8v1H4V5zm0 2h6v1H4V7zm0 2h8v1H4V9z"/>
        </svg>
        Show Carousel
      </button>
    `;

    // Store original styles as data attributes for restoration
    showButton.setAttribute('data-original-container-style', originalContainerStyle);

    // Style the button to be compact
    showButton.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 4px;
      padding: 8px 12px;
      margin: 8px auto;
      width: fit-content;
      z-index: 9999;
      position: relative;
      pointer-events: all;
      border: 1px solid rgba(255, 255, 255, 0.3);
    `;

    // Add hover effect for debugging
    showButton.addEventListener('mouseenter', () => {
      showButton.style.background = 'rgba(0, 119, 181, 0.9)';
      console.log('LinkedIn Buddy: Carousel button hovered');
    });
    showButton.addEventListener('mouseleave', () => {
      showButton.style.background = 'rgba(0, 0, 0, 0.8)';
    });

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
      pointer-events: all;
      z-index: 1001;
      position: relative;
    `;

    // Add multiple click handlers to ensure the carousel shows
    const handleCarouselClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      console.log('LinkedIn Buddy: Show carousel button clicked');

      // Restore original styles
      const originalContainerStyle = showButton.getAttribute('data-original-container-style');
      console.log('LinkedIn Buddy: Original container style:', originalContainerStyle);

      // Restore the original container styles completely
      if (originalContainerStyle) {
        container.style.cssText = originalContainerStyle;
      } else {
        // Fallback if no original styles stored
        console.log('LinkedIn Buddy: No original styles found, using fallback');
        container.style.position = 'relative';
        container.style.height = '';
        container.style.paddingTop = '';
      }

      // Show the iframe
      iframe.style.display = '';
      console.log('LinkedIn Buddy: Iframe display restored, button removed');

      showButton.remove();
    };

    // Add click handlers to both the container and the button
    showButton.addEventListener('click', handleCarouselClick, true);
    showButton.addEventListener('mousedown', handleCarouselClick, true);

    const button = showButton.querySelector('button');
    button.addEventListener('click', handleCarouselClick, true);
    button.addEventListener('mousedown', handleCarouselClick, true);

    // Hide the iframe and collapse the container
    iframe.style.display = 'none';

    // Remove the padding-top that creates the aspect ratio
    container.style.paddingTop = '0';
    container.style.height = 'auto';
    container.style.position = 'relative';

    // Try inserting the button after the container instead of inside it
    if (container.parentElement) {
      container.parentElement.insertBefore(showButton, container.nextSibling);
    } else {
      container.appendChild(showButton);
    }
  }

  restoreAllImages() {
    // Remove all show image buttons and restore images/carousels
    const showButtons = document.querySelectorAll('.linkedin-buddy-show-image-btn');
    showButtons.forEach(button => {
      const container = button.parentElement;
      const images = container.querySelectorAll('.update-components-image__image');
      const iframe = container.querySelector('iframe');

      // Restore original styles
      const originalContainerStyle = button.getAttribute('data-original-container-style');
      const originalPaddingTop = button.getAttribute('data-original-padding-top');
      const originalAspectRatio = button.getAttribute('data-original-aspect-ratio');

      if (originalContainerStyle) {
        container.style.cssText = originalContainerStyle;
      }

      if (images.length > 0) {
        // Handle image containers
        const containerElement = container.querySelector('.update-components-image__container');
        if (containerElement) {
          if (originalPaddingTop) {
            containerElement.style.paddingTop = originalPaddingTop;
          }
          if (originalAspectRatio) {
            containerElement.style.aspectRatio = originalAspectRatio;
          }
        }

        // Restore aspect ratios on individual image link buttons
        const imageLinks = container.querySelectorAll('.update-components-image__image-link');
        imageLinks.forEach(link => {
          const originalAspectRatio = link.getAttribute('data-original-aspect-ratio');
          if (originalAspectRatio) {
            link.style.aspectRatio = originalAspectRatio;
            link.removeAttribute('data-original-aspect-ratio');
          }
          link.style.height = '';
        });

        // Show all images in this container
        images.forEach(img => {
          img.style.display = '';
        });
      } else if (iframe) {
        // Handle document/carousel containers
        if (originalContainerStyle) {
          container.style.cssText = originalContainerStyle;
        } else {
          // Fallback restoration
          container.style.position = '';
          container.style.height = '';
          container.style.paddingTop = '';
        }

        // Show the iframe
        iframe.style.display = '';
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

    // Refresh welcome message when chat is opened
    setTimeout(() => {
      this.extractCurrentPosts();
      this.updateWelcomeMessage();
    }, 500);
  }

  sendMessage() {
    const input = this.chatWidget.querySelector('#chatInput');
    const message = input.value.trim();

    if (!message) return;

    this.addMessageToChat(message, 'user', false);
    input.value = '';

    // Extract fresh posts before responding for better context
    this.extractCurrentPosts();

    // Handle the user message
    setTimeout(() => {
      this.handleUserMessage(message);
    }, 300);
  }

  addMessageToChat(message, sender, isHTML = false) {
    const messagesContainer = this.chatWidget.querySelector('#chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;

    // Handle different message types
    if (sender === 'assistant') {
      if (isHTML) {
        // For HTML content, use it directly (already safe HTML from our own functions)
        messageDiv.innerHTML = message;
      } else {
        // For plain text, parse markdown
        messageDiv.innerHTML = this.parseMarkdown(message);
      }
    } else {
      messageDiv.textContent = message;
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  parseMarkdown(text) {
    try {
      // Escape HTML to prevent XSS
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      // Simple markdown parser for basic formatting
      return escaped
        // Bold: **text** or __text__
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        // Italic: *text* or _text_
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        // Bullet points: * item or - item
        .replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>')
        // Wrap consecutive <li> elements in <ul>
        .replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/g, '<ul>$1</ul>')
        // Line breaks
        .replace(/\n/g, '<br>');
    } catch (error) {
      console.warn('LinkedIn Buddy: Markdown parsing error:', error);
      return text; // Fallback to plain text
    }
  }

  async handleUserMessage(message) {
    // Add typing indicator
    this.addTypingIndicator();

    try {
      // Check if the message is LinkedIn-related or if we should redirect
      const isLinkedInRelated = this.isLinkedInRelatedQuery(message);

      if (!isLinkedInRelated) {
        this.removeTypingIndicator();
        const redirectResponse = this.getRedirectResponse(message);
        this.addMessageToChat(redirectResponse, 'assistant', false);
        return;
      }

      // Use enhanced RAG search for LinkedIn-related queries
      const response = await this.searchPostsWithRAG(message);

      this.removeTypingIndicator();
      this.addMessageToChat(response, 'assistant', false);
    } catch (error) {
      console.error('LinkedIn Buddy: Error processing message:', error);
      this.removeTypingIndicator();

      // Fallback to contextual LinkedIn responses
      const response = this.getContextualLinkedInResponse(message);
      this.addMessageToChat(response, 'assistant', false);
    }
  }

  isLinkedInRelatedQuery(message) {
    const linkedinKeywords = [
      'linkedin', 'post', 'feed', 'connection', 'network', 'profile', 'share', 'comment',
      'like', 'reaction', 'hashtag', 'trend', 'job', 'career', 'professional', 'industry',
      'company', 'business', 'colleague', 'follow', 'endorsement', 'skill', 'experience',
      'article', 'content', 'engagement', 'insight', 'analytics', 'message', 'invite',
      'recommendation', 'who', 'what', 'when', 'where', 'how', 'why', 'trending', 'popular',
      'recent', 'today', 'discussion', 'topic', 'author', 'writer', 'mention', 'tag'
    ];

    const lowerMessage = message.toLowerCase();

    // Check for LinkedIn keywords
    const hasLinkedInKeywords = linkedinKeywords.some(keyword => lowerMessage.includes(keyword));

    // Check for question words (indicates user wants information about current context)
    const hasQuestionWords = /\b(what|who|when|where|how|why|which|tell|show|find|search|analyze|summarize|explain)\b/i.test(message);

    // Check for current page context references
    const hasPageContext = /\b(this page|here|current|these posts|this feed|on linkedin)\b/i.test(lowerMessage);

    return hasLinkedInKeywords || hasQuestionWords || hasPageContext;
  }

  getRedirectResponse(message) {
    const responses = [
      "I focus on LinkedIn content! Try asking about posts or trends here.",
      "Let's talk LinkedIn! Ask me about the posts on this page.",
      "I analyze LinkedIn feeds. What would you like to know about these posts?",
      "I'm your LinkedIn assistant. Ask about posts, trends, or insights!",
    ];

    return responses[Math.floor(Math.random() * responses.length)] +
      `\n\nTry: "What's trending?" • I have ${this.postDatabase.length} posts to analyze`;
  }

  getContextualLinkedInResponse(message) {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('profile') || lowerMessage.includes('url')) {
      return 'I help with profile tasks! Check the extension features for profile tools.';
    } else if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
      return `Analyzing ${this.postDatabase.length} posts for networking insights. What would you like to know?`;
    } else if (lowerMessage.includes('post') || lowerMessage.includes('content') || lowerMessage.includes('feed')) {
      return `I'm tracking ${this.postDatabase.length} posts. Ask about trends or specific topics!`;
    } else if (lowerMessage.includes('search') || lowerMessage.includes('find')) {
      return 'I can search these posts! Try "What are people discussing?" or "Find AI posts".';
    } else {
      return `LinkedIn assistant ready! I have ${this.postDatabase.length} posts to analyze. What interests you?`;
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

  // Post extraction and RAG search functionality
  startPostExtraction() {
    // Only start if chat assistant is enabled and on homepage
    if (!this.settings.chatAssistant || !this.isHomepage()) {
      return;
    }

    // Extract posts immediately
    this.extractCurrentPosts();

    // Set up observer for new posts
    this.setupPostObserver();

    // Sync posts every 30 seconds
    this.extractionInterval = setInterval(() => {
      if (this.settings.chatAssistant && this.isHomepage()) {
        this.extractCurrentPosts();
      }
    }, 30000);
  }

  stopPostExtraction() {
    if (this.extractionInterval) {
      clearInterval(this.extractionInterval);
      this.extractionInterval = null;
    }

    if (this.postObserver) {
      this.postObserver.disconnect();
      this.postObserver = null;
    }
  }

  setupPostObserver() {
    if (this.postObserver) {
      this.postObserver.disconnect();
    }

    // Reuse existing feed observation logic
    this.postObserver = new MutationObserver((mutations) => {
      // Skip if chat assistant is disabled or not on homepage
      if (!this.settings.chatAssistant || !this.isHomepage()) {
        return;
      }

      let shouldExtract = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 &&
            (node.classList?.contains('feed-shared-update-v2') ||
              node.querySelector?.('.feed-shared-update-v2'))) {
            shouldExtract = true;
          }
        });
      });

      if (shouldExtract) {
        // Debounce extraction
        clearTimeout(this.extractTimeout);
        this.extractTimeout = setTimeout(() => {
          this.extractCurrentPosts();
        }, 2000);
      }
    });

    this.postObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  extractCurrentPosts() {
    try {
      // Only extract posts if chat assistant is enabled AND on homepage/feed page
      if (!this.settings.chatAssistant || !this.isHomepage()) {
        console.log('LinkedIn Buddy: Skipping post extraction - chat disabled or not on homepage/feed');
        return;
      }

      const feedPosts = document.querySelectorAll('.feed-shared-update-v2');
      const extractedPosts = [];

      feedPosts.forEach((post, index) => {
        try {
          const postData = this.extractComprehensivePostData(post);
          if (postData && (postData.text.length > 15 || postData.comments.length > 0)) {
            extractedPosts.push(postData);
          }
        } catch (error) {
          console.warn('LinkedIn Buddy: Error extracting post:', error);
        }
      });

      if (extractedPosts.length > 0) {
        this.postDatabase = [...extractedPosts, ...this.postDatabase]
          .filter((post, index, array) =>
            index === array.findIndex(p => p.id === post.id || p.text === post.text)
          )
          .slice(0, 75); // Keep more posts for better context

        // Sync with API
        this.syncPostsWithAPI(extractedPosts);

        // Update UI counter
        this.updatePostCounter();

        // Update welcome message with new posts
        this.updateWelcomeMessage();

        console.log(`LinkedIn Buddy: Extracted ${extractedPosts.length} new posts, total: ${this.postDatabase.length}`);
      }
    } catch (error) {
      console.error('LinkedIn Buddy: Error in post extraction:', error);
    }
  }

  extractComprehensivePostData(postElement) {
    try {
      const postId = postElement.getAttribute('data-id') ||
        postElement.querySelector('[data-id]')?.getAttribute('data-id') ||
        `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Extract author information with more details
      const authorElement = postElement.querySelector('.update-components-actor__name') ||
                           postElement.querySelector('.feed-shared-actor__name') ||
                           postElement.querySelector('.actor-name') ||
                           postElement.querySelector('[data-test-id="actor-name"]') ||
                           postElement.querySelector('.feed-shared-actor .actor-name-with-distance .actor-name .visually-hidden') ||
                           postElement.querySelector('.actor-name .visually-hidden') ||
                           postElement.querySelector('a[data-test-id="actor-name"] span:not(.visually-hidden)') ||
                           postElement.querySelector('.feed-shared-actor__name .visually-hidden');
      
      let author = authorElement?.textContent?.trim() || '';
      
      // If still no author found, try alternate approaches
      if (!author || author === '') {
        const actorLink = postElement.querySelector('a[href*="/in/"]');
        if (actorLink) {
          const linkText = actorLink.textContent?.trim();
          if (linkText && linkText !== 'LinkedIn') {
            author = linkText;
          }
        }
      }
      
      // Final fallback
      if (!author || author === '') {
        author = 'Unknown Author';
      }

      const authorTitleElement = postElement.querySelector('.update-components-actor__description');
      const authorTitle = authorTitleElement?.textContent?.trim() || '';

      // Extract post text content more comprehensively
      const textElement = postElement.querySelector('.feed-shared-text__text-view') ||
        postElement.querySelector('.update-components-text') ||
        postElement.querySelector('.feed-shared-update-v2__description');

      let text = '';
      if (textElement) {
        // Get full expanded text if available
        const expandedText = textElement.querySelector('.feed-shared-text span[dir]');
        text = expandedText?.textContent?.trim() || textElement.textContent?.trim() || '';
        // Clean up UI text
        text = text.replace(/\.\.\.see more$/, '').replace(/see more$/, '').replace(/see less$/, '').trim();
      }

      // Extract article/link content if present
      let articleTitle = '';
      let articleDescription = '';
      const articleElement = postElement.querySelector('.update-components-article');
      if (articleElement) {
        const titleEl = articleElement.querySelector('.update-components-article__headline');
        const descEl = articleElement.querySelector('.update-components-article__description');
        articleTitle = titleEl?.textContent?.trim() || '';
        articleDescription = descEl?.textContent?.trim() || '';
      }

      // Extract hashtags and mentions
      const hashtagElements = postElement.querySelectorAll('a[href*="hashtag/"]');
      const hashtags = Array.from(hashtagElements).map(el => el.textContent.trim()).filter(Boolean);

      const mentionElements = postElement.querySelectorAll('a[href*="/in/"]');
      const mentions = Array.from(mentionElements).map(el => el.textContent.trim()).filter(Boolean);

      // Extract comments (first few visible ones)
      const comments = [];
      const commentElements = postElement.querySelectorAll('.comments-comment-item');
      commentElements.forEach((comment, index) => {
        if (index < 3) { // Limit to first 3 comments
          const commentAuthor = comment.querySelector('.comments-comment-item__main-content .hoverable-link-text')?.textContent?.trim();
          const commentText = comment.querySelector('.comments-comment-item-content-body')?.textContent?.trim();
          if (commentAuthor && commentText) {
            comments.push({
              author: commentAuthor,
              text: commentText.substring(0, 200), // Limit comment length
            });
          }
        }
      });

      // Extract engagement metrics with more detail
      const reactionsElement = postElement.querySelector('.social-counts-reactions');
      const commentsElement = postElement.querySelector('.social-counts-comments');
      const repostsElement = postElement.querySelector('.social-counts-reposts');

      const reactions = reactionsElement?.textContent?.trim() || '0';
      const commentCount = commentsElement?.textContent?.trim() || '0';
      const reposts = repostsElement?.textContent?.trim() || '0';

      // Extract post timing
      const timeElement = postElement.querySelector('time') || postElement.querySelector('.update-components-actor__sub-description time');
      const postTime = timeElement?.getAttribute('datetime') || timeElement?.textContent?.trim() || '';

      // Determine post type with more categories
      let category = 'text_post';
      if (postElement.querySelector('.update-components-article')) {
        category = 'article_share';
      } else if (postElement.querySelector('.update-components-image')) {
        category = 'image_post';
      } else if (postElement.querySelector('.update-components-video')) {
        category = 'video_post';
      } else if (postElement.querySelector('.update-components-document')) {
        category = 'document_post';
      } else if (postElement.querySelector('[data-urn*="reshare"]')) {
        category = 'repost';
      }

      // Check if this is a company post
      const isCompanyPost = postElement.querySelector('.update-components-actor__image img[alt*="logo"]') ||
        postElement.querySelector('.entityPhoto-circle-4') !== null;

      return {
        id: postId,
        author,
        authorTitle,
        isCompanyPost,
        text,
        articleTitle,
        articleDescription,
        hashtags,
        mentions,
        comments,
        reactions,
        commentCount,
        reposts,
        postTime,
        category,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      };
    } catch (error) {
      console.warn('LinkedIn Buddy: Error extracting comprehensive post data:', error);
      return null;
    }
  }

  async syncPostsWithAPI(posts) {
    try {
      if (posts.length === 0) return;

      console.log(`LinkedIn Buddy: Attempting to sync ${posts.length} posts to ${this.apiBaseUrl}/api/posts`);

      const response = await fetch(`${this.apiBaseUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ posts }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`LinkedIn Buddy: ✅ Successfully synced ${result.postsReceived} posts with API`);
        this.lastPostSync = Date.now();
      } else {
        console.warn(`LinkedIn Buddy: ❌ Failed to sync posts with API. Status: ${response.status}, StatusText: ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`LinkedIn Buddy: ❌ API sync failed. Error: ${error.message}`);
      console.warn('LinkedIn Buddy: Make sure the Node.js server is running on http://localhost:3000');
      console.warn('LinkedIn Buddy: Check Chrome extension permissions for localhost access');
    }
  }

  async searchPostsWithRAG(query) {
    try {
      console.log(`LinkedIn Buddy: Attempting RAG search for: "${query}"`);

      const response = await fetch(`${this.apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          maxResults: 5,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('LinkedIn Buddy: ✅ RAG search successful');
        return result.response || 'I found some information but couldn\'t generate a response.';
      } else {
        console.warn(`LinkedIn Buddy: ❌ RAG search API failed. Status: ${response.status}, StatusText: ${response.statusText}`);
        throw new Error(`API request failed: ${response.status}`);
      }
    } catch (error) {
      console.warn(`LinkedIn Buddy: ❌ RAG search failed: ${error.message}`);
      console.warn('LinkedIn Buddy: Falling back to local search...');

      // Fallback to local search if API is unavailable
      return this.localPostSearch(query);
    }
  }

  localPostSearch(query) {
    if (this.postDatabase.length === 0) {
      return 'I don\'t have any LinkedIn posts available for analysis yet. Please wait a moment for posts to be extracted from the page, then try asking again!';
    }

    const lowerQuery = query.toLowerCase();

    // Enhanced search across all post content
    const relevantPosts = this.postDatabase.filter(post => {
      const searchText = [
        post.text,
        post.author,
        post.authorTitle,
        post.articleTitle,
        post.articleDescription,
        ...(post.hashtags || []),
        ...(post.mentions || []),
        ...(post.comments || []).map(c => `${c.author}: ${c.text}`)
      ].join(' ').toLowerCase();

      return searchText.includes(lowerQuery);
    }).slice(0, 4);

    if (relevantPosts.length === 0) {
      // Provide helpful suggestions based on available content
      const availableTopics = this.extractAvailableTopics();
      return `No results for "${query}" in ${this.postDatabase.length} posts.

Try these topics: ${availableTopics.slice(0, 3).join(', ')}

Or ask: "What's trending?" • "Show me AI posts"`;
    }

    let response = `Found ${relevantPosts.length} posts about "${query}":\n\n`;

    relevantPosts.forEach((post, index) => {
      const author = post.author + (post.authorTitle ? ` (${post.authorTitle})` : '');
      const content = post.text || post.articleTitle || 'Shared content';
      const preview = content.substring(0, 100) + (content.length > 100 ? '...' : '');

      response += `• ${author}: ${preview}\n`;
    });

    return response + `\n${relevantPosts.length} of ${this.postDatabase.length} posts shown.`;
  }

  extractAvailableTopics() {
    const allHashtags = this.postDatabase
      .flatMap(post => post.hashtags || [])
      .filter(tag => tag.length > 1)
      .map(tag => tag.replace('#', '').toLowerCase())
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {});

    return Object.entries(allHashtags)
      .sort(([, a], [, b]) => b - a)
      .map(([tag]) => tag)
      .slice(0, 10);
  }

  addTypingIndicator() {
    const messagesContainer = this.chatWidget.querySelector('#chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant typing-indicator';
    typingDiv.innerHTML = `
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  removeTypingIndicator() {
    const typingIndicator = this.chatWidget.querySelector('.typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  updatePostCounter() {
    const counter = this.chatWidget?.querySelector('#postCounter .post-count');
    if (counter) {
      counter.textContent = this.postDatabase.length.toString();

      // Add a subtle animation when count updates
      counter.style.transform = 'scale(1.1)';
      setTimeout(() => {
        counter.style.transform = 'scale(1)';
      }, 200);
    }
  }

  updateWelcomeMessage() {
    if (!this.isHomepage() || !this.chatWidget || !this.settings.chatAssistant) return;

    const welcomeElement = this.chatWidget.querySelector('#welcomeMessage');
    if (!welcomeElement) return;

    try {
      // Show simple welcome message with summarize button
      const welcomeHTML = `
        👋 Hi! I'm LinkedIn Buddy.
        <br><br>
        <button class="summarize-posts-btn" style="
          background: #0077b5; 
          color: white; 
          border: none; 
          padding: 8px 16px; 
          border-radius: 16px; 
          cursor: pointer; 
          font-size: 14px;
          margin-top: 8px;
        ">📝 Summarize Recent Posts</button>
      `;

      welcomeElement.innerHTML = welcomeHTML;

      // Add click listener for the summarize button
      const summarizeBtn = welcomeElement.querySelector('.summarize-posts-btn');
      if (summarizeBtn) {
        summarizeBtn.addEventListener('click', () => {
          this.showPostSummaries();
        });
      }

    } catch (error) {
      console.warn('LinkedIn Buddy: Error updating welcome message:', error);
    }
  }

  showPostSummaries() {
    try {
      // Extract first 5 posts for summary
      const feedPosts = document.querySelectorAll('.feed-shared-update-v2');
      const firstFivePosts = Array.from(feedPosts).slice(0, 5);

      if (firstFivePosts.length === 0) {
        this.addMessageToChat("I don't see any posts on your feed right now. Try refreshing the page!", 'assistant', false);
        return;
      }

      let summaryHTML = 'Here are the latest posts:<br><br>';

      firstFivePosts.forEach((post, index) => {
        try {
          const postData = this.extractBetterPostSummary(post);
          if (postData) {
            // Ensure this post is in our database for detailed view
            const fullPostData = this.extractComprehensivePostData(post);
            if (fullPostData && !this.postDatabase.find(p => p.id === fullPostData.id)) {
              this.postDatabase.unshift(fullPostData);
            }

            const postNumber = index + 1;
            summaryHTML += `<strong>${postNumber}.</strong> <a href="#" class="post-link" data-post-id="${postData.id}" style="color: #0077b5; text-decoration: underline;">${postData.author}: ${postData.summary}</a><br><br>`;
          }
        } catch (error) {
          console.warn('LinkedIn Buddy: Error processing post for summary:', error);
        }
      });

      summaryHTML += 'Click any post title to learn more!';

      // Add the summary as a new message in the chat (with HTML flag)
      this.addMessageToChat(summaryHTML, 'assistant', true);

      // Add click handlers for post links
      setTimeout(() => {
        this.addPostLinkHandlers();
      }, 100);

    } catch (error) {
      console.warn('LinkedIn Buddy: Error showing post summaries:', error);
      this.addMessageToChat("Sorry, I couldn't load the post summaries. Please try again.", 'assistant', false);
    }
  }

  extractBetterPostSummary(postElement) {
    try {
      // Get post URL/ID
      const postLink = postElement.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
      const postId = postLink?.getAttribute('href')?.split('/').pop() || 
                    postElement.getAttribute('data-id') ||
                    `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Extract author name with comprehensive debugging and selectors
      let author = '';
      let foundBy = '';
      
      // Try multiple specific selectors for LinkedIn author names
      const authorSelectors = [
        '.update-components-actor__name',
        '.feed-shared-actor__name', 
        '.actor-name',
        '[data-test-id="actor-name"]',
        '.feed-shared-actor .actor-name-with-distance .actor-name .visually-hidden',
        '.actor-name .visually-hidden',
        'a[data-test-id="actor-name"] span:not(.visually-hidden)',
        '.feed-shared-actor__name .visually-hidden',
        '.feed-shared-actor__name span',
        '.update-components-actor__name span',
        '.feed-shared-actor .visually-hidden',
        '.update-components-actor .visually-hidden',
        '.entity-result__primary-subtitle',
        '.artdeco-entity-lockup__title',
        '.artdeco-entity-lockup__subtitle',
        'span[aria-hidden="true"]:not(.visually-hidden)',
        '.t-14.t-black.t-bold',
        '.feed-shared-actor span[aria-hidden="true"]'
      ];
      
      for (const selector of authorSelectors) {
        const element = postElement.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.length > 0 && text !== 'LinkedIn' && !text.includes('•') && !text.includes('ago')) {
            author = text;
            foundBy = selector;
            break;
          }
        }
      }
      
      // If still no author found, try finding any profile link
      if (!author || author === '') {
        const profileLinks = postElement.querySelectorAll('a[href*="/in/"]');
        for (const link of profileLinks) {
          const linkText = link.textContent?.trim();
          // Skip certain patterns that aren't names
          if (linkText && 
              linkText !== 'LinkedIn' && 
              !linkText.includes('•') && 
              !linkText.includes('ago') &&
              !linkText.includes('View') &&
              !linkText.includes('Follow') &&
              linkText.length > 2 &&
              linkText.length < 50) {
            author = linkText;
            foundBy = 'profile-link';
            break;
          }
        }
      }
      
      // Try looking for names in span elements near the top of the post
      if (!author || author === '') {
        const topSpans = postElement.querySelectorAll('.feed-shared-actor span, .update-components-actor span');
        for (const span of topSpans) {
          const text = span.textContent?.trim();
          if (text && 
              text.length > 2 && 
              text.length < 50 &&
              !text.includes('•') && 
              !text.includes('ago') &&
              !text.includes('View') &&
              !text.includes('Follow') &&
              !text.includes('LinkedIn')) {
            author = text;
            foundBy = 'span-search';
            break;
          }
        }
      }
      
      // Debug logging
      if (author && author !== 'Someone') {
        console.log(`LinkedIn Buddy: Found author "${author}" using selector: ${foundBy}`);
      } else {
        console.log('LinkedIn Buddy: Failed to find author name, post structure:', postElement.innerHTML.substring(0, 500));
      }
      
      // Final fallback
      if (!author || author === '') {
        author = 'Someone';
      }

      // Extract post content for summary with better selectors
      const textElement = postElement.querySelector('.feed-shared-text__text-view') ||
        postElement.querySelector('.update-components-text') ||
        postElement.querySelector('.feed-shared-update-v2__description') ||
        postElement.querySelector('.feed-shared-text') ||
        postElement.querySelector('[data-test-id="main-feed-activity-card"] .feed-shared-text') ||
        postElement.querySelector('.update-components-text .break-words');

      let text = '';
      if (textElement) {
        // Try multiple ways to get the text content
        const expandedText = textElement.querySelector('.feed-shared-text span[dir]') ||
                            textElement.querySelector('span[dir]') ||
                            textElement.querySelector('.break-words');
        text = expandedText?.textContent?.trim() || textElement.textContent?.trim() || '';
        
        // Clean up the text (remove excessive whitespace, etc.)
        text = text.replace(/\s+/g, ' ').trim();
      }

      // Create a 1-sentence summary
      let summary = '';
      if (text && text.length > 15) {
        // Take first sentence or first 100 characters for better context
        const sentences = text.split(/[.!?]+/);
        const firstSentence = sentences[0]?.trim();
        if (firstSentence && firstSentence.length > 10) {
          summary = firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence;
        }
      }
      
      // If no good text content, check for shared content with better selectors
      if (!summary || summary.length < 10) {
        const articleTitle = postElement.querySelector('.update-components-article__title') ||
                            postElement.querySelector('.article-title') ||
                            postElement.querySelector('[data-test-id="article-title"]');
        const videoTitle = postElement.querySelector('.update-components-video__title') ||
                          postElement.querySelector('.video-title');
        const imageDescription = postElement.querySelector('.update-components-image__description') ||
                                postElement.querySelector('.image-description');
        const pollQuestion = postElement.querySelector('.update-components-poll__question') ||
                            postElement.querySelector('.poll-question');
        const eventTitle = postElement.querySelector('.update-components-event__title') ||
                          postElement.querySelector('.event-title');
        
        // Look for shared content indicators
        const sharedContent = postElement.querySelector('.update-components-reshare') ||
                             postElement.querySelector('.feed-shared-article') ||
                             postElement.querySelector('.feed-shared-video') ||
                             postElement.querySelector('.feed-shared-external');
        
        if (articleTitle) {
          const title = articleTitle.textContent?.trim();
          summary = title ? `shared: "${title}"` : 'shared an article';
        } else if (videoTitle) {
          const title = videoTitle.textContent?.trim();
          summary = title ? `shared: "${title}"` : 'shared a video';
        } else if (imageDescription) {
          const desc = imageDescription.textContent?.trim();
          summary = desc ? `shared: "${desc}"` : 'shared an image';
        } else if (pollQuestion) {
          const question = pollQuestion.textContent?.trim();
          summary = question ? `asked: "${question}"` : 'created a poll';
        } else if (eventTitle) {
          const title = eventTitle.textContent?.trim();
          summary = title ? `shared event: "${title}"` : 'shared an event';
        } else if (sharedContent) {
          // Look for any text within shared content
          const sharedText = sharedContent.textContent?.trim().split(/\s+/).slice(0, 10).join(' ');
          summary = sharedText ? `shared: "${sharedText}..."` : 'shared content';
        } else {
          // Last resort: look for any meaningful text in the post
          const allText = postElement.textContent?.trim();
          if (allText && allText.length > 20) {
            const words = allText.split(/\s+/).slice(0, 8).join(' ');
            summary = `posted: "${words}..."`;
          } else {
            summary = 'shared a post';
          }
        }
      }

      return {
        id: postId,
        author: author,
        summary: summary
      };

    } catch (error) {
      console.warn('LinkedIn Buddy: Error extracting post summary:', error);
      return null;
    }
  }

  extractPostSummary(postElement) {
    try {
      // Get post URL/ID
      const postLink = postElement.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
      const postId = postElement.getAttribute('data-id') ||
        postElement.querySelector('[data-id]')?.getAttribute('data-id') ||
        `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Extract author with multiple fallback selectors
      const authorElement = postElement.querySelector('.update-components-actor__name') ||
                           postElement.querySelector('.feed-shared-actor__name') ||
                           postElement.querySelector('.actor-name') ||
                           postElement.querySelector('[data-test-id="actor-name"]') ||
                           postElement.querySelector('.feed-shared-actor .actor-name-with-distance .actor-name .visually-hidden') ||
                           postElement.querySelector('.actor-name .visually-hidden') ||
                           postElement.querySelector('a[data-test-id="actor-name"] span:not(.visually-hidden)') ||
                           postElement.querySelector('.feed-shared-actor__name .visually-hidden');
      
      let author = authorElement?.textContent?.trim() || '';
      
      // If still no author found, try alternate approaches
      if (!author || author === '') {
        const actorLink = postElement.querySelector('a[href*="/in/"]');
        if (actorLink) {
          const linkText = actorLink.textContent?.trim();
          if (linkText && linkText !== 'LinkedIn') {
            author = linkText;
          }
        }
      }
      
      // Final fallback
      if (!author || author === '') {
        author = 'Someone';
      }

      // Extract main content
      const textElement = postElement.querySelector('.feed-shared-text__text-view') ||
        postElement.querySelector('.update-components-text') ||
        postElement.querySelector('.feed-shared-update-v2__description');

      let text = '';
      if (textElement) {
        text = textElement.textContent?.trim() || '';
        text = text.replace(/\.\.\.see more$/, '').replace(/see more$/, '').trim();
      }

      // Extract article title if it's a shared article
      const articleElement = postElement.querySelector('.update-components-article');
      let articleTitle = '';
      if (articleElement) {
        const titleEl = articleElement.querySelector('.update-components-article__headline');
        articleTitle = titleEl?.textContent?.trim() || '';
      }

      // Generate 1-sentence summary
      let summary = '';
      if (articleTitle) {
        summary = `${author} shared: "${articleTitle}"`;
      } else if (text) {
        // Create a concise summary (first 60 characters + "...")
        const shortText = text.length > 60 ? text.substring(0, 60) + '...' : text;
        summary = `${author}: ${shortText}`;
      } else {
        summary = `${author} shared a post`;
      }

      return {
        id: postId,
        summary: summary,
        url: postLink?.href || '#',
        fullText: text,
        author: author,
        articleTitle: articleTitle
      };

    } catch (error) {
      console.warn('LinkedIn Buddy: Error extracting post summary:', error);
      return null;
    }
  }

  addPostLinkHandlers() {
    const postLinks = this.chatWidget.querySelectorAll('.post-link');
    postLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const postId = link.getAttribute('data-post-id');
        this.handlePostClick(postId, link.textContent);
      });
    });
  }

  handlePostClick(postId, summary) {
    // Add user message showing which post they clicked
    this.addMessageToChat(`Tell me more about: ${summary}`, 'user', false);

    // Add typing indicator
    this.addTypingIndicator();

    // Find the full post data
    const fullPost = this.postDatabase.find(post => post.id === postId);

    setTimeout(() => {
      this.removeTypingIndicator();

      if (fullPost) {
        let response = `**${fullPost.author}** ${fullPost.authorTitle ? `(${fullPost.authorTitle})` : ''}:\n\n`;

        if (fullPost.articleTitle) {
          response += `**Article:** ${fullPost.articleTitle}\n\n`;
        }

        if (fullPost.text) {
          const truncatedText = fullPost.text.length > 200 ?
            fullPost.text.substring(0, 200) + '...' : fullPost.text;
          response += `${truncatedText}\n\n`;
        }

        if (fullPost.hashtags && fullPost.hashtags.length > 0) {
          response += `**Tags:** ${fullPost.hashtags.slice(0, 3).join(', ')}\n\n`;
        }

        if (fullPost.reactions || fullPost.commentCount) {
          response += `**Engagement:** ${fullPost.reactions || '0'} reactions, ${fullPost.commentCount || '0'} comments`;
        }

        this.addMessageToChat(response, 'assistant', false);
      } else {
        this.addMessageToChat('I need to extract more details about this post. Try asking me a specific question about it!', 'assistant', false);
      }
    }, 800);
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
    if (enabled && this.isHomepage()) {
      this.toggleButton.style.display = 'flex';
      // Start post extraction when chat is enabled
      this.startPostExtraction();
    } else {
      this.toggleButton.style.display = 'none';
      this.chatWidget.classList.remove('visible');
      // Stop post extraction when chat is disabled
      this.stopPostExtraction();
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
