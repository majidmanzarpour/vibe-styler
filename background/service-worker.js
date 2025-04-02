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
function sendFinalStatusUpdate(success, message) {
  console.log(`Sending final status: success=${success}, message='${message}'`);
  chrome.runtime
    .sendMessage({
      type: "FINAL_STATUS",
      success: success,
      status: message,
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

                  // --- Phase 4: Send CSS to Content Script ---
                  if (generatedCss && !generatedCss.startsWith("/* Error:")) {
                    chrome.tabs.sendMessage(
                      tabId,
                      { type: "INJECT_CSS", css: generatedCss },
                      (response) => {
                        if (chrome.runtime.lastError) {
                          console.error(
                            "Error sending INJECT_CSS message:",
                            chrome.runtime.lastError.message
                          );
                          sendFinalStatusUpdate(
                            false,
                            `Error applying styles: ${chrome.runtime.lastError.message}`
                          );
                        } else {
                          console.log(
                            "Response from content script after injecting CSS:",
                            response
                          );
                          // --- Phase 5: Save Styles ---
                          if (
                            response &&
                            response.status === "CSS injected successfully."
                          ) {
                            const storageKey = "vibeStylerStyles";
                            chrome.storage.local.get([storageKey], (result) => {
                              if (chrome.runtime.lastError) {
                                console.error(
                                  "Error getting styles from storage:",
                                  chrome.runtime.lastError
                                );
                                // Don't block completion, but log error
                                sendFinalStatusUpdate(
                                  false,
                                  "Error: Failed to save styles to storage."
                                );
                              } else {
                                const allStyles = result[storageKey] || {};
                                allStyles[url] = {
                                  // url was captured during content extraction
                                  userPrompt: userPrompt,
                                  generatedCss: generatedCss,
                                };
                                chrome.storage.local.set(
                                  { [storageKey]: allStyles },
                                  () => {
                                    if (chrome.runtime.lastError) {
                                      console.error(
                                        "Error saving styles to storage:",
                                        chrome.runtime.lastError
                                      );
                                      sendFinalStatusUpdate(
                                        false,
                                        "Error: Failed to save styles to storage."
                                      );
                                    } else {
                                      console.log(
                                        `Styles saved for URL: ${url}`
                                      );
                                      sendFinalStatusUpdate(
                                        true,
                                        "Styles applied and saved successfully!"
                                      );
                                    }
                                  }
                                );
                              }
                            });
                          } else {
                            // If content script didn't confirm injection
                            sendFinalStatusUpdate(
                              false,
                              "Content script did not confirm style injection."
                            );
                          }
                          // ---------------------------
                        }
                      }
                    );
                  } else {
                    console.log(
                      "Skipping CSS injection due to empty or error response from LLM."
                    );
                    // TODO: Send failure status back to popup (explaining the error if possible)
                    sendFinalStatusUpdate(
                      false,
                      generatedCss || "No CSS generated."
                    );
                  }
                  // ------------------------------------------
                } catch (error) {
                  console.error("Error calling Gemini API:", error);
                  sendFinalStatusUpdate(
                    false,
                    `Error during API call/processing: ${error.message}`
                  );
                  // TODO: Send error details back to popup
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
  return false;
});

// Listener for initial extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log("Vibe Styler extension installed or updated.");
  // Perform any first-time setup here if needed
});

// --- Phase 5: Listener for Page Loads to Reapply Styles ---
// NEW LISTENER using webNavigation.onCompleted
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    // Check if the navigation is for the main frame (frameId === 0)
    if (details.frameId === 0) {
      const tabId = details.tabId;
      const url = details.url;
      console.log(
        `[webNavigation] Frame completed loading: ${url} (Tab ID: ${tabId})`
      );

      const storageKey = "vibeStylerStyles";

      chrome.storage.local.get([storageKey], (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[webNavigation] Error getting styles from storage:",
            chrome.runtime.lastError
          );
          return;
        }

        const allStyles = result[storageKey];
        if (allStyles && allStyles[url]) {
          const savedStyleData = allStyles[url];
          console.log(
            `[webNavigation] Found saved styles for ${url}. Injecting...`
          );
          const savedCss = savedStyleData.generatedCss;

          // Inject the content script first
          chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ["content_scripts/content.js"],
            },
            () => {
              let proceedWithMessage = true; // Assume we can proceed initially
              // This callback runs AFTER the script injection attempt
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                // Log the specific error message FIRST
                console.error(
                  `[webNavigation] executeScript failed for ${url}. Error Message: "${errorMsg}"`
                );

                // Check for specific errors we might ignore
                const knownSafeErrors = [
                  "Cannot access contents of url", // Trying to inject into chrome://, file:// etc.
                  "Frame with ID", // Often means frame was closed/navigated away quickly
                  "Cannot create item with duplicate id", // Script already injected (maybe from manifest?)
                  "Receiving end does not exist", // Maybe from a previous injection attempt?
                ];
                // Check if the error message contains any of the known safe error fragments
                if (
                  !knownSafeErrors.some((safeError) =>
                    errorMsg.includes(safeError)
                  )
                ) {
                  // If it's an unknown or potentially problematic error, DON'T proceed
                  proceedWithMessage = false;
                  console.error(
                    "[webNavigation] Halting message send due to potentially critical injection error (logged above)."
                  );
                }
              }

              if (proceedWithMessage) {
                // Introduce a small delay to allow the content script listener to set up
                setTimeout(() => {
                  console.log(
                    `[webNavigation] Attempting to send INJECT_CSS to tab ${tabId} for URL ${url}`
                  );

                  // Send the CSS to the content script
                  chrome.tabs.sendMessage(
                    tabId,
                    { type: "INJECT_CSS", css: savedCss },
                    (response) => {
                      if (chrome.runtime.lastError) {
                        console.error(
                          `[webNavigation] Error sending saved INJECT_CSS message to ${url}:`,
                          chrome.runtime.lastError.message
                        );
                      } else {
                        console.log(
                          `[webNavigation] Successfully sent saved styles to ${url}. Response:`,
                          response
                        );
                      }
                    }
                  );
                }, 100); // 100ms delay - adjust if needed
              } // else: We logged the critical error above, do nothing further
            }
          );
        } else {
          console.log(`[webNavigation] No saved styles found for ${url}.`);
        }
      });
    }
  },
  {
    // Filter to only run on http and https URLs
    url: [{ schemes: ["http", "https"] }],
  }
);
// ---------------------------------------------------------
