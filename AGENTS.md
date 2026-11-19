Site content lives in `_src/content.json` and the page layout in `_src/index.html`. Do not edit the generated files by hand: `index.html`, the section folders' `index.html`, `404.html`, the redirect pages (`linkedin.html` and the others) and `sitemap.xml`.

After every project change, run `bun scripts/generate-route-pages.js` to rebuild all generated pages and the sitemap before finishing.
