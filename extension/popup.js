document.addEventListener('DOMContentLoaded', function () {
  const autoExpandPostsToggle = document.getElementById('autoExpandPosts');
  const hideImagesToggle = document.getElementById('hideImages');

  // Load saved settings
  chrome.storage.sync.get(['autoExpandPosts', 'hideImages'], function (result) {
    autoExpandPostsToggle.checked = result.autoExpandPosts !== undefined ? result.autoExpandPosts : true;
    hideImagesToggle.checked = result.hideImages !== undefined ? result.hideImages : false;
  });

  // Save settings when toggles change
  autoExpandPostsToggle.addEventListener('change', function () {
    chrome.storage.sync.set({ autoExpandPosts: this.checked });
    sendMessageToContentScript({ action: 'toggleAutoExpandPosts', enabled: this.checked });
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
