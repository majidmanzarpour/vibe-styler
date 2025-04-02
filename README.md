# Vibe Styler Chrome Extension

Change the style of any webpage using AI prompts with the power of Gemini 2.5 Pro!

Demo: https://x.com/majidmanzarpour/status/1907275311798206561

This Chrome extension allows you to:
*   Enter a text prompt describing the style changes you want (e.g., "make the background dark blue and text light gray", "apply a cyberpunk theme", "use Star Wars inspired colors and fonts").
*   Utilize the **Google Gemini 2.5 Pro model** with its large context window to analyze the entire page structure and existing styles for more accurate and context-aware results.
*   Get creative CSS generated for specific requests or broad themes.
*   Apply the generated styles to the current page.
*   Automatically re-apply your saved styles when you revisit a page.
*   Manage saved styles through the extension's options page.

## Development Setup

1.  Clone this repository.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode" (usually a toggle in the top right).
4.  Click "Load unpacked".
5.  Select the directory where you cloned the repository.
6.  The Vibe Styler extension icon should appear in your toolbar.

## Usage

1.  **Set API Key:**
    *   Right-click the Vibe Styler icon in your toolbar and choose "Options" (or find the extension on the `chrome://extensions` page and click "Details" -> "Extension options").
    *   Obtain an API key for Gemini from Google AI Studio ([https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)). Ensure the key is enabled for the Gemini API (specifically the model used, currently an experimental Gemini 2.5 Pro).
    *   Paste the API key into the input field on the Options page and click "Save Key".
2.  **Apply Styles:**
    *   Navigate to the webpage you want to modify.
    *   Click the Vibe Styler icon in your toolbar to open the popup.
    *   Enter your desired style changes in the text area. Be specific or try a theme!
    *   Click "Apply Styles".
    *   Wait for the AI (Gemini 2.5 Pro) to process and inject the styles. The status message will update.
3.  **Revert Styles:**
    *   Click "Revert Styles" in the popup to temporarily remove styles applied during the current session on that page.
4.  **Persistence:**
    *   Styles are automatically saved when successfully applied.
    *   When you reload or revisit a page, any saved styles for that specific URL will be automatically reapplied.
5.  **Manage Styles:**
    *   Go to the Options page to view all saved styles.
    *   You can delete styles for individual pages or clear all saved styles.

## Important Notes

*   **Permissions:** This extension requires permission to "Read and change all your data on all websites" (`host_permissions`) to automatically apply saved styles on page load. It also uses the `webNavigation` permission to detect when pages finish loading.
*   **Privacy:** This extension sends the full HTML structure (body) and CSS (internal styles and links) of the current page to the Google Gemini API, along with your prompt and API key, to generate new styles. Consider the privacy implications for sensitive pages.
*   **AI Model:** Uses Gemini 2.5 Pro (experimental model `gemini-2.5-pro-exp-03-25`). Results depend on the AI's capabilities and the clarity/interpretability of your prompt.
*   **Limitations:** Complex websites or those with strict Content Security Policies (CSPs) might interfere with style injection. Very large pages might still approach API context limits, though this is less likely with 1M tokens.
*   **API Key:** Requires a valid Google Gemini API key with the appropriate API enabled. 
