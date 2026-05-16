# Understanding the CSS & JS Restructuring of sin4.ch

## What This Project Is

Your personal portfolio site (`sin4.ch`) is a single-file web application — all HTML, CSS, and JavaScript live inside one `index.html`. This restructuring didn't add or remove any features. Instead, it organized the existing code with clear section comments, a table of contents in both CSS and JS, and a handful of targeted optimizations that simplify code without changing behavior.

Think of it like reorganizing a workshop: every tool is still there, nothing new was added, but now everything has a labeled drawer.

---

## The Technical Architecture

### Single-File Architecture

The entire site is one `index.html` (~2560 lines). This is intentional for a portfolio site:

- **No build step** — push to GitHub Pages and it's live
- **No dependencies at runtime** — everything is inline, no module bundler, no framework
- **Fast first paint** — the browser doesn't need to fetch separate CSS/JS files

The tradeoff is that the file is large and needs clear internal organization, which is exactly what this restructuring provides.

### CSS Structure (21 Sections)

The CSS is organized top-to-bottom in cascade order (this matters — CSS rules later in the file override earlier ones for the same specificity). The sections are:

1. **Reset & Custom Properties** — The `*` reset, `:root` CSS variables, and `::selection` styles. All your color tokens (`--bg-light`, `--text-dark`, etc.) live here. When you want to change a color site-wide, this is the one place to do it.

2. **Base & Typography** — `html`/`body` sizing, font family, and the global transition rule that makes dark mode color changes animate smoothly across every element.

3. **Cursor Follower** — The 12px circle that trails your mouse on desktop. Uses `mix-blend-mode: difference` so it's always visible against any background. Hidden on touch devices via `@media (hover: none)`.

4. **Layout (Grid System)** — The 4-column CSS Grid that positions the sidebar and content area. The sidebar takes 1 column, content takes 3. This collapses to 2-column on tablet and 1-column on mobile.

5. **Navigation** — The `.nav-links` container and `.nav-item` button styles. Nav items are `<button>` elements styled to look like text links (no border, no background).

6. **Contact Bar** — The fixed bottom bar with your profile photo and social links. It stays pinned to the bottom on all screen sizes.

7. **Page Sections & Transitions** — Each content section (`#about`, `#projects`, etc.) is absolutely positioned and stacked. Only the `.active` section is visible (`opacity: 1`). Transitions handle the fade between sections. The scrollbar styles are folded into this section too.

8. **About Section & Typewriter** — The large intro text sizing and the typewriter cursor animation (`@keyframes blink`).

9. **Content Items** — The reusable grid layout for projects, articles, talks, and experience entries. Each `.item` is a 2-column grid (date on left, content on right).

10. **Theme Toggle & Dark Mode** — The small circular toggle button and the `body.dark-mode` class that overrides all CSS custom properties to dark values.

11. **Custom Scrollbar & Scroll Indicator** — Section scrollbars that only appear on hover, plus the bouncing arrow indicator that shows when content is scrollable.

12-16. **Links, Photo Carousel, Gallery Grid, Lightbox, Loading Screen** — Each is a self-contained visual component.

17-21. **Responsive Breakpoints** — Tablet (≤1024px), mobile top bar, mobile (≤768px), small mobile (≤480px), and touch devices. Each breakpoint overrides earlier styles.

### JS Structure (16 Sections)

The JavaScript is organized by dependency order — things that need to exist first come first, then the features that use them:

1. **Configuration & Constants** — All tweakable values at the top: `INITIAL_COUNT`, `CONCURRENCY`, `VALID_SECTIONS`, `EXTERNAL_REDIRECTS`, typewriter words/speeds. If you want to change how many images preload, which sections are valid URL routes, or where external links redirect, you edit these constants.

2. **State Variables** — Mutable state like loading progress, gallery image arrays, and animation flags.

3. **DOM References** — All `document.getElementById` / `querySelector` calls for elements used throughout the script.

4. **Loading Screen & Progress** — The loading sequence has 3 phases:
   - Phase 0: Wait for fonts, profile pic, and `gallery.json` to load
   - Phase 1: Stream-download the 4 smallest gallery images with byte-level progress
   - Phase 2: Background-load remaining images after the loading screen dismisses

5. **Gallery Grid** — Bento-style masonry layout using independent columns. Images go into the shortest column each time (greedy bin-packing).

6. **Initialization** — Calls `createRoundedFavicon()` and `initLoadingSequence()` to kick off the app.

7. **Dynamic Favicon** — Generates a rounded favicon from the profile image using an offscreen canvas.

8. **Section Navigation & Routing** — `showSection()` handles the single-page navigation. URL hash routing (`#projects`, `#gallery`, etc.) lets you deep-link to any section. External redirects (`sin4.ch/linkedin` → LinkedIn profile) are handled here too.

9. **Scroll Indicator** — The bouncing arrow that appears when section content is scrollable.

10. **Utility Helpers** — Small pure functions: `isMobileLayout()`, `getColumnCount()`, `getRenderedHeight()`.

11. **Photo Carousel** — The horizontal auto-scrolling image strip. Uses a circular buffer approach — when the first image exits the left edge, it gets moved to the end of the track. Includes a consolidated `resize` handler that also updates the scroll indicator and rebuilds the gallery grid when column count changes.

12. **Mobile Menu (Hamburger)** — The hamburger button and slide-in menu for mobile viewports (≤768px).

13. **Theme Toggle** — Dark/light mode switch with `localStorage` persistence.

14. **Cursor Follower** — The 12px circle that trails your mouse on desktop. Uses `mix-blend-mode: difference`. Hidden on touch devices.

15. **Lightbox / Image Viewer** — Full-screen image viewer with keyboard, mouse, and touch swipe navigation.

16. **Typewriter Effect** — The typing/deleting animation loop on the About page, plus the `typeWriter()` call that starts it.

---

## What Changed (and Why)

### CSS Optimizations

**Merged duplicate `.item-content` rules.** There were two separate rule blocks targeting `.item-content` — one setting `grid-column: 2` and another setting the flex layout. Having two blocks for the same selector works but is misleading — it looks like you intended different things. Merging them into one block makes the full set of styles immediately visible.

**Merged section scrollbar into the main `section` block.** The scrollbar properties (`scrollbar-width: thin; scrollbar-color: transparent transparent;`) were in a separate `section {}` block 200 lines below the main one. Now they're in the same block. One selector, one place to read all its styles.

**Removed redundant comments.** Comments like `/* Main layout */` before `.layout` or `/* Dark mode toggle button */` before `.theme-toggle` were saying what the code already said. The new section headers (`/* ── 4. Layout (Grid System) ── */`) provide that context at a higher level, so the small comments became noise.

### JS Optimizations

**Extracted `VALID_SECTIONS` as a shared constant.** The array `['about', 'projects', 'opensource', ...]` was duplicated identically in `handleInitialRoute()` and the `hashchange` listener. Now it's defined once at the top. If you add a new section, you update one line instead of hunting for two.

**Removed dead `loadGalleryGrid()` function.** This function had an empty body (just a comment). It was called in `showSection()` when the gallery tab was shown, but did nothing. The actual gallery building happens in `buildGalleryGrid()` and `appendToGalleryGrid()`. Keeping a no-op function around is confusing — it looks like something should happen there.

**Simplified `toggleTheme()`.** `classList.toggle()` returns a boolean — `true` if the class was added, `false` if removed. The old code called `toggle()` then checked `classList.contains()` to decide what to save. The new code uses the return value directly:
```js
const isDark = document.body.classList.toggle('dark-mode');
localStorage.setItem('theme', isDark ? 'dark' : 'light');
```
Same behavior, half the lines. This pattern — using the return value of a method that already tells you what happened — is something to reach for whenever you find yourself immediately re-checking state after changing it.

**Simplified carousel visibility toggle.** The old code used 6 lines with `if/else` and manual `add`/`remove` calls. `classList.toggle(className, force)` with a boolean second argument does the same thing:
```js
carouselWrapper.classList.toggle('visible', targetId === 'about');
carouselWrapper.classList.toggle('hidden', targetId !== 'about');
```
The second argument forces the class on (`true`) or off (`false`).

**Extracted `EXTERNAL_REDIRECTS` to the config section.** The redirect map (`linkedin` → LinkedIn URL, `github` → GitHub URL, etc.) was defined inside `handleInitialRoute()`. It's a static lookup table, not runtime state — it belongs with the other constants at the top so you can see all configurable behavior in one place.

**Removed redundant cursor follower hover listeners.** There was a second block of hover listeners specifically for `.lightbox-close, .lightbox-prev, .lightbox-next` — but these are all `<button>` elements, already captured by `document.querySelectorAll('a, button, .theme-toggle')` a few lines above. The second block was doing nothing that the first block wasn't already doing.

**Consolidated two `resize` handlers into one.** There were two separate `window.addEventListener('resize', ...)` calls — one for the scroll indicator and one for the carousel/gallery grid. Now there's one handler that calls `updateScrollIndicator()`, `positionCarousel()`, and the column-count check for gallery grid rebuilds.

**Moved configuration to the top.** `CONCURRENCY`, typewriter settings, `VALID_SECTIONS`, and `EXTERNAL_REDIRECTS` were scattered throughout the file — some inside functions, some at the bottom. Now they're all in one place at the top. Anyone tweaking the site's behavior starts reading from line 1.

---

## Lessons and Patterns

### Generated Route Pages for SEO

The site is still one interactive app, but it now has real static entry pages for the main routes:

- `/projects/`
- `/opensource/`
- `/writing/`
- `/talks/`
- `/gallery/`
- `/experience/`

These files are generated by `scripts/generate-route-pages.js`. The important idea is that `index.html` remains the source of truth for the actual page markup. The generator copies that markup into each route folder, then swaps only the route-specific SEO details: title, description, canonical URL, `og:url`, and social preview text.

This avoids the dangerous version of duplication where you manually maintain seven separate HTML files. Instead, you edit the main `index.html`, run the generator, and every route gets the same current layout/content with its own search-friendly label.

The sitemap is generated by the same script so Google can discover the clean routes directly. This does not guarantee Google will show sitelinks, but it gives Google better evidence that the route pages are real, distinct pages rather than just one homepage with JavaScript state.

The tradeoff is discipline: whenever the shared HTML changes, run the generator before committing. Otherwise, the route copies can drift from the homepage.

### Why Section Comments Matter

When a file grows past ~200 lines, you start spending more time *finding* code than *reading* it. Section headers with a table of contents at the top solve this:

- **TOC** → scan the file's structure in 10 seconds
- **Section headers** → jump to any section with Ctrl+F
- **Numbered sections** → cross-reference between TOC and code

The specific format used here (`/* ── N. Section Name ── */`) was chosen because:
- The `──` line characters make headers visually distinct from regular comments
- Numbers let you find sections by searching `── 7.` instead of remembering exact names
- Consistent formatting means your eyes learn where to look

### CSS Cascade Order Matters

We never reordered any CSS rules. This is intentional. In CSS, when two rules have the same specificity, the one that appears later wins. Reordering can silently break styles in ways that are hard to debug — something might look fine on desktop but break on a specific mobile width because a media query override now comes before the rule it's supposed to override.

The safe approach: add comments and structure around the existing order. Only reorder if you fully understand the specificity chain and test every breakpoint.

### The Return Value Pattern

`classList.toggle()` returns a boolean. `Array.prototype.push()` returns the new length. `Map.prototype.set()` returns the Map itself. Many DOM and collection methods return useful values that people ignore by habit. Before writing a separate check after a mutation, look at what the mutation method returns.

### Single Source of Truth for Constants

The `VALID_SECTIONS` duplication is a classic bug waiting to happen. You add a new section to one location, forget the other, and the hashchange listener silently falls back to "about" for URLs that `handleInitialRoute()` handles fine. The fix is always the same: extract to a single constant and reference it everywhere.

### Dead Code Has a Cost

`loadGalleryGrid()` was an empty function. It wasn't hurting performance, but it was hurting readability. Someone reading the code would see `loadGalleryGrid()` called in `showSection()` and think "this does something when you switch to the gallery tab." They'd search for the definition, find an empty body, and wonder if it's a bug or intentional. Removing it eliminates that confusion.

The rule: if a function does nothing and isn't a placeholder for upcoming work, delete it. If it IS a placeholder, add a TODO comment explaining what it will do and when.

### The `classList.toggle(name, force)` Pattern

This is one of the most underused DOM APIs. Instead of:
```js
if (condition) {
  element.classList.add('visible');
  element.classList.remove('hidden');
} else {
  element.classList.remove('visible');
  element.classList.add('hidden');
}
```

You can write:
```js
element.classList.toggle('visible', condition);
element.classList.toggle('hidden', !condition);
```

The second argument (`force`) is a boolean: `true` means "add the class", `false` means "remove it". This works in all modern browsers.

---

## How the Loading Sequence Works (Deep Dive)

This is one of the more interesting parts of the codebase. The loading screen shows a percentage counter that reflects actual download progress of gallery images:

1. **Fonts, JSON, and profile pic load first** (Phase 0) — these are small and fast, so no progress bar is needed. The loading screen isn't even visible yet.

2. **Once those are ready, the loading screen fades in** and starts downloading the 4 smallest gallery images using the Fetch API's `ReadableStream` (Phase 1). As bytes arrive, `onBytes()` updates the percentage.

3. **The percentage counter animates smoothly** using `requestAnimationFrame`. Instead of jumping from 45% to 67%, it eases toward the target. The formula `Math.max(0.3, diff * 0.12)` means: move at least 0.3% per frame, but speed up when far behind the target.

4. **After hitting 100%, there's a deliberate pause** before the loading screen slides up and the main content slides in (using CSS `transform: translateY`).

5. **Remaining images load in the background** (Phase 2) with 4 concurrent download chains. As each image loads, it's appended to both the gallery grid and the carousel track.

This gives the user a responsive, accurate loading experience without blocking them from seeing content.
