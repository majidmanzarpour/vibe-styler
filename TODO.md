# TODO - Style Maverick Chrome Extension

A chrome extension that lets you change the style of any page with a prompt using Google Gemini 2.5. Keeps track of changes so when you go back to the page your changes are applied.

## Phase 1: Project Foundation & Setup (Milestone: Basic Loadable Extension)

-   [x] Define project directory structure (`/popup`, `/content_scripts`, `/background`, `/assets`, `/options`?)
-   [ ] Initialize Git repository and create initial commit.
-   [ ] Create `manifest.json` (v3):
    -   [ ] Basic info: `name`, `version`, `description`, `manifest_version`.
    -   [ ] Define `action` for popup (`popup/popup.html`).
    -   [ ] Define `background` service worker (`background/service-worker.js`).
    -   [ ] Request initial permissions: `activeTab`, `scripting`, `storage`. (Revisit as needed).
    -   [ ] Define basic `content_scripts` (placeholder `content/content.js`).
-   [ ] Set up basic build process (e.g., manual loading for dev, consider Webpack/Vite for later).
-   [ ] Choose and configure linter/formatter (e.g., ESLint, Prettier).
-   [ ] Create basic `popup/popup.html`, `popup/popup.css`, `popup/popup.js`.
-   [ ] Create basic `background/service-worker.js`.
-   [ ] Create basic `content/content.js`.
-   [ ] **Goal:** Be able to load the extension in Chrome, open the popup, and have basic console logs working between popup, background, and content scripts.

## Phase 2: Content Extraction (Milestone: Sending Page Data) `[ContentScript]` `[Data]`

-   [ ] **Content Script:** Implement logic to be injected via `chrome.scripting.executeScript`.
-   [ ] **Content Script:** Develop strategy for capturing DOM structure:
    -   [ ] Initial approach: Send `document.body.outerHTML`.
    -   [ ] *Refinement:* Investigate methods to simplify/summarize HTML (e.g., remove scripts, simplify structure) to reduce token count for LLM. Consider focusing on `main` content or specific user-defined areas later.
-   [ ] **Content Script:** Develop strategy for capturing CSS:
    -   [ ] Initial approach: Extract content of `<style>` tags and `href`s of linked stylesheets (`<link rel="stylesheet">`). Fetch external CSS content? (Consider CORS and complexity).
    -   [ ] *Refinement:* Investigate `document.styleSheets` API. How to represent applied styles effectively without excessive data? `getComputedStyle` is likely too verbose. Focus on defined rules.
-   [ ] **Content Script:** Package extracted HTML & CSS into a structured JSON object.
-   [ ] **Content Script:** Implement messaging to send the data package to the background script (`chrome.runtime.sendMessage`).
-   [ ] **Background Script:** Implement listener (`chrome.runtime.onMessage`) to receive data from content script. Log received data for verification.
-   [ ] **Testing:** Test extraction on 3-5 diverse websites (simple blog, complex web app like Gmail, news site).

## Phase 3: LLM Interaction (Milestone: Getting Style Suggestions) `[Backend]` `[API]`

-   [ ] **API Key Management:**
    -   [ ] Decide on API key strategy: User-provided via Options page is MVP.
    -   [ ] `[Security]` Implement secure storage for API key using `chrome.storage.local` or `chrome.storage.sync`. **Do not hardcode or commit keys.**
    -   [ ] Create basic `options/options.html` and `options/options.js` for API key input.
-   [ ] **Background Script:** Implement function to construct the prompt for Gemini 2.5:
    -   [ ] Include extracted HTML structure.
    -   [ ] Include extracted CSS rules.
    -   [ ] Include the user's style prompt (passed from popup).
    -   [ ] *Prompt Engineering:* Iterate on prompt structure for clarity and effectiveness (e.g., specifying desired output format - CSS code block).
-   [ ] **Background Script:** Implement `fetch` call to Google Gemini API endpoint.
    -   [ ] Handle authentication using the stored API key.
    -   [ ] Implement robust error handling (network errors, API errors, rate limits).
-   [ ] **Background Script:** Implement logic to parse the Gemini response.
    -   [ ] Extract the generated CSS code block.
    -   [ ] Handle cases where the response is invalid, empty, or not CSS.
-   [ ] **Testing:** Test API calls with sample data, mock Gemini responses for error handling. Test with real API calls using simple style prompts ("make background blue", "increase font size").

## Phase 4: Style Application (Milestone: Seeing Live Style Changes) `[ContentScript]`

-   [ ] **Background Script:** Implement messaging to send the generated CSS back to the originating content script (requires tracking tab ID).
-   [ ] **Content Script:** Implement listener to receive generated CSS from the background script.
-   [ ] **Content Script:** Develop strategy for applying the CSS:
    -   [ ] Preferred: Create a new `<style>` tag in the document's `<head>` with a specific ID (e.g., `style-maverick-injected-styles`).
    -   [ ] Populate the `<style>` tag with the received CSS.
    -   [ ] Handle updates: If new styles are generated, replace the content of the existing extension's `<style>` tag.
-   [ ] **Content Script:** Implement a mechanism to *remove* applied styles (e.g., for a revert function or when disabling).
-   [ ] **Testing:** Apply simple generated CSS (background color, font size) on test pages. Verify styles apply correctly and override existing styles where intended. Test removing styles.

## Phase 5: Persistence (Milestone: Styles Reapplied on Reload) `[Storage]` `[Background]` `[ContentScript]`

-   [ ] **Storage Schema:** Define data structure for storing styles. Key by full URL? Or by domain? (Start with full URL: `{'url': '...', 'userPrompt': '...', 'generatedCss': '...'}`).
-   [ ] **Background Script:** On successful style generation and application, save the URL, user prompt, and generated CSS to `chrome.storage.local`.
-   [ ] **Background Script:** Implement listener for page loads/updates (`chrome.tabs.onUpdated` with `status === 'complete'`).
    -   [ ] When a tab finishes loading, check `chrome.storage.local` for styles matching the tab's URL.
    -   [ ] If styles found, send them to the content script for application.
-   [ ] **Content Script:** On initialization (when script is injected), request stored styles for the current URL from the background script.
-   [ ] **Content Script:** Implement listener to receive stored styles from background script and apply them using the Phase 4 mechanism. Ensure this happens automatically on page load.
-   [ ] **Management:** Add functionality (maybe in Options page?) to view and delete stored styles for specific URLs/domains.
-   [ ] **Testing:** Apply styles to a page, reload the page, verify styles are reapplied automatically. Close and reopen browser, verify again. Test deleting stored styles.

## Phase 6: UI/UX Polish (Milestone: User-Friendly Interaction) `[UX]` `[Popup]`

-   [ ] **Popup UI:** Design and implement the popup interface (`popup.html`, `popup.css`):
    -   [ ] Text area for user's style prompt.
    -   [ ] "Apply Styles" button.
    -   [ ] Loading indicator/spinner during processing.
    -   [ ] Status message area (e.g., "Applying styles...", "Styles applied!", "Error: ...").
    -   [ ] Display current tab's URL/domain?
    -   [ ] "Revert Session Styles" button (removes styles applied in the current session without clearing storage).
    -   [ ] Link to Options page.
-   [ ] **Popup Logic (`popup.js`):**
    -   [ ] Get current active tab's ID and URL.
    -   [ ] On "Apply" click:
        -   Get prompt text.
        -   Show loading state.
        -   Send message to background script with prompt and tab ID.
    -   [ ] Implement listener for messages *from* background script to update popup UI (status, errors).
-   [ ] **Options Page (`options/`):** Refine UI for API Key management and viewing/deleting stored styles.
-   [ ] **Iconography:** Design and add extension icons (16, 32, 48, 128 px).
-   [ ] **User Feedback:** Implement clear error messages and loading states throughout the process.

## Phase 7: Refinement, Testing & Edge Cases (Milestone: Robust & Performant Extension) `[Testing]` `[Performance]` `[Security]`

-   [ ] **Error Handling:**
    -   [ ] Comprehensive review of all potential error points (API, network, permissions, storage, DOM access, CSS parsing/application).
    -   [ ] Ensure graceful failure and informative user messages.
-   [ ] **Performance Optimization:**
    -   [ ] Analyze size of data sent to LLM. Implement HTML/CSS simplification if needed.
    -   [ ] Benchmark content script impact on page load and interaction speed. Optimize DOM traversal and CSS extraction.
    -   [ ] Ensure background script operations are efficient and don't block.
-   [ ] **Security Review:**
    -   [ ] Re-verify API key handling. Is `chrome.storage.local` sufficient? Consider implications if API key has broad permissions.
    -   [ ] Potential for CSS injection? Although CSS is generally sandboxed, review if generated CSS could be abused (e.g., `url()` imports, etc.). Minimal risk if source is trusted LLM, but worth noting.
    -   [ ] Ensure content script interacts minimally and safely with the host page.
-   [ ] **Edge Case Testing:**
    -   [ ] Single Page Applications (SPAs): How does the extension behave with dynamic content loading and URL changes without full page reloads? (May need `chrome.webNavigation.onHistoryStateUpdated`).
    -   [ ] `<iframe>` content: Define behavior (ignore, allow styling?).
    -   [ ] Complex CSS: Test on pages with heavy CSS frameworks (Bootstrap, Tailwind), CSS variables, complex selectors. Ensure generated CSS has sufficient specificity or uses `!important` judiciously if necessary.
    -   [ ] Content Security Policy (CSP): How does the extension handle pages with strict CSPs, especially regarding injected styles or external fetches (if CSS extraction fetches resources)?
    -   [ ] Very large pages/styles.
-   [ ] **Cross-Browser Testing:** Verify functionality in latest Chrome version. Consider Edge if desired.

## Phase 8: Documentation & Deployment (Milestone: Public Release)

-   [ ] Write `README.md`: Project description, features, setup for development, usage instructions.
-   [ ] Add code comments where necessary.
-   [ ] Prepare Chrome Web Store assets: description, screenshots, promo tiles.
-   [ ] Clean up code, remove console logs.
-   [ ] Bump version number.
-   [ ] Package extension (`.zip`).
-   [ ] Submit to Chrome Web Store.
-   [ ] Address any feedback from the review process.

## Future Considerations / V2 Ideas

-   [ ] Allow targeting specific elements for styling.
-   [ ] Support multiple style layers per page (apply multiple prompts).
-   [ ] Share/Export styles.
-   [ ] Use domain-level storage option instead of only page-level.
-   [ ] Integrate with user Google Account (OAuth) instead of manual API key.
-   [ ] More sophisticated DOM/CSS analysis (maybe client-side summarization before sending to LLM).
-   [ ] Visual element picker to select area/element to style.
