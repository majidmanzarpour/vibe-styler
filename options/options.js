document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("api-key");
  const saveButton = document.getElementById("save-key");
  const statusDiv = document.getElementById("status");
  const refreshButton = document.getElementById("refresh-styles");
  const clearAllButton = document.getElementById("clear-all-styles");
  const stylesListDiv = document.getElementById("stored-styles-list");
  const storageKey = "vibeStylerStyles"; // Updated storage key

  // Load the saved API key when the options page loads
  chrome.storage.sync.get(["geminiApiKey"], (result) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading API key:", chrome.runtime.lastError);
      statusDiv.textContent = "Error loading API key.";
      statusDiv.style.color = "red";
    } else if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      statusDiv.textContent = "API Key loaded.";
      statusDiv.style.color = "green";
    } else {
      statusDiv.textContent = "API Key not set.";
      statusDiv.style.color = "orange";
    }
  });

  // Save the API key when the save button is clicked
  saveButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving API key:", chrome.runtime.lastError);
          statusDiv.textContent = "Error saving API key.";
          statusDiv.style.color = "red";
        } else {
          console.log("API Key saved successfully.");
          statusDiv.textContent = "API Key saved successfully!";
          statusDiv.style.color = "green";
          // Optionally clear the input after saving, or leave it
          // apiKeyInput.value = '';
        }
      });
    } else {
      statusDiv.textContent = "Please enter an API Key.";
      statusDiv.style.color = "red";
    }
  });

  // --- Function to load and display stored styles ---
  function loadStoredStyles() {
    stylesListDiv.innerHTML = "<p>Loading styles...</p>"; // Clear previous list
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading stored styles:", chrome.runtime.lastError);
        stylesListDiv.innerHTML =
          '<p style="color: red;">Error loading styles.</p>';
        return;
      }

      const allStyles = result[storageKey];
      if (!allStyles || Object.keys(allStyles).length === 0) {
        stylesListDiv.innerHTML = "<p>No styles saved yet.</p>";
        return;
      }

      stylesListDiv.innerHTML = ""; // Clear loading message
      const ul = document.createElement("ul");
      ul.style.listStyle = "none";
      ul.style.padding = "0";

      for (const url in allStyles) {
        if (allStyles.hasOwnProperty(url)) {
          const styleData = allStyles[url];
          const li = document.createElement("li");
          li.style.marginBottom = "10px";
          li.style.padding = "10px";
          li.style.border = "1px solid #ccc";
          li.style.borderRadius = "4px";

          const urlSpan = document.createElement("span");
          urlSpan.textContent = url;
          urlSpan.style.fontWeight = "bold";
          urlSpan.style.display = "block";
          urlSpan.style.marginBottom = "5px";

          const promptSpan = document.createElement("span");
          promptSpan.textContent = `Prompt: "${styleData.userPrompt}"`;
          promptSpan.style.display = "block";
          promptSpan.style.fontSize = "0.9em";
          promptSpan.style.color = "#555";

          const deleteButton = document.createElement("button");
          deleteButton.textContent = "Delete";
          deleteButton.style.marginLeft = "10px";
          deleteButton.style.color = "red";
          deleteButton.style.cursor = "pointer";
          deleteButton.dataset.url = url; // Store URL on button for easy access

          deleteButton.addEventListener("click", (event) => {
            const urlToDelete = event.target.dataset.url;
            if (
              confirm(
                `Are you sure you want to delete styles for ${urlToDelete}?`
              )
            ) {
              deleteSingleStyle(urlToDelete);
            }
          });
          li.appendChild(urlSpan);
          li.appendChild(promptSpan);
          li.appendChild(deleteButton);
          ul.appendChild(li);
        }
      }
      stylesListDiv.appendChild(ul);
    });
  }

  // --- Function to delete a single style entry ---
  function deleteSingleStyle(urlToDelete) {
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error getting styles before deletion:",
          chrome.runtime.lastError
        );
        alert("Error deleting style.");
        return;
      }
      const allStyles = result[storageKey] || {};
      if (allStyles[urlToDelete]) {
        delete allStyles[urlToDelete];
        chrome.storage.local.set({ [storageKey]: allStyles }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error saving styles after deletion:",
              chrome.runtime.lastError
            );
            alert("Error deleting style.");
          } else {
            console.log(`Deleted styles for ${urlToDelete}`);
            alert(`Styles for ${urlToDelete} deleted.`);
            loadStoredStyles(); // Refresh the list
          }
        });
      }
    });
  }

  // --- Event Listeners for Style Management ---
  if (refreshButton) {
    refreshButton.addEventListener("click", loadStoredStyles);
  }
  if (clearAllButton) {
    clearAllButton.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete ALL saved styles?")) {
        chrome.storage.local.remove(storageKey, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error clearing all styles:",
              chrome.runtime.lastError
            );
            alert("Error clearing all styles.");
          } else {
            console.log("Cleared all saved styles.");
            alert("All saved styles cleared.");
            loadStoredStyles(); // Refresh the list
          }
        });
      }
    });
  }

  // --- Initial Load ---
  loadStoredStyles(); // Load styles when the options page opens
});
