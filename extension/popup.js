document.addEventListener('DOMContentLoaded', function () {
  const autoExpandPostsToggle = document.getElementById('autoExpandPosts');
  const hideSponsoredToggle = document.getElementById('hideSponsored');
  const hideRecommendedToggle = document.getElementById('hideRecommended');
  const hideImagesToggle = document.getElementById('hideImages');

  // Load saved settings
  chrome.storage.sync.get(['autoExpandPosts', 'autoHideSponsored', 'autoHideRecommended', 'hideImages'], function (result) {
    autoExpandPostsToggle.checked = result.autoExpandPosts !== undefined ? result.autoExpandPosts : true;
    hideSponsoredToggle.checked = result.autoHideSponsored !== undefined ? result.autoHideSponsored : false;
    hideRecommendedToggle.checked = result.autoHideRecommended !== undefined ? result.autoHideRecommended : false;
    hideImagesToggle.checked = result.hideImages !== undefined ? result.hideImages : false;
  });

  // Save settings when toggles change
  autoExpandPostsToggle.addEventListener('change', function () {
    chrome.storage.sync.set({ autoExpandPosts: this.checked });
    sendMessageToContentScript({ action: 'toggleAutoExpandPosts', enabled: this.checked });
  });

  hideSponsoredToggle.addEventListener('change', function () {
    chrome.storage.sync.set({ autoHideSponsored: this.checked });
    sendMessageToContentScript({ action: 'toggleAutoHideSponsored', enabled: this.checked });
  });

  hideRecommendedToggle.addEventListener('change', function () {
    chrome.storage.sync.set({ autoHideRecommended: this.checked });
    sendMessageToContentScript({ action: 'toggleAutoHideRecommended', enabled: this.checked });
  });

  hideImagesToggle.addEventListener('change', function () {
    chrome.storage.sync.set({ hideImages: this.checked });
    sendMessageToContentScript({ action: 'toggleHideImages', enabled: this.checked });
  });

  function sendMessageToContentScript(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    });
  }
});
