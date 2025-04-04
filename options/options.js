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

      const allSitesData = result[storageKey]; // Use the correct key name
      if (!allSitesData || Object.keys(allSitesData).length === 0) {
        stylesListDiv.innerHTML = "<p>No styles saved yet.</p>";
        return;
      }

      stylesListDiv.innerHTML = ""; // Clear loading message
      const siteListUl = document.createElement("ul");
      siteListUl.style.listStyle = "none";
      siteListUl.style.padding = "0";

      for (const url in allSitesData) {
        if (allSitesData.hasOwnProperty(url)) {
          const siteData = allSitesData[url]; // This now contains {styles, activeStyleId}
          const siteLi = document.createElement("li");
          siteLi.style.marginBottom = "15px"; // Increased margin for site block
          siteLi.style.padding = "10px";
          siteLi.style.border = "1px solid #ccc";
          siteLi.style.borderRadius = "4px";

          const headerDiv = document.createElement("div");
          headerDiv.style.display = "flex";
          headerDiv.style.justifyContent = "space-between";
          headerDiv.style.alignItems = "center";
          headerDiv.style.marginBottom = "8px";

          const urlSpan = document.createElement("span");
          urlSpan.textContent = url;
          urlSpan.style.fontWeight = "bold";

          const deleteAllButton = document.createElement("button");
          deleteAllButton.textContent = "Delete All for Site";
          deleteAllButton.style.marginLeft = "10px";
          deleteAllButton.style.color = "red";
          deleteAllButton.style.cursor = "pointer";
          deleteAllButton.dataset.url = url; // Store URL on button

          deleteAllButton.addEventListener("click", (event) => {
            const urlToDelete = event.target.dataset.url;
            if (
              confirm(
                `Are you sure you want to delete ALL styles for ${urlToDelete}?`
              )
            ) {
              // Send message to background instead of deleting directly
              chrome.runtime.sendMessage(
                { type: "DELETE_SITE_STYLES", url: urlToDelete, tabId: null },
                (response) => {
                  // tabId is null here as we don't have a specific tab context,
                  // background should handle gracefully or ignore the page style removal part
                  if (chrome.runtime.lastError) {
                    console.error(
                      "Error sending DELETE_SITE_STYLES from options:",
                      chrome.runtime.lastError
                    );
                    alert(
                      `Error deleting styles: ${chrome.runtime.lastError.message}`
                    );
                  } else {
                    console.log(
                      "Response from background DELETE_SITE_STYLES:",
                      response
                    );
                    alert(response?.status || "Deletion request sent.");
                    loadStoredStyles(); // Refresh list after potential deletion
                  }
                }
              );
              // deleteAllStylesForSite(urlToDelete); // Remove direct deletion
            }
          });

          headerDiv.appendChild(urlSpan);
          headerDiv.appendChild(deleteAllButton);
          siteLi.appendChild(headerDiv);

          // List individual styles for the site
          if (siteData.styles && siteData.styles.length > 0) {
            const stylesUl = document.createElement("ul");
            stylesUl.style.listStyle = "none";
            stylesUl.style.paddingLeft = "20px"; // Indent styles
            stylesUl.style.marginTop = "5px";

            siteData.styles.forEach((style) => {
              const styleLi = document.createElement("li");
              styleLi.style.padding = "5px 0";
              styleLi.style.borderTop = "1px dashed #eee"; // Separator

              const promptSpan = document.createElement("span");
              promptSpan.textContent = `Prompt: "${style.prompt}"`;
              promptSpan.style.display = "block";
              promptSpan.style.fontSize = "0.9em";
              promptSpan.style.color = "#555";

              // Display if this style is active
              if (style.id === siteData.activeStyleId) {
                const activeSpan = document.createElement("span");
                activeSpan.textContent = " (Active)";
                activeSpan.style.color = "green";
                activeSpan.style.fontWeight = "bold";
                activeSpan.style.fontSize = "0.8em";
                promptSpan.appendChild(activeSpan);
              }

              // TODO: Add button to delete individual style?
              // const deleteSingleButton = document.createElement("button");
              // deleteSingleButton.textContent = "Delete Style";
              // deleteSingleButton.dataset.url = url;
              // deleteSingleButton.dataset.styleId = style.id;
              // ... add listener ...

              styleLi.appendChild(promptSpan);
              // styleLi.appendChild(deleteSingleButton);
              stylesUl.appendChild(styleLi);
            });
            siteLi.appendChild(stylesUl);
          } else {
            const noStylesPara = document.createElement("p");
            noStylesPara.textContent =
              "No specific styles saved for this site yet.";
            noStylesPara.style.marginLeft = "20px";
            noStylesPara.style.fontSize = "0.9em";
            siteLi.appendChild(noStylesPara);
          }

          siteListUl.appendChild(siteLi);
        }
      }
      stylesListDiv.appendChild(siteListUl);
    });
  }

  // --- Function to delete all styles for a specific site ---
  function deleteAllStylesForSite(urlToDelete) {
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error getting styles before deletion:",
          chrome.runtime.lastError
        );
        alert("Error deleting site styles.");
        return;
      }
      let allSitesData = result[storageKey] || {};
      if (allSitesData[urlToDelete]) {
        delete allSitesData[urlToDelete]; // Remove the entire entry for the URL
        chrome.storage.local.set({ [storageKey]: allSitesData }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error saving styles after site deletion:",
              chrome.runtime.lastError
            );
            alert("Error deleting site styles.");
          } else {
            console.log(`Deleted all styles for ${urlToDelete}`);
            alert(`All styles for ${urlToDelete} deleted.`);
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
