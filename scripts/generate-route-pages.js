const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://sin4.ch';
const SITEMAP_STATE_PATH = path.join(ROOT, 'scripts', 'sitemap-state.json');

const routes = [
  {
    slug: '',
    description: 'Osinachi Okpara is a software engineer, developer advocate and AWS Community Builder, passionate about agentic AI, cloud engineering, and open-source software.',
    image: '/social-preview.png?v=2',
    priority: '1.0'
  },
  {
    slug: 'projects',
    heading: 'Projects',
    description: 'Selected software, AI, infrastructure, and open-source projects by Osinachi Okpara.',
    image: '/social-preview-projects.png',
    priority: '0.8'
  },
  {
    slug: 'opensource',
    heading: 'Open Source',
    description: 'Open-source contributions by Osinachi Okpara across developer tooling, documentation, AI, and infrastructure projects.',
    image: '/social-preview-opensource.png',
    priority: '0.8'
  },
  {
    slug: 'writing',
    heading: 'Writing',
    description: 'Articles by Osinachi Okpara on AI, cloud infrastructure, DevOps, developer tools, and technology systems.',
    image: '/social-preview-writing.png',
    priority: '0.8'
  },
  {
    slug: 'talks',
    heading: 'Speaking & Hosting',
    description: 'Speaking and hosting engagements by Osinachi Okpara at developer, cloud, AI, and community events.',
    image: '/social-preview-talks.png',
    priority: '0.7'
  },
  {
    slug: 'gallery',
    heading: 'Gallery',
    description: 'A personal gallery of Osinachi Okpara at conferences, community events, talks, and technology gatherings.',
    image: '/social-preview.png?v=2',
    priority: '0.6'
  },
  {
    slug: 'experience',
    heading: 'Experience',
    description: 'Professional experience by Osinachi Okpara across software engineering, developer advocacy, technical writing, and community building.',
    image: '/social-preview.png?v=2',
    priority: '0.8'
  }
];

const redirects = {
  linkedin: 'https://linkedin.com/in/osinachiokpara',
  github: 'https://github.com/sin4ch',
  x: 'https://x.com/sin4ch',
  twitter: 'https://x.com/sin4ch',
  email: 'mailto:okparaosi17@gmail.com',
  resume: 'https://drive.google.com/file/d/1L5ceYqwEsZa2TuNwEsT65-IAWpmQLh8Y/view'
};

const sectionId = route => route.slug || 'home';
const sectionIds = routes.map(sectionId);

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function routeUrl(slug) {
  return slug ? `${SITE_URL}/${slug}/` : `${SITE_URL}/`;
}

function readSource() {
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
}

function getTitle(sourceHtml, route) {
  const match = sourceHtml.match(new RegExp(`<section id="${sectionId(route)}" data-title="([^"]*)"`));
  if (!match) throw new Error(`Missing data-title on section ${sectionId(route)}`);
  return match[1];
}

function replaceOrFail(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Could not update ${label}`);
  }
  return html.replace(pattern, replacement);
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

function rewriteAll(html, pattern, label, rewrite) {
  let count = 0;
  const result = html.replace(pattern, (match, attributes, id) => {
    if (!sectionIds.includes(id)) return match;
    count += 1;
    return rewrite(attributes, id);
  });
  if (count !== sectionIds.length) {
    throw new Error(`Expected ${sectionIds.length} route ${label}, found ${count}`);
  }
  return result;
}

function withRouteView(sourceHtml, route) {
  const target = sectionId(route);
  let html = rewriteAll(sourceHtml, /<section\b(\s+id="([a-z]+)"[^>]*)>/g, 'sections', (attributes, id) =>
    `<section${setActiveClass(attributes, id === target)}>`
  );

  if (route.slug) {
    html = replaceOrFail(
      html,
      /<span class="mobile-section-title" id="mobileSectionTitle"><\/span>/,
      `<h1 class="mobile-section-title" id="mobileSectionTitle">${escapeHtml(route.heading)}</h1>`,
      'mobile route heading'
    );
    html = replaceOrFail(
      html,
      /<h1 class="home-name">([\s\S]*?)<\/h1>/,
      '<span class="home-name">$1</span>',
      'inactive home heading'
    );
  }

  return rewriteAll(html, /<a\b([^>]*\bdata-target="([^"]+)"[^>]*)>/g, 'links', (attributes, id) => {
    const isActive = id === target;
    const updated = setActiveClass(attributes, isActive).replace(/\saria-current="page"/, '');
    return `<a${updated}${isActive ? ' aria-current="page"' : ''}>`;
  });
}

function withRouteMetadata(sourceHtml, route) {
  const rawTitle = getTitle(sourceHtml, route);
  const title = escapeAttr(rawTitle);
  const description = escapeAttr(route.description);
  const url = routeUrl(route.slug);
  const image = `${SITE_URL}${route.image}`;
  const imageAlt = escapeAttr(`${rawTitle} social preview`);
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

  let html = withRouteView(sourceHtml, route);
  html = replaceOrFail(html, /<title>.*?<\/title>/, `<title>${rawTitle}</title>`, 'title');
  for (const [tag, attribute, value] of tags) {
    html = replaceOrFail(html, new RegExp(`<${tag} ${attribute}="[^"]*">`), `<${tag} ${attribute}="${value}">`, tag);
  }
  return html;
}

function generateRoutePages(emit) {
  const sourceHtml = readSource();
  routes.filter(route => route.slug).forEach(route => {
    emit(path.join(ROOT, route.slug, 'index.html'), withRouteMetadata(sourceHtml, route));
  });
}

function generateNotFoundPage(emit) {
  const sections = routes.filter(route => route.slug).map(route => route.slug);
  emit(path.join(ROOT, '404.html'), `<!DOCTYPE html>
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
`);
}

function getPageState(content, previous, today) {
  const hash = createHash('sha256').update(content).digest('hex');
  return {
    hash,
    lastmod: previous?.hash === hash ? previous.lastmod : today
  };
}

function generateSitemap(emit) {
  const today = new Date().toISOString().slice(0, 10);
  const previous = fs.existsSync(SITEMAP_STATE_PATH)
    ? JSON.parse(fs.readFileSync(SITEMAP_STATE_PATH, 'utf8'))
    : {};
  const next = {};
  const sourceHtml = readSource();
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'gallery', 'gallery.json'), 'utf8'));
  const assets = new Set(['styles.css', 'main.js', 'gallery.js', 'gallery/gallery.json', 'site.webmanifest']);
  for (const match of sourceHtml.matchAll(/(?:src|href)="\/([^"?#]+)(?:[^\"]*)"/g)) {
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
  for (const route of routes) {
    const html = route.slug ? withRouteMetadata(sourceHtml, route) : sourceHtml;
    next[sectionId(route)] = getPageState(html + sharedHash, previous[sectionId(route)], today);
  }
  const entries = routes.map(route => `  <url>
    <loc>${routeUrl(route.slug)}</loc>
    <lastmod>${next[sectionId(route)].lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route.priority}</priority>
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
  const emit = (file, content) => files.set(file, content);
  generateRoutePages(emit);
  generateNotFoundPage(emit);
  generateSitemap(emit);
  return files;
}

function findOutdatedFiles(files) {
  return [...files].filter(([file, content]) =>
    !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content
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
    for (const [file, content] of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
}
