console.log("Popup script loaded.");

document.addEventListener("DOMContentLoaded", () => {
  const applyButton = document.getElementById("apply-button");
  const promptInput = document.getElementById("prompt-input");
  const statusMessage = document.getElementById("status-message");
  const revertButton = document.getElementById("revert-button");
  const loadingIndicator = document.getElementById("loading-indicator");
  const currentUrlDiv = document.getElementById("current-url");
  const optionsLink = document.getElementById("options-link");

  let currentTabId = null;
  let currentTabUrl = null;

  // --- Get Current Tab Info & Update UI ---
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      currentTabId = tabs[0].id;
      currentTabUrl = tabs[0].url;
      currentUrlDiv.textContent = `Styling: ${currentTabUrl}`;
      // Enable buttons only if we have a valid tab context
      applyButton.disabled = false;
      revertButton.disabled = false;
    } else {
      currentUrlDiv.textContent = "Cannot get active tab info.";
      applyButton.disabled = true;
      revertButton.disabled = true;
    }
  });

  // --- Apply Button Listener ---
  if (applyButton) {
    applyButton.addEventListener("click", () => {
      const prompt = promptInput.value.trim();
      console.log(`User prompt: ${prompt}`);
      if (prompt && currentTabId) {
        // Check if tabId is available
        statusMessage.textContent = "Sending request...";
        applyButton.disabled = true;
        revertButton.disabled = true; // Disable revert during apply
        loadingIndicator.style.display = "inline-block"; // Show loader

        // Send message to background script
        chrome.runtime.sendMessage(
          { type: "APPLY_STYLES", prompt: prompt, tabId: currentTabId }, // Include tabId explicitly
          (response) => {
            // This initial response comes back quickly from the background script
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending message to background:",
                chrome.runtime.lastError
              );
              statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
              applyButton.disabled = false;
              revertButton.disabled = false;
              loadingIndicator.style.display = "none"; // Hide loader on error
              return;
            }
            console.log("Initial response from background:", response);
            if (response && response.status) {
              statusMessage.textContent = response.status; // e.g., "Received prompt. Extracting page content..."
            } else {
              statusMessage.textContent = "Unexpected initial response.";
              applyButton.disabled = false;
              revertButton.disabled = false;
              loadingIndicator.style.display = "none";
            }
            // Keep buttons disabled and loader shown, waiting for final status message
          }
        );
      } else if (!prompt) {
        statusMessage.textContent = "Please enter a prompt.";
      } else {
        statusMessage.textContent = "Error: Could not get active tab ID.";
      }
    });
  } else {
    console.error("Apply button not found!");
  }

  // --- Revert Button Listener ---
  if (revertButton) {
    revertButton.addEventListener("click", () => {
      console.log("Revert button clicked.");
      if (currentTabId) {
        statusMessage.textContent = "Reverting styles...";
        applyButton.disabled = true; // Disable apply during revert
        revertButton.disabled = true;
        loadingIndicator.style.display = "inline-block";

        chrome.tabs.sendMessage(
          currentTabId,
          { type: "REMOVE_STYLES" },
          (response) => {
            loadingIndicator.style.display = "none"; // Hide loader
            applyButton.disabled = false; // Re-enable buttons
            revertButton.disabled = false;
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending REMOVE_STYLES message:",
                chrome.runtime.lastError.message
              );
              statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
            } else {
              console.log(
                "Response from content script after removing styles:",
                response
              );
              statusMessage.textContent = response.status || "Styles reverted.";
            }
          }
        );
      } else {
        statusMessage.textContent = "Error: Could not get active tab ID.";
      }
    });
  } else {
    console.error("Revert button not found!");
  }

  // --- Options Link Listener ---
  if (optionsLink) {
    optionsLink.addEventListener("click", (event) => {
      event.preventDefault(); // Prevent default link behavior
      chrome.runtime.openOptionsPage();
    });
  }

  // --- Listener for FINAL Status Updates from Background ---
  // This handles the message sent AFTER the LLM call and injection attempt
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FINAL_STATUS") {
      console.log("Received final status update:", request);
      statusMessage.textContent = request.status;
      loadingIndicator.style.display = "none"; // Hide loader
      applyButton.disabled = false; // Re-enable buttons
      revertButton.disabled = false;
      if (request.success) {
        // Maybe highlight status green?
        statusMessage.style.color = "green";
      } else {
        // Maybe highlight status red?
        statusMessage.style.color = "red";
      }
      // We don't need to sendResponse here as this is the popup receiving a message
    }
    // Indicate whether you want to send an asynchronous response
    // Return false if not sending async response from this listener
    return false;
  });

  // Initial button states (disabled until tab info is loaded)
  applyButton.disabled = true;
  revertButton.disabled = true;
});
