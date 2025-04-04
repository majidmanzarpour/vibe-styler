console.log(
  "[ContentScript] Script start execution for:",
  window.location.href
);

try {
  // Listener for messages from the background script
  console.log("[ContentScript] Setting up message listener...");
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[ContentScript] Message received:", request);

    if (request.type === "INJECT_CSS") {
      console.log("Received CSS to inject:", request.css);
      const cssToInject = request.css;
      const styleId = "vibe-styler-injected-styles";

      // Find existing style tag added by this extension, or create a new one
      let styleElement = document.getElementById(styleId);
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        // Append to <head> for clarity
        (document.head || document.documentElement).appendChild(styleElement);
        console.log("Created new style tag.");
      } else {
        console.log("Found existing style tag.");
      }

      // Inject the CSS
      styleElement.textContent = cssToInject;
      console.log(`Injected ${cssToInject.length} characters of CSS.`);

      sendResponse({ status: "CSS injected successfully." });
      console.log("[ContentScript] Handled INJECT_CSS.");
    } else if (request.type === "REMOVE_STYLES") {
      console.log("Request received to remove injected styles.");
      const styleId = "vibe-styler-injected-styles";
      const styleElement = document.getElementById(styleId);
      if (styleElement) {
        styleElement.remove();
        console.log("Removed injected style tag.");
        sendResponse({ status: "Styles removed successfully." });
        console.log("[ContentScript] Handled REMOVE_STYLES.");
      } else {
        console.log("No injected style tag found to remove.");
        sendResponse({ status: "No styles to remove." });
      }
    } else if (request.type === "EXTRACT_CONTENT") {
      console.log("Request received to extract content.");
      // Phase 2 Content Extraction Logic
      const htmlContent = document.body.outerHTML;
      console.log(
        `Extracted HTML content (${(htmlContent.length / 1024).toFixed(2)} KB)`
      );

      // --- Extract CSS ---
      let extractedCss = "";
      try {
        // 1. Get all <style> tags in the document head and body
        document.querySelectorAll("style").forEach((styleTag, index) => {
          extractedCss += `/* Styles from <style> tag #${index + 1} */\n`;
          extractedCss += styleTag.textContent + "\n\n";
        });

        // 2. Get links to external stylesheets - just capture href for now
        // Fetching content is complex due to CORS and async nature
        const externalStylesheets = [];
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
          if (link.href) {
            externalStylesheets.push(link.href);
          }
        });
        if (externalStylesheets.length > 0) {
          extractedCss += `/* External Stylesheets (content not fetched):\n${externalStylesheets.join(
            "\n"
          )}\n*/\n\n`;
        }

        // Note: This doesn't capture inline styles (`style="..."` attributes)
        // or styles applied purely via JavaScript yet.
        console.log(
          `Extracted CSS content (inline/internal): (${(
            extractedCss.length / 1024
          ).toFixed(2)} KB)`
        );
      } catch (error) {
        console.error("Error extracting CSS:", error);
        extractedCss += "/* Error extracting CSS */";
      }
      // --- End Extract CSS ---

      const contentData = {
        html: htmlContent,
        css: extractedCss,
        url: window.location.href,
      };
      console.log(
        "Sending extracted HTML and CSS content back to background script."
      );
      // Respond to the background script that initially sent the EXTRACT_CONTENT message
      sendResponse({ status: "Content extracted", data: contentData });
      console.log("[ContentScript] Handled EXTRACT_CONTENT.");
      // IMPORTANT: Return true if you intend to use sendResponse asynchronously
      // For EXTRACT_CONTENT, the response IS synchronous within this handler. Return false.
      return false;
    }

    // Indicate if you will respond asynchronously for INJECT_CSS/REMOVE_STYLES
    // Since the response is sent synchronously within those handlers, return false.
    return false;
  });
  console.log("[ContentScript] Message listener successfully added.");
} catch (error) {
  console.error("[ContentScript] Error setting up message listener:", error);
}

console.log("[ContentScript] Script finished initial execution.");

// Initial check or action when script loads (optional)
// console.log("Checking for stored styles on load...");
// TODO: Implement Phase 5 logic - Request stored styles from background
