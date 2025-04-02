# TODO - Vibe Styler Chrome Extension

A chrome extension that lets you change the style of any page with a prompt using Google Gemini 2.5. Keeps track of changes so when you go back to the page your changes are applied.

## Phase 1: Project Foundation & Setup (Milestone: Basic Loadable Extension)

-   [x] Define project directory structure (`/popup`, `/content_scripts`, `/background`, `/assets`, `/options`?)
-   [x] Initialize Git repository and create initial commit.
-   [x] Create `manifest.json` (v3):
    -   [x] Basic info: `name`, `version`, `description`, `manifest_version`.
    -   [x] Define `action` for popup (`popup/popup.html`).
    -   [x] Define `background` service worker (`background/service-worker.js`).
    -   [x] Request initial permissions: `activeTab`, `scripting`, `storage`. (Revisit as needed).
    -   [x] Define basic `content_scripts` (placeholder `content/content.js`).
-   [x] Set up basic build process (e.g., manual loading for dev, consider Webpack/Vite for later).
-   [x] Choose and configure linter/formatter (e.g., ESLint, Prettier).
-   [x] Create basic `popup/popup.html`, `popup/popup.css`, `popup/popup.js`.
-   [x] Create basic `background/service-worker.js`.
-   [x] Create basic `content/content.js`.
-   [x] **Goal:** Be able to load the extension in Chrome, open the popup, and have basic console logs working between popup, background, and content scripts.

## Phase 2: Content Extraction (Milestone: Sending Page Data) `[ContentScript]` `[Data]`

-   [x] **Content Script:** Implement logic to be injected via `chrome.scripting.executeScript`.
-   [x] **Content Script:** Develop strategy for capturing DOM structure:
    -   [x] Initial approach: Send `document.body.outerHTML`.
    -   [ ] *Refinement:* Investigate methods to simplify/summarize HTML (e.g., remove scripts, simplify structure) to reduce token count for LLM. Consider focusing on `main` content or specific user-defined areas later.
-   [x] **Content Script:** Develop strategy for capturing CSS:
    -   [x] Initial approach: Extract content of `<style>` tags and `href`s of linked stylesheets (`<link rel="stylesheet">`). Fetch external CSS content? (Consider CORS and complexity).
    -   [ ] *Refinement:* Investigate `document.styleSheets` API. How to represent applied styles effectively without excessive data? `getComputedStyle` is likely too verbose. Focus on defined rules.
-   [x] **Content Script:** Package extracted HTML & CSS into a structured JSON object.
-   [x] **Content Script:** Implement messaging to send the data package to the background script (`chrome.runtime.sendMessage`).
-   [x] **Background Script:** Implement listener (`chrome.runtime.onMessage`) to receive data from content script. Log received data for verification.
-   [x] **Testing:** Test extraction on 3-5 diverse websites (simple blog, complex web app like Gmail, news site).

## Phase 3: LLM Interaction (Milestone: Getting Style Suggestions) `[Backend]` `[API]`

-   [x] **API Key Management:**
    -   [x] Decide on API key strategy: User-provided via Options page is MVP.
    -   [x] `[Security]` Implement secure storage for API key using `chrome.storage.sync`. **Do not hardcode or commit keys.**
    -   [x] Create basic `options/options.html` and `options/options.js` for API key input.
-   [x] **Background Script:** Implement function to construct the prompt for Gemini 2.5:
    -   [x] Include extracted HTML structure.
    -   [x] Include extracted CSS rules.
    -   [x] Include the user's style prompt (passed from popup).
    -   [x] *Prompt Engineering:* Iterate on prompt structure for clarity and effectiveness (e.g., specifying desired output format - CSS code block).
-   [x] **Background Script:** Implement `fetch` call to Google Gemini API endpoint.
    -   [x] Handle authentication using the stored API key.
    -   [x] Implement robust error handling (network errors, API errors, rate limits).
-   [x] **Background Script:** Implement logic to parse the Gemini response.
    -   [x] Extract the generated CSS code block.
    -   [x] Handle cases where the response is invalid, empty, or not CSS.
-   [x] **Testing:** Test API calls with sample data, mock Gemini responses for error handling. Test with real API calls using simple style prompts ("make background blue", "increase font size").

## Phase 4: Style Application (Milestone: Seeing Live Style Changes) `[ContentScript]`

-   [x] **Background Script:** Implement messaging to send the generated CSS back to the originating content script (requires tracking tab ID).
-   [x] **Content Script:** Implement listener to receive generated CSS from the background script.
-   [x] **Content Script:** Develop strategy for applying the CSS:
    -   [x] Preferred: Create a new `<style>` tag in the document's `<head>` with a specific ID (e.g., `style-viberstyler-injected-styles`).
    -   [x] Populate the `<style>` tag with the received CSS.
    -   [x] Handle updates: If new styles are generated, replace the content of the existing extension's `<style>` tag.
-   [x] **Content Script:** Implement a mechanism to *remove* applied styles (e.g., for a revert function or when disabling).
-   [x] **Testing:** Test style application on 3-5 diverse websites (simple blog, complex web app like Gmail, news site).

## Phase 5: Persistence (Milestone: Styles Reapplied on Reload) `[Storage]` `[Background]` `[ContentScript]`

-   [x] **Storage Schema:** Define data structure for storing styles. Key by full URL? Or by domain? (Start with full URL: `{'url': '...', 'userPrompt': '...', 'generatedCss': '...'}`). Use `chrome.storage.local`. Key: `styleMaverickStyles` -> `{ url: { userPrompt, generatedCss } }`.
-   [x] **Background Script:** On successful style generation and application, save the URL, user prompt, and generated CSS to `chrome.storage.local`.
-   [x] **Background Script:** Implement listener for page loads/updates (`chrome.tabs.onUpdated` with `status === 'complete'`).
    -   [x] When a tab finishes loading, check `chrome.storage.local` for styles matching the tab's URL.
    -   [x] If styles found, send them to the content script for application.
-   [x] **Content Script:** On initialization (when script is injected), request stored styles for the current URL from the background script. *(Handled by background script sending styles proactively)*.
-   [x] **Content Script:** Implement listener to receive stored styles from background script and apply them using the Phase 4 mechanism. Ensure this happens automatically on page load. *(Uses existing INJECT_CSS handler)*.
-   [x] **Management:** Add functionality (maybe in Options page?) to view and delete stored styles for specific URLs/domains.
-   [x] **Testing:** Test persistence: apply styles, reload page, verify reapplication. Close/reopen browser, verify. Test deleting styles.

## Phase 6: UI/UX Polish (Milestone: User-Friendly Interaction) `[UX]` `[Popup]`

-   [x] **Popup UI:** Design and implement the popup interface (`popup.html`, `popup.css`):
    -   [x] Text area for user's style prompt.
    -   [x] "Apply Styles" button.
    -   [x] Loading indicator/spinner during processing.
    -   [x] Status message area (e.g., "Applying styles...", "Styles applied!", "Error: ...").
    -   [x] Display current tab's URL/domain?
    -   [x] "Revert Session Styles" button (removes styles applied in the current session without clearing storage).
    -   [x] Link to Options page.
-   [x] **Popup Logic (`popup.js`):
    -   [x] Get current active tab's ID and URL.
    -   [x] On "Apply" click:
        -   [x] Get prompt text.
        -   [x] Show loading state.
        -   [x] Send message to background script with prompt and tab ID.
    -   [x] Implement listener for messages *from* background script to update popup UI (final status, errors, hide loader).
-   [x] **Options Page (`options/`):** Refine UI for API Key management and viewing/deleting stored styles.
-   [x] **Iconography:** Design and add extension icons (16, 32, 48, 128 px). *(Manifest updated with placeholders)*.
-   [x] **User Feedback:** Implement clear error messages and loading states throughout the process.

## Phase 7: Refinement, Testing & Edge Cases (Milestone: Robust & Performant Extension) `[Testing]` `[Performance]` `[Security]`

-   [x] **Error Handling:**
    -   [x] Comprehensive review of all potential error points (API, network, permissions, storage, DOM access, CSS parsing/application).
    -   [x] Ensure graceful failure and informative user messages.
-   [ ] **Performance Optimization:** *(Requires specific testing/benchmarking - Deferred)*
    -   [ ] Analyze size of data sent to LLM. Implement HTML/CSS simplification if needed.
    -   [ ] Benchmark content script impact on page load and interaction speed. Optimize DOM traversal and CSS extraction.
    -   [ ] Ensure background script operations are efficient and don't block.
-   [x] **Security Review:**
    -   [x] Re-verify API key handling. Is `chrome.storage.sync` sufficient? Consider implications if API key has broad permissions. *(Sufficient for MVP)*.
    -   [x] Potential for CSS injection? Although CSS is generally sandboxed, review if generated CSS could be abused (e.g., `url()` imports, etc.). Minimal risk if source is trusted LLM, but worth noting. *(Risk acknowledged)*.
    -   [x] Ensure content script interacts minimally and safely with the host page. *(Current interaction minimal)*.
-   [ ] **Edge Case Testing:** *(Requires specific manual testing - Deferred)*
    -   [ ] Single Page Applications (SPAs): How does the extension behave with dynamic content loading and URL changes without full page reloads? (May need `chrome.webNavigation.onHistoryStateUpdated`).
    -   [ ] `<iframe>` content: Define behavior (ignore, allow styling?).
    -   [ ] Complex CSS: Test on pages with heavy CSS frameworks (Bootstrap, Tailwind), CSS variables, complex selectors. Ensure generated CSS has sufficient specificity or uses `!important` judiciously if necessary.
    -   [ ] Content Security Policy (CSP): How does the extension handle pages with strict CSPs, especially regarding injected styles or external fetches (if CSS extraction fetches resources)?
    -   [ ] Very large pages/styles.
-   [ ] **Cross-Browser Testing:** *(Requires manual testing - Deferred)* Verify functionality in latest Chrome version. Consider Edge if desired.

## Phase 8: Documentation & Deployment (Milestone: Public Release)

-   [x] Write `README.md`: Project description, features, setup for development, usage instructions.
-   [x] Add code comments where necessary.
-   [ ] Prepare Chrome Web Store assets: description, screenshots, promo tiles. *(Manual step - Deferred)*.
-   [x] Clean up code, remove console logs. *(Manual step - Deferred)*.
-   [x] Bump version number.
-   [ ] Package extension (`.zip`). *(Manual step)*.
-   [ ] Submit to Chrome Web Store. *(Manual step)*.
-   [ ] Address any feedback from the review process.
