const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://sin4.ch';
const SOURCE_DIR = path.join(ROOT, '_src');
const SITEMAP_STATE_PATH = path.join(ROOT, 'scripts', 'sitemap-state.json');
const LINK = 'target="_blank" rel="noopener"';

const content = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'content.json'), 'utf8'));
const { pages, redirects } = content;
const pageIds = pages.map(page => page.id);

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pagePath(page) {
  return page.id === 'home' ? '/' : `/${page.id}/`;
}

function link(url, label, className) {
  return `<a${className ? ` class="${className}"` : ''} href="${escapeAttr(url)}" ${LINK}>${escapeHtml(label)}</a>`;
}

function logo(file, alt) {
  return `<img class="experience-logo" src="/assets/org-icons/${escapeAttr(file)}" alt="${escapeAttr(alt)}" width="48" height="48" decoding="async">`;
}

function item(meta, body, attributes = '') {
  return `            <div class="item"${attributes}>
              <div class="item-meta">${escapeHtml(meta)}</div>
              <div class="item-content">
${body}
              </div>
            </div>`;
}

const renderers = {
  projects: entry => `                <div class="item-title">${link(entry.url, entry.title)}</div>
                <div class="item-description">${escapeHtml(entry.description)}</div>
                <div class="item-stats" data-repo="${escapeAttr(entry.repo)}" data-stars="${entry.stars}" data-forks="${entry.forks}"></div>`,

  opensource: entry => `                <a class="opensource-card-link" href="${escapeAttr(entry.url)}" ${LINK}>
                  <div class="experience-logo-link">
                    ${logo(entry.logo, entry.org)}
                  </div>
                  <div class="experience-details">
                    <div class="item-title">${escapeHtml(entry.title)}</div>
                    <div class="item-subtitle">${escapeHtml(entry.subtitle)}</div>
                  </div>
                </a>`,

  writing: entry => {
    const dot = '<span aria-hidden="true">&middot;</span>';
    const extra = entry.link ? `${dot}${link(entry.link.url, entry.link.label, 'meta-link')}` : '';
    return `                <div class="item-title">${link(entry.url, entry.title)}</div>
                <div class="item-subtitle date-text"><span class="article-badge">${escapeHtml(entry.type.toUpperCase())}</span>${dot}<span>${escapeHtml(entry.date)}</span>${extra}</div>`;
  },

  talks: entry => `                <div class="item-title">${entry.url ? link(entry.url, entry.title) : escapeHtml(entry.title)}</div>
                <div class="item-subtitle">${escapeHtml(entry.event)}</div>
                <div class="item-tags"><span class="role-badge">${escapeHtml(entry.role.toUpperCase())}</span></div>`,

  experience: entry => {
    const logoBlock = entry.url
      ? `                <a class="experience-logo-link" href="${escapeAttr(entry.url)}" ${LINK} aria-label="${escapeAttr(entry.org)}">
                  ${logo(entry.logo, entry.org)}
                </a>`
      : `                <div class="experience-logo-link">
                  ${logo(entry.logo, entry.org)}
                </div>`;
    const org = entry.url ? link(entry.url, entry.org, 'source-ref') : escapeHtml(entry.org);
    return `${logoBlock}
                <div class="experience-details">
                  <div class="item-title">${escapeHtml(entry.title)}</div>
                  <div class="item-subtitle">${org} · <span class="experience-duration">${escapeHtml(entry.duration)}</span></div>
                </div>`;
  }
};

function renderSection(name) {
  let lastYear = null;
  return content[name].map(entry => {
    const meta = entry.year && entry.year !== lastYear ? entry.year : '';
    lastYear = entry.year;
    const attributes = entry.favourite ? ` data-filter-favourite="true" data-filter-order="${entry.favourite}"` : '';
    return item(meta, renderers[name](entry), attributes);
  }).join('\n');
}

function replaceOrFail(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Could not update ${label}`);
  }
  return html.replace(pattern, replacement);
}

function rewriteAll(html, pattern, label, rewrite) {
  let count = 0;
  const result = html.replace(pattern, (match, attributes, id) => {
    if (!pageIds.includes(id)) return match;
    count += 1;
    return rewrite(attributes, id);
  });
  if (count !== pageIds.length) {
    throw new Error(`Expected ${pageIds.length} ${label}, found ${count}`);
  }
  return result;
}

function setActiveClass(attributes, isActive) {
  let found = false;
  const result = attributes.replace(/\sclass="([^"]*)"/, (match, classNames) => {
    found = true;
    const classes = classNames.split(/\s+/).filter(name => name && name !== 'active');
    if (isActive) classes.push('active');
    return classes.length ? ` class="${classes.join(' ')}"` : '';
  });
  return found || !isActive ? result : `${result} class="active"`;
}

function renderTemplate() {
  let html = fs.readFileSync(path.join(SOURCE_DIR, 'index.html'), 'utf8');
  for (const name of Object.keys(renderers)) {
    html = replaceOrFail(html, new RegExp(`\\{\\{${name}\\}\\}`), () => renderSection(name), `${name} items`);
  }
  return html;
}

function renderPage(template, page) {
  const isHome = page.id === 'home';
  let html = rewriteAll(template, /<section\b(\s+id="([a-z]+)"[^>]*)>/g, 'sections', (attributes, id) => {
    const title = pages.find(other => other.id === id).title;
    const rest = setActiveClass(attributes.replace(/\s+id="[a-z]+"/, ''), id === page.id);
    return `<section id="${id}" data-title="${escapeAttr(title)}"${rest}>`;
  });

  if (!isHome) {
    html = replaceOrFail(
      html,
      /<span class="mobile-section-title" id="mobileSectionTitle"><\/span>/,
      `<h1 class="mobile-section-title" id="mobileSectionTitle">${escapeHtml(page.heading)}</h1>`,
      'mobile route heading'
    );
    html = replaceOrFail(
      html,
      /<h1 class="home-name">([\s\S]*?)<\/h1>/,
      '<span class="home-name">$1</span>',
      'inactive home heading'
    );
  }

  html = rewriteAll(html, /<a\b([^>]*\bdata-target="([^"]+)"[^>]*)>/g, 'nav links', (attributes, id) => {
    const isActive = id === page.id;
    const updated = setActiveClass(attributes, isActive).replace(/\saria-current="page"/, '');
    return `<a${updated}${isActive ? ' aria-current="page"' : ''}>`;
  });

  const title = escapeAttr(page.title);
  const description = escapeAttr(page.description);
  const url = SITE_URL + pagePath(page);
  const image = SITE_URL + page.image;
  const imageAlt = escapeAttr(`${page.title} social preview`);
  const tags = [
    ['meta name="description"', 'content', description],
    ['meta property="og:title"', 'content', title],
    ['meta property="og:description"', 'content', description],
    ['meta property="og:image"', 'content', image],
    ['meta property="og:image:alt"', 'content', imageAlt],
    ['meta property="og:url"', 'content', url],
    ['meta name="twitter:title"', 'content', title],
    ['meta name="twitter:description"', 'content', description],
    ['meta name="twitter:image"', 'content', image],
    ['meta name="twitter:image:alt"', 'content', imageAlt],
    ['link rel="canonical"', 'href', url]
  ];
  html = replaceOrFail(html, /<title>.*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`, 'title');
  for (const [tag, attribute, value] of tags) {
    html = replaceOrFail(html, new RegExp(`<${tag} ${attribute}="[^"]*">`), `<${tag} ${attribute}="${value}">`, tag);
  }
  return html;
}

function renderRedirect(name, target) {
  const href = escapeAttr(target);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(name)} - Osinachi Okpara</title>
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=${href}">
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <a href="${href}">${href}</a>
</body>
</html>
`;
}

function renderNotFound() {
  const sections = pageIds.filter(id => id !== 'home');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found - Redirecting...</title>
  <script>
    const redirects = ${JSON.stringify(redirects)};
    const sections = ${JSON.stringify(sections)};
    const route = location.pathname.replace(/^\\/|\\/$/g, '').toLowerCase();
    location.replace(redirects[route] || (sections.includes(route) ? '/' + route + '/' : '/'));
  </script>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>
`;
}

function getPageState(text, previous, today) {
  const hash = createHash('sha256').update(text).digest('hex');
  return {
    hash,
    lastmod: previous?.hash === hash ? previous.lastmod : today
  };
}

function renderSitemap(emit, pageHtml) {
  const today = new Date().toISOString().slice(0, 10);
  const previous = fs.existsSync(SITEMAP_STATE_PATH)
    ? JSON.parse(fs.readFileSync(SITEMAP_STATE_PATH, 'utf8'))
    : {};
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'gallery', 'gallery.json'), 'utf8'));
  const assets = new Set(['styles.css', 'main.js', 'gallery.js', 'gallery/gallery.json', 'site.webmanifest']);
  for (const match of pageHtml.get('home').matchAll(/(?:src|href)="\/([^"?#]+)(?:[^"]*)"/g)) {
    const file = path.join(ROOT, match[1]);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) assets.add(match[1]);
  }
  for (const match of css.matchAll(/url\(['"]?\/([^'"?#)]+)/g)) assets.add(match[1]);
  for (const image of gallery.images) assets.add(image.url.replace(/^\//, ''));
  const assetHash = createHash('sha256');
  for (const asset of [...assets].sort()) {
    assetHash.update(asset).update('\0').update(fs.readFileSync(path.join(ROOT, asset)));
  }
  const sharedHash = assetHash.digest('hex');
  const next = {};
  for (const page of pages) {
    next[page.id] = getPageState(pageHtml.get(page.id) + sharedHash, previous[page.id], today);
  }
  const entries = pages.map(page => `  <url>
    <loc>${SITE_URL}${pagePath(page)}</loc>
    <lastmod>${next[page.id].lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n');

  emit(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`);
  emit(SITEMAP_STATE_PATH, JSON.stringify(next, null, 2) + '\n');
}

function getGeneratedFiles() {
  const files = new Map();
  const emit = (file, text) => files.set(file, text);
  const template = renderTemplate();
  const pageHtml = new Map(pages.map(page => [page.id, renderPage(template, page)]));
  for (const [id, html] of pageHtml) {
    emit(path.join(ROOT, id === 'home' ? '' : id, 'index.html'), html);
  }
  for (const [name, target] of Object.entries(redirects)) {
    emit(path.join(ROOT, `${name}.html`), renderRedirect(name, target));
  }
  emit(path.join(ROOT, '404.html'), renderNotFound());
  renderSitemap(emit, pageHtml);
  return files;
}

function findOutdatedFiles(files) {
  return [...files].filter(([file, text]) =>
    !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text
  ).map(([file]) => path.relative(ROOT, file));
}

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) {
  console.error('Usage: bun scripts/generate-route-pages.js [--check]');
  process.exitCode = 1;
} else {
  const files = getGeneratedFiles();
  if (args.includes('--check')) {
    const outdated = findOutdatedFiles(files);
    outdated.forEach(file => console.error(`${file} needs rebuilding`));
    if (outdated.length) process.exitCode = 1;
    else console.log('All generated files are up to date.');
  } else {
    for (const [file, text] of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
  }
}
