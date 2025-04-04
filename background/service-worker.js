console.log("Background service worker started.");

// --- Helper Function: Construct Prompt for Gemini ---
function constructGeminiPrompt(html, css, userPrompt) {
  // Revised prompt structure for Gemini 2.5 Pro
  const prompt = `
Context: You are an expert CSS generator AI. You will help a user modify the styles of a webpage based on their request.

User Request: "${userPrompt}"

Existing Page HTML (Full Body): 
\`\`\`html
${html} 
\`\`\`

Existing Page CSS (Internal styles and external links):
\`\`\`css
${css}
\`\`\`

Instructions:
1. Analyze the User Request, the full existing HTML, and existing CSS.
2. The User Request might be a specific CSS instruction (e.g., 'make background blue') OR a broad theme/aesthetic (e.g., 'dark mode', 'star wars theme', '90s retro', 'cyberpunk', 'minimalist').
3. **If the request is a broad theme:** INTERPRET the theme based on your knowledge. Generate appropriate CSS styles (colors, fonts, spacing, borders, etc.) that reflect the *vibe* or *aesthetic* of the theme, using the provided HTML/CSS for context. Do NOT ask for clarification on themes; make a creative attempt to capture the essence of the theme in CSS.
4. **If the request is a specific instruction:** Generate CSS to implement that specific change, considering the existing styles and HTML structure.
5. Generate ONLY valid CSS code. Do NOT include any explanations, apologies, markdown formatting (like \\\`\\\`\\\`css), or introductory text.
6. Use reasonably specific CSS selectors derived from the provided HTML to apply the changes effectively, trying not to drastically break the existing page layout unless requested.
7. If the request is completely impossible or nonsensical even as a theme, return only a CSS comment like /* Unable to process request */.

Generated CSS:
`;

  // Remove prompt length check for 1M token model (very unlikely to be hit)
  // const maxPromptLength = 8000;
  // if (prompt.length > maxPromptLength) { ... }

  return prompt;
}

// Helper function to send final status update back to any listening popups/options pages
function sendFinalStatusUpdate(success, message, prompt = null, id = null) {
  console.log(
    `Sending final status: success=${success}, message='${message}', prompt='${prompt}', id=${id}`
  );
  chrome.runtime
    .sendMessage({
      type: "FINAL_STATUS",
      success: success,
      status: message,
      prompt: prompt,
      id: id,
    })
    .catch((error) => {
      // Ignore errors, likely means popup/options page isn't open
      if (
        error.message.includes("Could not establish connection") ||
        error.message.includes("Receiving end does not exist")
      ) {
        // console.log("Popup/Options page likely not open to receive final status.");
      } else {
        console.warn("Error sending final status update:", error);
      }
    });
}

// Helper function to get domain from URL
function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    console.warn("Could not parse URL to get domain:", url, e);
    return null;
  }
}

// Listener for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request);

  if (request.type === "APPLY_STYLES") {
    // Prioritize tabId from request, fallback to sender (though sender should usually be the popup itself)
    const tabId = request.tabId || sender.tab?.id;
    const userPrompt = request.prompt;

    if (!tabId) {
      console.error(
        "Apply styles message received without target tab ID from request or sender."
      );
      // Send error back via helper function
      sendFinalStatusUpdate(false, "Error: Missing target Tab ID");
      // Also send immediate response back to popup if possible
      sendResponse({ status: "Error: Missing Tab ID" });
      return false; // Indicate sync response or no further async response
    }

    console.log(`Received prompt: '${userPrompt}' for tab ${tabId}`);

    // --- Phase 2 Trigger ---
    console.log(
      `Injecting content script into tab ${tabId} to extract content...`
    );
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ["content_scripts/content.js"],
      },
      (injectionResults) => {
        if (chrome.runtime.lastError) {
          console.error("Script injection failed: ", chrome.runtime.lastError);
          // TODO: Send error back to popup
          sendFinalStatusUpdate(
            false,
            `Error extracting content: ${chrome.runtime.lastError.message}`
          );
          return;
        }
        console.log(
          "Content script injected. Requesting content extraction..."
        );
        // Now that the script is injected, send a message TO it to start extraction
        chrome.tabs.sendMessage(
          tabId,
          { type: "EXTRACT_CONTENT" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending EXTRACT_CONTENT message:",
                chrome.runtime.lastError.message
              );
              // Handle error - maybe the content script listener isn't set up correctly yet?
              // TODO: Send error back to popup
              sendFinalStatusUpdate(
                false,
                `Error extracting content: ${chrome.runtime.lastError.message}`
              );
              return;
            }
            if (response && response.status === "Content extracted") {
              console.log(
                "Received content data from content script:",
                response.data
              );
              // --- Phase 3 Call ---
              const { html, css, url } = response.data;
              const fullPrompt = constructGeminiPrompt(html, css, userPrompt);
              console.log(
                "Constructed prompt for Gemini:",
                fullPrompt.substring(0, 500) + "..."
              ); // Log beginning of prompt

              // --- Retrieve API Key and Call Gemini ---
              chrome.storage.sync.get(["geminiApiKey"], async (result) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "Error retrieving API key:",
                    chrome.runtime.lastError
                  );
                  // TODO: Send error back to popup
                  // Maybe try sending a message back to the original sender (popup) - requires storing sender info
                  sendFinalStatusUpdate(
                    false,
                    `Error getting API key: ${chrome.runtime.lastError.message}`
                  );
                  return;
                }
                const apiKey = result.geminiApiKey;
                if (!apiKey) {
                  console.error("Gemini API Key not found in storage.");
                  // TODO: Send error back to popup instructing user to set the key in options
                  sendFinalStatusUpdate(
                    false,
                    "Error: Gemini API Key not set."
                  );
                  return;
                }

                // Construct the API request
                // NOTE: Using Gemini 2.5 Pro experimental endpoint. Update if needed.
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${apiKey}`;
                const requestBody = {
                  contents: [
                    {
                      parts: [
                        {
                          text: fullPrompt,
                        },
                      ],
                    },
                  ],
                  // Consider adding relevant generationConfig if needed for 2.5 Pro
                  // Consider adding safetySettings if defaults are not appropriate
                };

                console.log("Sending request to Gemini 2.5 Pro API...");
                try {
                  const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(requestBody),
                  });

                  if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(
                      `Gemini API error: ${response.status} ${response.statusText}`,
                      errorBody
                    );
                    sendFinalStatusUpdate(
                      false,
                      `Error from Gemini API: ${response.status}`
                    );
                    throw new Error(
                      `API request failed with status ${response.status}: ${errorBody}`
                    );
                  }

                  const data = await response.json();
                  console.log("Received response from Gemini API:", data);

                  // --- Parse Response ---
                  let generatedCss = "";
                  try {
                    // Adjust this path based on the actual Gemini API response structure
                    if (
                      data &&
                      data.candidates &&
                      data.candidates[0] &&
                      data.candidates[0].content &&
                      data.candidates[0].content.parts &&
                      data.candidates[0].content.parts[0]
                    ) {
                      generatedCss = data.candidates[0].content.parts[0].text;
                      // Clean up potential markdown code fences
                      generatedCss = generatedCss
                        .replace(/^\s*```(?:css)?\s*/, "")
                        .replace(/```\s*$/, "")
                        .trim();
                    } else {
                      // Handle cases where the expected structure is missing
                      // or if the API indicates blocked content, etc.
                      console.warn(
                        "Could not find generated text in the expected path in API response.",
                        data
                      );
                      if (
                        data &&
                        data.promptFeedback &&
                        data.promptFeedback.blockReason
                      ) {
                        generatedCss = `/* Gemini API Error: ${data.promptFeedback.blockReason} */`;
                        // TODO: Send specific error back to popup
                      } else {
                        generatedCss =
                          "/* Error: Could not parse Gemini response */";
                      }
                    }

                    // --- Refined Validity Check ---
                    let isValidCss = false;
                    const knownErrorPrefixes = [
                      "/* Unable to process request */",
                      "/* Gemini API Error:",
                      "/* Error: Could not parse Gemini response */",
                      "/* Error: Exception while parsing Gemini response */",
                    ];

                    if (generatedCss) {
                      isValidCss = !knownErrorPrefixes.some((prefix) =>
                        generatedCss.startsWith(prefix)
                      );
                    }
                    // --- End Refined Check ---

                    // Proceed only if CSS is considered valid
                    if (isValidCss) {
                      // --- Existing logic to save and inject ---
                      const storageKey = "vibeStylerStyles";
                      const newStyleId = Date.now();
                      const newStyle = {
                        id: newStyleId,
                        prompt: userPrompt,
                        css: generatedCss,
                      };

                      console.log(
                        `[Apply] Generated new style for URL ${url}:`,
                        newStyle
                      );

                      // Get current data for all sites
                      chrome.storage.local.get([storageKey], (result) => {
                        if (chrome.runtime.lastError) {
                          console.error(
                            "[Apply] Error getting storage before saving:",
                            chrome.runtime.lastError
                          );
                          sendFinalStatusUpdate(
                            false,
                            `Storage Error: ${chrome.runtime.lastError.message}`
                          );
                          return;
                        }

                        let allSitesData = result[storageKey] || {};
                        let siteData = allSitesData[url] || {
                          styles: [],
                          activeStyleId: null,
                        };

                        // Add new style and set as active
                        siteData.styles.push(newStyle);
                        siteData.activeStyleId = newStyleId;
                        allSitesData[url] = siteData; // Update data for this URL

                        // Save updated data back
                        chrome.storage.local.set(
                          { [storageKey]: allSitesData },
                          () => {
                            if (chrome.runtime.lastError) {
                              console.error(
                                "[Apply] Error saving new style:",
                                chrome.runtime.lastError
                              );
                              sendFinalStatusUpdate(
                                false,
                                `Storage Error: ${chrome.runtime.lastError.message}`
                              );
                            } else {
                              console.log(
                                `[Apply] Successfully saved new style ${newStyleId} for ${url}`
                              );

                              // Ensure content script is running and send INJECT_CSS
                              console.log(
                                `[Apply] Ensuring content script and sending INJECT_CSS for tab ${tabId}`
                              );
                              chrome.scripting.executeScript(
                                {
                                  target: { tabId: tabId },
                                  files: ["content_scripts/content.js"],
                                },
                                () => {
                                  if (chrome.runtime.lastError) {
                                    console.warn(
                                      `[Apply] executeScript warning (non-fatal): ${chrome.runtime.lastError.message}`
                                    );
                                  }
                                  // Now send the INJECT_CSS message
                                  chrome.tabs.sendMessage(
                                    tabId,
                                    { type: "INJECT_CSS", css: generatedCss },
                                    (response) => {
                                      if (chrome.runtime.lastError) {
                                        console.warn(
                                          `[Apply] INJECT_CSS message failed: ${chrome.runtime.lastError.message}`
                                        );
                                        sendFinalStatusUpdate(
                                          false,
                                          `Storage OK, but CSS injection failed: ${chrome.runtime.lastError.message}`
                                        );
                                      } else {
                                        console.log(
                                          `[Apply] Content script acknowledged INJECT_CSS. Response:`,
                                          response
                                        );
                                        // Send success status including the new prompt and ID
                                        sendFinalStatusUpdate(
                                          true,
                                          "New style applied and saved!",
                                          userPrompt,
                                          newStyleId
                                        );
                                      }
                                    }
                                  );
                                }
                              );
                            }
                          }
                        ); // End storage.local.set
                      }); // End storage.local.get
                    } else {
                      // Handle known errors or empty CSS
                      console.log(
                        "[Apply] Gemini returned an error comment or empty CSS, not applying. CSS:",
                        generatedCss
                      );
                      sendFinalStatusUpdate(
                        false,
                        generatedCss || "Error: Empty CSS generated."
                      );
                    }
                  } catch (parseError) {
                    console.error("Error parsing Gemini response:", parseError);
                    generatedCss =
                      "/* Error: Exception while parsing Gemini response */";
                    // TODO: Send parse error back to popup
                  }

                  console.log("Extracted CSS:", generatedCss);

                  if (generatedCss.startsWith("/* Error:")) {
                    sendFinalStatusUpdate(false, generatedCss);
                    // Potentially return here if we don't want to try injecting errors?
                  }

                  if (generatedCss && !generatedCss.startsWith("/*")) {
                    // --- Proceed only if CSS is valid ---
                    const storageKey = "vibeStylerStyles";
                    const newStyleId = Date.now();
                    const newStyle = {
                      id: newStyleId,
                      prompt: userPrompt,
                      css: generatedCss,
                    };

                    console.log(
                      `[Apply] Generated new style for URL ${url}:`,
                      newStyle
                    );

                    // Get current data for all sites
                    chrome.storage.local.get([storageKey], (result) => {
                      if (chrome.runtime.lastError) {
                        console.error(
                          "[Apply] Error getting storage before saving:",
                          chrome.runtime.lastError
                        );
                        sendFinalStatusUpdate(
                          false,
                          `Storage Error: ${chrome.runtime.lastError.message}`
                        );
                        return;
                      }

                      let allSitesData = result[storageKey] || {};
                      let siteData = allSitesData[url] || {
                        styles: [],
                        activeStyleId: null,
                      };

                      // Add new style and set as active
                      siteData.styles.push(newStyle);
                      siteData.activeStyleId = newStyleId;
                      allSitesData[url] = siteData; // Update data for this URL

                      // Save updated data back
                      chrome.storage.local.set(
                        { [storageKey]: allSitesData },
                        () => {
                          if (chrome.runtime.lastError) {
                            console.error(
                              "[Apply] Error saving new style:",
                              chrome.runtime.lastError
                            );
                            sendFinalStatusUpdate(
                              false,
                              `Storage Error: ${chrome.runtime.lastError.message}`
                            );
                          } else {
                            console.log(
                              `[Apply] Successfully saved new style ${newStyleId} for ${url}`
                            );

                            // Ensure content script is running and send INJECT_CSS
                            console.log(
                              `[Apply] Ensuring content script and sending INJECT_CSS for tab ${tabId}`
                            );
                            chrome.scripting.executeScript(
                              {
                                target: { tabId: tabId },
                                files: ["content_scripts/content.js"],
                              },
                              () => {
                                if (chrome.runtime.lastError) {
                                  console.warn(
                                    `[Apply] executeScript warning (non-fatal): ${chrome.runtime.lastError.message}`
                                  );
                                }
                                // Now send the INJECT_CSS message
                                chrome.tabs.sendMessage(
                                  tabId,
                                  { type: "INJECT_CSS", css: generatedCss },
                                  (response) => {
                                    if (chrome.runtime.lastError) {
                                      console.warn(
                                        `[Apply] INJECT_CSS message failed: ${chrome.runtime.lastError.message}`
                                      );
                                      sendFinalStatusUpdate(
                                        false,
                                        `Storage OK, but CSS injection failed: ${chrome.runtime.lastError.message}`
                                      );
                                    } else {
                                      console.log(
                                        `[Apply] Content script acknowledged INJECT_CSS. Response:`,
                                        response
                                      );
                                      // Send success status including the new prompt and ID
                                      sendFinalStatusUpdate(
                                        true,
                                        "New style applied and saved!",
                                        userPrompt,
                                        newStyleId
                                      );
                                    }
                                  }
                                );
                              }
                            );
                          }
                        }
                      ); // End storage.local.set
                    }); // End storage.local.get
                  } else {
                    console.log(
                      "Gemini returned an error comment or empty CSS, not applying."
                    );
                    sendFinalStatusUpdate(
                      false,
                      generatedCss || "Error: Empty CSS generated."
                    );
                  }
                } catch (fetchError) {
                  console.error("Error fetching from Gemini API:", fetchError);
                  sendFinalStatusUpdate(
                    false,
                    `API Fetch Error: ${fetchError.message}`
                  );
                }
              });
              // -------------------------------------
            } else {
              console.error(
                "Unexpected response from content script:",
                response
              );
              // TODO: Send error back to popup
              sendFinalStatusUpdate(
                false,
                "Error: Unexpected response from content script during extraction."
              );
            }
          }
        );
      }
    );

    // Send an initial response back to popup to acknowledge receipt
    // We will handle the actual result asynchronously after extraction and LLM call
    sendResponse({ status: "Received prompt. Processing..." });
    return true; // Indicate that we will send a response asynchronously later
  } else if (request.type === "CLEAR_ACTIVE_STYLE") {
    const url = request.url;
    const tabId = request.tabId;
    console.log(`[Background] Received CLEAR_ACTIVE_STYLE for URL: ${url}`);

    if (!url || !tabId) {
      console.error(
        `[Background] Invalid arguments for CLEAR_ACTIVE_STYLE`,
        request
      );
      sendResponse({ status: "Error: Missing URL or TabID." });
      return false;
    }

    const storageKey = "vibeStylerStyles";
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[ClearActive] Error getting storage:",
          chrome.runtime.lastError
        );
        sendResponse({
          status: `Storage Get Error: ${chrome.runtime.lastError.message}`,
        });
        return;
      }

      let allSitesData = result[storageKey] || {};
      let siteData = allSitesData[url];

      if (siteData && siteData.activeStyleId !== null) {
        console.log(`[ClearActive] Clearing active style ID for ${url}`);
        siteData.activeStyleId = null; // Set active style to null
        allSitesData[url] = siteData; // Update site data

        chrome.storage.local.set({ [storageKey]: allSitesData }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[ClearActive] Error setting storage:",
              chrome.runtime.lastError
            );
            sendResponse({
              status: `Storage Set Error: ${chrome.runtime.lastError.message}`,
            });
          } else {
            console.log(
              `[ClearActive] Successfully cleared active style for ${url}`
            );
            sendResponse({ status: "Active style cleared." });

            // Ensure content script is running and trigger REMOVE_STYLES
            console.log(
              `[ClearActive] Ensuring content script and triggering REMOVE_STYLES in tab ${tabId}`
            );
            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                files: ["content_scripts/content.js"],
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn(
                    `[ClearActive] executeScript warning (non-fatal): ${chrome.runtime.lastError.message}`
                  );
                }
                // Now send the message
                chrome.tabs.sendMessage(
                  tabId,
                  { type: "REMOVE_STYLES" },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      console.warn(
                        `[ClearActive] REMOVE_STYLES message failed: ${chrome.runtime.lastError.message}`
                      );
                    } else {
                      console.log(
                        "[ClearActive] Content script acknowledged REMOVE_STYLES."
                      );
                    }
                  }
                );
              }
            );
          }
        });
      } else {
        console.log(`[ClearActive] No active style was set for ${url}`);
        sendResponse({ status: "No active style to clear." });
      }
    });

    return true; // Async response
  } else if (request.type === "SET_ACTIVE_STYLE") {
    const { url, tabId, styleId } = request;
    console.log(
      `[SetActive] Request received for URL: ${url}, Style ID: ${styleId}`
    );

    if (!url || !tabId || styleId === undefined) {
      // styleId could be null
      console.error("[SetActive] Invalid arguments:", request);
      sendResponse({ status: "Error: Missing URL, TabID, or StyleID." });
      return false;
    }

    const storageKey = "vibeStylerStyles";
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[SetActive] Error getting storage:",
          chrome.runtime.lastError
        );
        sendResponse({
          status: `Storage Get Error: ${chrome.runtime.lastError.message}`,
        });
        return;
      }

      let allSitesData = result[storageKey] || {};
      let siteData = allSitesData[url];

      if (!siteData || !siteData.styles || siteData.styles.length === 0) {
        console.warn(`[SetActive] No site data or styles found for ${url}`);
        sendResponse({ status: "Error: No styles saved for this URL." });
        return;
      }

      let styleToApply = null;
      let promptToDisplay = null;
      if (styleId === null) {
        // User selected "No Style"
        console.log(`[SetActive] Setting active style to null for ${url}`);
        siteData.activeStyleId = null;
        promptToDisplay = null; // No prompt for "No Style"
      } else {
        // Find the style object matching the requested ID
        styleToApply = siteData.styles.find((s) => s.id === styleId);
        if (!styleToApply) {
          console.error(
            `[SetActive] Style ID ${styleId} not found for URL ${url}`
          );
          sendResponse({ status: `Error: Style ID ${styleId} not found.` });
          return;
        }
        console.log(
          `[SetActive] Setting active style to ${styleId} for ${url}`
        );
        siteData.activeStyleId = styleId;
        promptToDisplay = styleToApply.prompt; // Get prompt for display
      }

      // Update the site data
      allSitesData[url] = siteData;

      // Save the updated activeStyleId
      chrome.storage.local.set({ [storageKey]: allSitesData }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[SetActive] Error setting storage:",
            chrome.runtime.lastError
          );
          sendResponse({
            status: `Storage Set Error: ${chrome.runtime.lastError.message}`,
          });
          return;
        }

        console.log(
          `[SetActive] Successfully updated active style ID for ${url}`
        );

        // Inject the new CSS or remove existing styles
        if (styleToApply) {
          console.log(
            `[SetActive] Ensuring content script and injecting CSS for style ${styleId}`
          );
          // Ensure content script is present first
          chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ["content_scripts/content.js"],
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn(
                  `[SetActive] executeScript warning (non-fatal): ${chrome.runtime.lastError.message}`
                );
              }
              // Now send INJECT_CSS message to content script
              console.log(
                `[SetActive] Sending INJECT_CSS to content script for style ${styleId}`
              );
              chrome.tabs.sendMessage(
                tabId,
                { type: "INJECT_CSS", css: styleToApply.css },
                (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn(
                      `[SetActive] INJECT_CSS message failed: ${chrome.runtime.lastError.message}`
                    );
                    sendResponse({
                      status: "Active style set, but injection failed.",
                    });
                  } else {
                    console.log(
                      `[SetActive] Content script acknowledged INJECT_CSS. Response:`,
                      response
                    );
                    sendResponse({
                      status: "Active style changed successfully.",
                      newPrompt: promptToDisplay,
                    });
                  }
                }
              );
            }
          );
        } else {
          // "No Style" selected - Ensure content script and send REMOVE_STYLES
          console.log(
            `[SetActive] Ensuring content script and sending REMOVE_STYLES for tab ${tabId}`
          );
          chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ["content_scripts/content.js"],
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn(
                  `[SetActive] executeScript warning (non-fatal): ${chrome.runtime.lastError.message}`
                );
              }
              // Now send the message
              chrome.tabs.sendMessage(
                tabId,
                { type: "REMOVE_STYLES" },
                (removeResponse) => {
                  // Check lastError FIRST
                  if (chrome.runtime.lastError) {
                    console.warn(
                      `[SetActive] REMOVE_STYLES message failed (non-fatal for storage update): ${chrome.runtime.lastError.message}`
                    );
                    // Still send success as storage update succeeded
                    sendResponse({
                      status:
                        "Active style cleared. (CSS removal status uncertain)",
                      newPrompt: null,
                    });
                  } else {
                    console.log(
                      `[SetActive] REMOVE_STYLES successful. Response:`,
                      removeResponse
                    );
                    sendResponse({
                      status: "Active style cleared.",
                      newPrompt: null,
                    });
                  }
                }
              );
            }
          );
        }
      }); // End storage set
    }); // End storage get

    return true; // Async response
  } else if (request.type === "DELETE_SITE_STYLES") {
    const { url, tabId } = request; // Get URL and TabID
    console.log(`[Background] Received DELETE_SITE_STYLES for URL: ${url}`);

    if (!url || !tabId) {
      console.error("[DeleteSite] Invalid arguments:", request);
      sendResponse({ status: "Error: Missing URL or TabID." });
      return false;
    }

    const storageKey = "vibeStylerStyles";
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[DeleteSite] Error getting storage:",
          chrome.runtime.lastError
        );
        sendResponse({
          status: `Storage Get Error: ${chrome.runtime.lastError.message}`,
        });
        return;
      }

      let allSitesData = result[storageKey] || {};

      if (allSitesData[url]) {
        console.log(`[DeleteSite] Deleting all data for URL: ${url}`);
        delete allSitesData[url]; // Delete the entire entry for the site

        chrome.storage.local.set({ [storageKey]: allSitesData }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[DeleteSite] Error setting storage after deletion:",
              chrome.runtime.lastError
            );
            sendResponse({
              status: `Storage Set Error: ${chrome.runtime.lastError.message}`,
            });
          } else {
            console.log(`[DeleteSite] Successfully deleted data for ${url}`);
            sendResponse({ status: "All styles for this site deleted." });
            // Ensure styles are removed from the page IF a valid tabId was provided
            if (tabId) {
              console.log(
                `[DeleteSite] Ensuring content script and sending REMOVE_STYLES to tab ${tabId}`
              );
              chrome.scripting.executeScript(
                {
                  target: { tabId: tabId },
                  files: ["content_scripts/content.js"],
                },
                () => {
                  if (chrome.runtime.lastError)
                    console.warn(
                      `[DeleteSite] executeScript warning: ${chrome.runtime.lastError.message}`
                    );
                  chrome.tabs.sendMessage(
                    tabId,
                    { type: "REMOVE_STYLES" },
                    (response) => {
                      if (chrome.runtime.lastError)
                        console.warn(
                          `[DeleteSite] REMOVE_STYLES failed: ${chrome.runtime.lastError.message}`
                        );
                      else
                        console.log("[DeleteSite] REMOVE_STYLES acknowledged.");
                    }
                  );
                }
              );
            } else {
              console.log(
                "[DeleteSite] No valid tabId provided, skipping page style removal."
              );
            }
          }
        });
      } else {
        console.log(`[DeleteSite] No data found for URL: ${url}`);
        sendResponse({ status: "No styles found to delete for this site." });
      }
    });

    return true; // Async response
  } else if (request.type === "CONTENT_EXTRACTED") {
    // This message type might be sent *from* the content script if we change the flow
    console.log(
      "Received extracted content directly from content script (alternative flow):",
      request.data
    );
    // TODO: Process request.data and user prompt (need to associate it)
  }

  // Default case if message type isn't handled above
  // Return false if no async response is planned for this message type
  if (
    request.type !== "APPLY_STYLES" &&
    request.type !== "CLEAR_ACTIVE_STYLE" &&
    request.type !== "SET_ACTIVE_STYLE" &&
    request.type !== "DELETE_SITE_STYLES"
  ) {
    console.log(`Unhandled message type or sync response: ${request.type}`);
    return false;
  }
  // If we reached here, it means APPLY_STYLES or CLEAR_ACTIVE_STYLE was handled and returned true
});

// Listener for initial extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log("Vibe Styler extension installed or updated.");
  // Perform any first-time setup here if needed
});

// --- Auto-Apply Styles on Navigation ---
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    // Ignore iframes or non-http(s) pages
    if (details.frameId !== 0 || !details.url.startsWith("http")) {
      return;
    }

    const url = details.url;
    const tabId = details.tabId;
    const storageKey = "vibeStylerStyles";

    console.log(`[webNavigation] Page completed: ${url}`);

    // Get all stored styles
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.warn(
          `[webNavigation] Error getting storage for ${url}: ${chrome.runtime.lastError.message}`
        );
        return;
      }

      const allSitesData = result[storageKey] || {};
      const siteData = allSitesData[url];

      // Check if there's data and an active style for this URL
      if (siteData && siteData.activeStyleId) {
        const activeStyleId = siteData.activeStyleId;
        // Find the active style object in the array
        const activeStyle = siteData.styles.find((s) => s.id === activeStyleId);

        if (activeStyle) {
          console.log(
            `[webNavigation] Found active style (${activeStyleId}: '${activeStyle.prompt}') for ${url}. Ensuring content script and injecting...`
          );
          // Ensure content script is injected first
          chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ["content_scripts/content.js"],
            },
            () => {
              if (chrome.runtime.lastError) {
                // Non-fatal error (might already be injected)
                console.warn(
                  `[webNavigation] executeScript warning (non-fatal): ${chrome.runtime.lastError.message}`
                );
              }
              // Now send INJECT_CSS message to content script
              console.log(
                `[webNavigation] Sending INJECT_CSS to content script for ${url}`
              );
              chrome.tabs.sendMessage(
                tabId,
                { type: "INJECT_CSS", css: activeStyle.css },
                (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn(
                      `[webNavigation] INJECT_CSS message failed: ${chrome.runtime.lastError.message}`
                    );
                  } else {
                    console.log(
                      `[webNavigation] Content script acknowledged INJECT_CSS for ${url}. Response:`,
                      response
                    );
                  }
                }
              );
            }
          );
        } else {
          console.warn(
            `[webNavigation] Active style ID ${activeStyleId} found for ${url}, but style data missing.`
          );
          // TODO: Maybe clear the activeStyleId here?
        }
      } else {
        console.log(`[webNavigation] No active style found for ${url}`);
        // REMOVE session flag logic for clearing
        // const flagKey = `autoAppliedStylesTab${tabId}`;
        // chrome.storage.session.remove(flagKey, () => {
        //    // ...
        // });
      }
    });
  },
  {
    // Filter for main frame navigation completion on http/https pages
    url: [{ schemes: ["http", "https"] }],
  }
);
// ---------------------------------------------------------
