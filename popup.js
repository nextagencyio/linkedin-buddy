document.addEventListener('DOMContentLoaded', function() {
  const enhancedFeedToggle = document.getElementById('enhancedFeed');
  const quickActionsToggle = document.getElementById('quickActions');
  const autoExpandPostsToggle = document.getElementById('autoExpandPosts');
  const chatAssistantToggle = document.getElementById('chatAssistant');
  const openChatButton = document.getElementById('openChat');

  // Load saved settings
  chrome.storage.sync.get(['enhancedFeed', 'quickActions', 'autoExpandPosts', 'chatAssistant'], function(result) {
    enhancedFeedToggle.checked = result.enhancedFeed || false;
    quickActionsToggle.checked = result.quickActions || false;
    autoExpandPostsToggle.checked = result.autoExpandPosts !== undefined ? result.autoExpandPosts : true;
    chatAssistantToggle.checked = result.chatAssistant || false;
  });

  // Save settings when toggles change
  enhancedFeedToggle.addEventListener('change', function() {
    chrome.storage.sync.set({enhancedFeed: this.checked});
    sendMessageToContentScript({action: 'toggleEnhancedFeed', enabled: this.checked});
  });

  quickActionsToggle.addEventListener('change', function() {
    chrome.storage.sync.set({quickActions: this.checked});
    sendMessageToContentScript({action: 'toggleQuickActions', enabled: this.checked});
  });

  autoExpandPostsToggle.addEventListener('change', function() {
    chrome.storage.sync.set({autoExpandPosts: this.checked});
    sendMessageToContentScript({action: 'toggleAutoExpandPosts', enabled: this.checked});
  });

  chatAssistantToggle.addEventListener('change', function() {
    chrome.storage.sync.set({chatAssistant: this.checked});
    sendMessageToContentScript({action: 'toggleChatAssistant', enabled: this.checked});
  });

  openChatButton.addEventListener('click', function() {
    sendMessageToContentScript({action: 'openChat'});
    window.close();
  });

  function sendMessageToContentScript(message) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    });
  }
});