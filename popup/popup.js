console.log("Popup script loaded.");

document.addEventListener("DOMContentLoaded", () => {
  const applyButton = document.getElementById("apply-button");
  const promptInput = document.getElementById("prompt-input");
  const statusMessage = document.getElementById("status-message");
  const revertButton = document.getElementById("revert-button");
  const loadingIndicator = document.getElementById("loading-indicator");
  const currentUrlDiv = document.getElementById("current-url");
  const optionsLink = document.getElementById("options-link");
  const styleSelect = document.getElementById("style-select");

  let currentTabId = null;
  let currentTabUrl = null;
  let currentSiteData = null;

  function populateStyleSelect(siteData) {
    console.log(
      "[populate] Starting. Received siteData:",
      JSON.parse(JSON.stringify(siteData || {}))
    );
    styleSelect.innerHTML = "";
    currentSiteData = siteData; // Update cache reference

    const noStyleOption = document.createElement("option");
    noStyleOption.value = "__none__";
    noStyleOption.textContent = "-- No Style --";
    styleSelect.appendChild(noStyleOption);
    console.log("[populate] Added 'No Style' option.");

    const activeStyleId = siteData?.activeStyleId;
    console.log(`[populate] Target activeStyleId: ${activeStyleId}`);
    let activeOptionFound = false;

    if (siteData?.styles && siteData.styles.length > 0) {
      console.log(
        `[populate] Found ${siteData.styles.length} styles. Iterating...`
      );
      siteData.styles.forEach((style) => {
        const option = document.createElement("option");
        const styleIdString = String(style.id);
        option.value = styleIdString;
        const promptText =
          style.prompt.length > 50
            ? style.prompt.substring(0, 47) + "..."
            : style.prompt;
        option.textContent = promptText;
        styleSelect.appendChild(option);
        console.log(
          `[populate] Added option: value='${styleIdString}', text='${promptText}'`
        );

        // Compare style.id (number) with activeStyleId (number)
        if (style.id === activeStyleId) {
          option.selected = true;
          activeOptionFound = true;
          console.log(
            `[populate] >>> Marked option ${styleIdString} as selected.`
          );
        }
      });
    } else {
      console.log("[populate] No styles found in siteData.");
    }

    if (!activeOptionFound) {
      noStyleOption.selected = true;
      console.log(
        "[populate] No active style found matching options, selecting 'No Style'."
      );
    }

    styleSelect.disabled = !(siteData?.styles?.length > 0); // Disable if no styles exist besides "No Style"
    console.log(
      `[populate] Finished. Select disabled: ${styleSelect.disabled}`
    );
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      currentTabId = tabs[0].id;
      currentTabUrl = tabs[0].url;
      currentUrlDiv.textContent = `Styling: ${currentTabUrl}`;
      applyButton.disabled = false;
      revertButton.disabled = false;
      styleSelect.disabled = true;

      const storageKey = "vibeStylerStyles";
      chrome.storage.local.get([storageKey], (result) => {
        let allSitesData = result[storageKey] || {};
        const siteData = allSitesData[currentTabUrl] || {
          styles: [],
          activeStyleId: null,
        };
        console.log("Loaded site data:", siteData);
        populateStyleSelect(siteData);
        revertButton.disabled = !(siteData?.styles?.length > 0);
      });
    } else {
      currentUrlDiv.textContent = "Cannot get active tab info.";
      applyButton.disabled = true;
      revertButton.disabled = true;
      styleSelect.disabled = true;
      styleSelect.innerHTML = '<option value="error">Error loading</option>';
    }
  });

  if (applyButton) {
    applyButton.addEventListener("click", () => {
      const prompt = promptInput.value.trim();
      console.log(`User prompt: ${prompt}`);
      if (prompt && currentTabId) {
        statusMessage.textContent = "Sending request...";
        applyButton.disabled = true;
        revertButton.disabled = true;
        styleSelect.disabled = true;
        loadingIndicator.style.display = "inline-block";

        chrome.runtime.sendMessage(
          { type: "APPLY_STYLES", prompt: prompt, tabId: currentTabId },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending message:", chrome.runtime.lastError);
              statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
              statusMessage.style.color = "var(--error-color)";
              applyButton.disabled = false;
              revertButton.disabled = !(currentSiteData?.styles?.length > 0);
              styleSelect.disabled = !(currentSiteData?.styles?.length > 0);
              loadingIndicator.style.display = "none";
              return;
            }
            console.log("Initial response:", response);
            if (response?.status) {
              statusMessage.textContent = response.status;
              statusMessage.style.color = "var(--success-color)";
            } else {
              statusMessage.textContent = "Unexpected initial response.";
              statusMessage.style.color = "var(--error-color)";
            }
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

  if (styleSelect) {
    styleSelect.addEventListener("change", (event) => {
      const selectedValue = event.target.value;
      const selectedStyleId =
        selectedValue === "__none__"
          ? null // Special value for no style
          : parseInt(selectedValue, 10); // Parse string ID back to number
      console.log(
        `Style selection changed. Value: '${selectedValue}', Parsed ID: ${selectedStyleId}`
      );

      // Check if parsing resulted in a valid number or null
      if (
        currentTabId &&
        currentTabUrl &&
        (selectedStyleId === null || !isNaN(selectedStyleId))
      ) {
        statusMessage.textContent = "Changing active style...";
        applyButton.disabled = true;
        revertButton.disabled = true;
        styleSelect.disabled = true;
        loadingIndicator.style.display = "inline-block";

        chrome.runtime.sendMessage(
          {
            type: "SET_ACTIVE_STYLE",
            url: currentTabUrl,
            tabId: currentTabId,
            styleId: selectedStyleId,
          },
          (response) => {
            loadingIndicator.style.display = "none";
            applyButton.disabled = false;
            revertButton.disabled = !(currentSiteData?.styles?.length > 0);
            styleSelect.disabled = false;

            if (chrome.runtime.lastError) {
              console.error(
                "Error setting active style:",
                chrome.runtime.lastError
              );
              statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
              statusMessage.style.color = "var(--error-color)";
            } else {
              console.log("Response from SET_ACTIVE_STYLE:", response);
              statusMessage.textContent =
                response?.status || "Active style updated.";
              statusMessage.style.color = "var(--success-color)";
              if (currentSiteData)
                currentSiteData.activeStyleId = selectedStyleId;
            }
          }
        );
      }
    });
  }

  if (revertButton) {
    revertButton.addEventListener("click", () => {
      console.log("Delete Styles button clicked (deletes all for site).");

      if (currentTabId && currentTabUrl) {
        // Add confirmation for destructive action
        if (
          !confirm(
            `Are you sure you want to delete ALL saved styles for ${currentTabUrl}? This cannot be undone.`
          )
        ) {
          console.log("Delete cancelled by user.");
          return;
        }

        statusMessage.textContent = "Deleting all styles for this site...";
        applyButton.disabled = true;
        revertButton.disabled = true;
        styleSelect.disabled = true;
        loadingIndicator.style.display = "inline-block";

        // Send message to background to delete all styles for this URL
        chrome.runtime.sendMessage(
          {
            type: "DELETE_SITE_STYLES",
            url: currentTabUrl,
            tabId: currentTabId,
          }, // Pass tabId
          (deleteResponse) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending DELETE_SITE_STYLES:",
                chrome.runtime.lastError
              );
              statusMessage.textContent = `Error deleting styles: ${chrome.runtime.lastError.message}`;
              statusMessage.style.color = "var(--error-color)";
            } else {
              console.log(
                "Response from background after deleting site styles:",
                deleteResponse
              );
              statusMessage.textContent =
                deleteResponse?.status || "Site styles deleted.";
              statusMessage.style.color = "var(--success-color)";
              // Clear and disable the style select dropdown
              populateStyleSelect(null); // Pass null to clear it
              styleSelect.disabled = true;
              // Update local cache
              currentSiteData = null;
              revertButton.disabled = true;
            }
            // Re-enable applicable controls
            loadingIndicator.style.display = "none";
            applyButton.disabled = false;
            revertButton.disabled = true;
            // Keep select disabled as there are no styles now
          }
        );
      } else {
        statusMessage.textContent = "Error: Could not get active tab info.";
      }
    });
  } else {
    console.error("Delete button (revertButton) not found!");
  }

  if (optionsLink) {
    optionsLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FINAL_STATUS") {
      console.log(
        "[FINAL_STATUS] Received:",
        JSON.parse(JSON.stringify(request))
      );
      statusMessage.textContent = request.status;
      loadingIndicator.style.display = "none";
      applyButton.disabled = false;

      if (request.success) {
        statusMessage.style.color = "var(--success-color)";
        if (request.prompt && typeof request.id === "number") {
          // New style added
          const newStyleId = request.id;
          const newPrompt = request.prompt;
          console.log(
            `[FINAL_STATUS] Success: New style added. ID: ${newStyleId}, Prompt: '${newPrompt}'`
          );

          // Update cache
          console.log(
            "[FINAL_STATUS] Updating cache before populating. Current cache:",
            JSON.parse(JSON.stringify(currentSiteData || {}))
          );
          if (!currentSiteData) {
            currentSiteData = { styles: [], activeStyleId: null };
          }
          if (!Array.isArray(currentSiteData.styles)) {
            currentSiteData.styles = [];
          }
          currentSiteData.styles.push({
            id: newStyleId,
            prompt: newPrompt,
          });
          currentSiteData.activeStyleId = newStyleId;
          console.log(
            "[FINAL_STATUS] Cache updated:",
            JSON.parse(JSON.stringify(currentSiteData))
          );

          // Repopulate dropdown
          console.log("[FINAL_STATUS] Calling populateStyleSelect...");
          populateStyleSelect(currentSiteData);
          console.log("[FINAL_STATUS] Returned from populateStyleSelect.");

          // Force selection
          const newIdString = String(newStyleId);
          console.log(
            `[FINAL_STATUS] Forcing select value to: '${newIdString}'`
          );
          styleSelect.value = newIdString;
          console.log(
            `[FINAL_STATUS] Select value is now: '${styleSelect.value}'`
          );
          // Debugging selection state
          let selectedIndex = styleSelect.selectedIndex;
          let selectedOptionValue = styleSelect.options[selectedIndex]?.value;
          console.log(
            `[FINAL_STATUS] selectedIndex: ${selectedIndex}, options[selectedIndex].value: '${selectedOptionValue}'`
          );
          if (styleSelect.value !== newIdString) {
            console.warn(
              `[FINAL_STATUS] Setting select.value to '${newIdString}' did not stick.`
            );
            // Fallback omitted for clarity now, focus on why .value isn't working
          }

          promptInput.value = "";

          // Enable controls
          revertButton.disabled = false;
          styleSelect.disabled = false;
          console.log("[FINAL_STATUS] New style added: Controls enabled.");
        } else {
          // Other success (e.g., SET_ACTIVE_STYLE)
          console.log(
            "[FINAL_STATUS] Success: Not a new style (likely SET_ACTIVE)."
          );
          // ... (existing logic for SET_ACTIVE_STYLE success) ...
          // Enable controls based on potentially updated state
          revertButton.disabled = !(currentSiteData?.styles?.length > 0);
          styleSelect.disabled = !(currentSiteData?.styles?.length > 0);
          console.log(
            `[FINAL_STATUS] Other success: Controls state updated. Delete disabled: ${revertButton.disabled}, Select disabled: ${styleSelect.disabled}`
          );
        }
      } else {
        // Error case
        console.error("[FINAL_STATUS] Received error status:", request.status);
        statusMessage.style.color = "var(--error-color)";
        // Enable controls based on state before error
        revertButton.disabled = !(currentSiteData?.styles?.length > 0);
        styleSelect.disabled = !(currentSiteData?.styles?.length > 0);
        console.error(
          `[FINAL_STATUS] Error: Controls state updated. Delete disabled: ${revertButton.disabled}, Select disabled: ${styleSelect.disabled}`
        );
      }
    }
    return false;
  });

  applyButton.disabled = true;
  revertButton.disabled = true;
  styleSelect.disabled = true;
});
