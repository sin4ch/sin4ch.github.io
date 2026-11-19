const STAR_PATH = 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z';
const FORK_PATH = 'M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878Zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm3-8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z';

const loadingScreen = document.getElementById('loading-screen');
const loadingPercentage = document.getElementById('loading-percentage');
const loadingProgress = window.LoadingProgress;
const mainWrapper = document.getElementById('main-wrapper');
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('section');
const sectionIds = [...sections].map(section => section.id);
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const mobileQuery = window.matchMedia('(max-width: 768px)');
const routeControls = new Map();

document.querySelector('.mobile-menu-contact')
  .append(...document.querySelector('.contact-links').cloneNode(true).children);

function getSectionPath(sectionId) {
  return sectionId === 'home' ? '/' : `/${sectionId}/`;
}

function toSection(route) {
  return sectionIds.includes(route) ? route : 'home';
}

function getPathRoute() {
  return window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase();
}

function getQueryRoute() {
  return new URLSearchParams(window.location.search).get('section')?.toLowerCase() || '';
}

function currentUrl() {
  return window.location.pathname + window.location.search + window.location.hash;
}

function cycleFocus(event, elements) {
  event.preventDefault();
  if (!elements.length) return;
  const index = elements.indexOf(document.activeElement);
  const next = event.shiftKey
    ? (index <= 0 ? elements.length : index) - 1
    : (index + 1) % elements.length;
  elements[next].focus();
}

function updateRouteControlQuery(sectionId, value, defaultValue) {
  const url = new URL(window.location.href);
  url.pathname = getSectionPath(sectionId);
  url.searchParams.delete('section');
  if (value === defaultValue) url.searchParams.delete('sort');
  else url.searchParams.set('sort', value);
  history.pushState({ ...(history.state || {}), section: sectionId, sort: value }, '', url.pathname + url.search + url.hash);
}

function syncRouteControlsFromUrl(sectionId) {
  const url = new URL(window.location.href);
  const keepSort = routeControls.get(sectionId)?.sync(url.searchParams.get('sort'));
  url.searchParams.delete('section');
  if (!keepSort) url.searchParams.delete('sort');
  const nextUrl = url.pathname + url.search + url.hash;
  if (nextUrl !== currentUrl()) {
    history.replaceState({ ...(history.state || {}), section: sectionId }, '', nextUrl);
  }
}

function setElementTag(element, tagName) {
  if (!element || element.tagName.toLowerCase() === tagName) return element;
  const replacement = document.createElement(tagName);
  for (const attribute of element.attributes) {
    replacement.setAttribute(attribute.name, attribute.value);
  }
  replacement.textContent = element.textContent;
  element.replaceWith(replacement);
  return replacement;
}

function syncPageHeading(targetId) {
  const isHome = targetId === 'home';
  setElementTag(document.querySelector('.home-name'), isHome ? 'h1' : 'span');
  const mobileTitle = setElementTag(document.getElementById('mobileSectionTitle'), isHome ? 'span' : 'h1');
  if (!mobileTitle) return;
  const activeNav = [...navItems].find(nav => nav.dataset.target === targetId);
  mobileTitle.textContent = isHome ? '' : (activeNav?.textContent.trim() || targetId);
}

function syncPageMetadata(targetId) {
  document.title = document.getElementById(targetId)?.dataset.title || document.getElementById('home').dataset.title;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.href = new URL(getSectionPath(targetId), window.location.origin).href;
  }
}

function waitForSiteStyles() {
  const stylesheet = document.getElementById('site-stylesheet');
  if (!stylesheet || stylesheet.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener('site-styles-ready', resolve, { once: true });
  });
}

async function initLoadingSequence() {
  loadingProgress.report('scripts');
  await Promise.all([
    waitForSiteStyles(),
    document.fonts.load('1rem InterVariable'),
    window.PortfolioGallery.preloadInitialImages(loadingProgress)
  ]);
  loadingProgress.complete();
  await loadingProgress.waitFor(99.5);
  completeLoading();
  window.PortfolioGallery.loadRemainingImages();
}

function completeLoading() {
  loadingPercentage.textContent = '100%';
  window.PortfolioGallery.buildGalleryGrid();
  setTimeout(() => {
    loadingScreen.classList.add('hidden');
    document.documentElement.classList.remove('loading-active');
    mainWrapper.classList.add('visible');
    handleInitialRoute();
    setTimeout(updatePinnedFilter, 100);
    setTimeout(() => {
      positionCarousel();
      window.PortfolioGallery.loadPhotoCarousel();
    }, 850);
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 800);
  }, 300);
}

function showSection(targetId, updateUrl = true) {
  if (window.PortfolioGallery.isLightboxOpen()) {
    window.PortfolioGallery.closeLightbox();
  }

  const isHome = targetId === 'home';
  sections.forEach(section => section.classList.toggle('active', section.id === targetId));
  if (document.getElementById(targetId)) window.scrollTo({ top: 0, behavior: 'auto' });
  navItems.forEach(nav => {
    const isActive = nav.dataset.target === targetId;
    nav.classList.toggle('active', isActive);
    if (isActive) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  });
  syncPageHeading(targetId);
  syncPageMetadata(targetId);
  if (updateUrl) {
    history.pushState({ section: targetId }, '', getSectionPath(targetId));
  }
  syncRouteControlsFromUrl(targetId);
  const carouselWrapper = document.getElementById('carousel-wrapper');
  if (carouselWrapper) {
    carouselWrapper.classList.toggle('visible', isHome);
    carouselWrapper.classList.toggle('hidden', !isHome);
  }
  document.documentElement.classList.toggle('home-active', isHome);
  window.PortfolioGallery.onSectionChange(targetId);
  packFilterRows();
  positionCarousel();
  updatePinnedFilter();
}

function handleInitialRoute() {
  const targetSection = toSection(getQueryRoute() || getPathRoute() || 'home');
  const url = new URL(window.location.href);
  url.pathname = getSectionPath(targetSection);
  url.searchParams.delete('section');
  history.replaceState({ section: targetSection }, '', url.pathname + url.search + url.hash);
  showSection(targetSection, false);
}

function navigate(targetId) {
  if (sidebar.classList.contains('menu-open')) showMenuSection(targetId);
  else showSection(targetId);
}

document.getElementById('mobileProfilePhoto')?.addEventListener('click', () => navigate('home'));

function getFocusableMenuElements() {
  return [...sidebar.querySelectorAll('button, a[href]'),
    document.getElementById('mobileProfilePhoto'),
    document.getElementById('themeToggleMobile'), hamburger]
    .filter(el => el && !el.disabled && el.getClientRects().length > 0);
}

function repaintMobileMenuText() {
  const navLinks = sidebar.querySelector('.nav-links');
  if (!navLinks) return;
  navLinks.classList.add('menu-text-repaint');
  navLinks.offsetHeight;
  requestAnimationFrame(() => {
    navLinks.classList.remove('menu-text-repaint');
  });
}

let menuScrollY = 0;

function setMenuState(open) {
  sidebar.classList.toggle('menu-open', open);
  document.documentElement.classList.toggle('menu-active', open);
  hamburger.classList.toggle('open', open);
  hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  hamburger.setAttribute('aria-expanded', String(open));
}

function openMobileMenu() {
  if (sidebar.classList.contains('menu-open')) return;
  menuScrollY = window.scrollY;
  document.body.style.top = `-${menuScrollY}px`;
  setMenuState(true);
  repaintMobileMenuText();
  window.setTimeout(repaintMobileMenuText, 380);
  sidebar.querySelector('a.nav-item:not([data-target="home"])')?.focus({ preventScroll: true });
  document.addEventListener('keydown', handleMenuKeydown);
}

function closeMobileMenu(options = {}) {
  if (!sidebar.classList.contains('menu-open')) return;
  setMenuState(false);
  document.body.style.top = '';
  window.scrollTo({ top: menuScrollY, behavior: 'instant' });
  updatePinnedFilter();
  document.removeEventListener('keydown', handleMenuKeydown);
  if (options.focusHamburger) {
    hamburger.focus({ preventScroll: true });
  }
}

function showMenuSection(targetId) {
  sections.forEach(s => s.style.transition = 'none');
  closeMobileMenu();
  showSection(targetId);
  document.body.offsetHeight;
  sections.forEach(s => s.style.transition = '');
}

function handleMenuKeydown(event) {
  if (event.key === 'Escape') closeMobileMenu({ focusHamburger: true });
  else if (event.key === 'Tab') cycleFocus(event, getFocusableMenuElements());
}

hamburger.addEventListener('click', () => {
  if (sidebar.classList.contains('menu-open')) closeMobileMenu();
  else openMobileMenu();
});

sidebar.addEventListener('click', event => {
  const link = event.target instanceof Element
    ? event.target.closest('a.nav-item[href]')
    : null;
  if (!link || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      link.hasAttribute('download') || (link.target && link.target !== '_self')) {
    return;
  }

  const targetId = link.dataset.target;
  if (!sectionIds.includes(targetId)) return;
  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin) return;
  const destinationRoute = destination.pathname.replace(/^\/|\/$/g, '').toLowerCase() || 'home';
  if (destinationRoute !== targetId) return;

  event.preventDefault();
  navigate(targetId);
});

document.querySelectorAll('.home-work-link').forEach(link => {
  link.addEventListener('click', openMobileMenu);
});

window.addEventListener('popstate', (event) => {
  showSection(event.state?.section || toSection(getPathRoute() || 'home'), false);
});

function initRouteControl(control, section, valueKey, apply) {
  const buttons = [...control.querySelectorAll('.section-filter-button')];
  const defaultButton = buttons.find(button => button.classList.contains('active')) || buttons[0];
  const valueOf = button => button?.dataset[valueKey];
  let activeButton = defaultButton;

  function select(button, updateUrl = false) {
    if (!button) return;
    activeButton = button;
    buttons.forEach(other => {
      const isActive = other === button;
      other.classList.toggle('active', isActive);
      other.setAttribute('aria-pressed', String(isActive));
    });
    apply(valueOf(button));
    updatePinnedFilter();
    if (updateUrl) updateRouteControlQuery(section.id, valueOf(button), valueOf(defaultButton));
  }

  routeControls.set(section.id, {
    sync(value) {
      const button = value === null ? defaultButton : buttons.find(other => valueOf(other) === value);
      select(button || defaultButton);
      return Boolean(button) && button !== defaultButton;
    },
    refresh() {
      select(activeButton);
    }
  });
  buttons.forEach(button => button.addEventListener('click', () => select(button, true)));
  select(defaultButton);
}

function initSectionFilters() {
  document.querySelectorAll('.section-filter[data-filter-section]').forEach(filter => {
    const section = document.getElementById(filter.dataset.filterSection);
    if (!section) return;
    const items = [...section.querySelectorAll('.items > .item')];
    let currentGroup = '';

    items.forEach(item => {
      const meta = item.querySelector('.item-meta');
      const badge = item.querySelector('.article-badge, .role-badge');
      const originalMeta = meta?.textContent.trim() || '';
      if (originalMeta) currentGroup = originalMeta;
      item.dataset.filterGroup = currentGroup;
      item.dataset.originalMeta = originalMeta;
      item.dataset.filterCategory = badge?.textContent.trim().toLowerCase() || '';
    });

    function itemMatchesFilter(item, selected) {
      if (selected === 'all') return true;
      if (selected === 'favourite') return item.dataset.filterFavourite === 'true';
      return item.dataset.filterCategory === selected;
    }

    initRouteControl(filter, section, 'filterValue', selected => {
      const isFavouriteFilter = selected === 'favourite';
      const order = item => Number(item.dataset.filterOrder || 999);
      let lastVisibleGroup = '';

      const visibleItems = [];
      items.forEach(item => {
        const meta = item.querySelector('.item-meta');
        item.style.order = isFavouriteFilter ? item.dataset.filterOrder || '999' : '';
        if (meta) meta.textContent = isFavouriteFilter ? '' : item.dataset.originalMeta;
        const matches = itemMatchesFilter(item, selected);
        item.hidden = !matches;
        item.classList.remove('filter-first-visible');
        if (matches) visibleItems.push(item);
      });

      if (isFavouriteFilter) visibleItems.sort((a, b) => order(a) - order(b));

      visibleItems.forEach((item, index) => {
        const meta = item.querySelector('.item-meta');
        if (!meta) return;
        if (index === 0) item.classList.add('filter-first-visible');
        const group = item.dataset.filterGroup || '';
        if (!isFavouriteFilter && selected !== 'all' && group && group !== lastVisibleGroup && !item.dataset.originalMeta) {
          meta.textContent = group;
        }
        lastVisibleGroup = group || lastVisibleGroup;
      });

      section.classList.toggle('filter-compact', selected !== 'all');
    });
  });
}

function initProjectSort() {
  document.querySelectorAll('.project-sort[data-sort-section]').forEach(sortControl => {
    const section = document.getElementById(sortControl.dataset.sortSection);
    if (!section) return;
    const itemsContainer = section.querySelector('.items');
    const items = [...itemsContainer.querySelectorAll(':scope > .item')];

    items.forEach(item => {
      item.dataset.projectYear = item.querySelector('.item-meta')?.textContent.trim() || '';
    });

    initRouteControl(sortControl, section, 'sortValue', selected => {
      const count = item => Number(selected === 'stars' ? item.dataset.projectStars : item.dataset.projectForks) || 0;
      const sortedItems = selected === 'date'
        ? items
        : [...items].sort((a, b) => count(b) - count(a) || items.indexOf(a) - items.indexOf(b));
      sortedItems.forEach(item => itemsContainer.appendChild(item));

      let lastYear = '';
      sortedItems.forEach(item => {
        const meta = item.querySelector('.item-meta');
        if (!meta) return;
        const year = selected === 'date' ? item.dataset.projectYear : '';
        meta.textContent = year && year !== lastYear ? year : '';
        if (year) lastYear = year;
      });
    });
  });
}

let pinnedFilter = null;
let pinnedPlaceholder = null;

function getPinnedTopbarHeight() {
  if (!mobileQuery.matches) return 0;
  return document.getElementById('mobile-top-bar')?.getBoundingClientRect().height || 0;
}

function syncPinnedFilter(topbarH) {
  if (!pinnedFilter || !pinnedPlaceholder) return;
  const rect = pinnedPlaceholder.getBoundingClientRect();
  pinnedFilter.style.top = topbarH + 'px';
  pinnedFilter.style.left = rect.left + 'px';
  pinnedFilter.style.width = rect.width + 'px';
  const filterH = pinnedFilter.getBoundingClientRect().height;
  document.getElementById('top-fade')?.style.setProperty('--fade-solid', `calc(${Math.round(topbarH + filterH)}px - var(--fade-tuck))`);
}

function unpinFilter() {
  if (!pinnedFilter) return;
  pinnedFilter.style.position = '';
  pinnedFilter.style.top = '';
  pinnedFilter.style.left = '';
  pinnedFilter.style.width = '';
  pinnedFilter.style.zIndex = '';
  document.getElementById('top-fade')?.style.removeProperty('--fade-solid');
  pinnedPlaceholder?.remove();
  pinnedPlaceholder = null;
  pinnedFilter = null;
}

function updatePinnedFilter() {
  if (!mobileQuery.matches) {
    unpinFilter();
    return;
  }
  if (sidebar.classList.contains('menu-open')) return;
  const activeFilter = document.querySelector('section.active .section-filter');
  if (pinnedFilter !== activeFilter) unpinFilter();
  if (!activeFilter) return;
  const topbarH = getPinnedTopbarHeight();
  if (pinnedFilter) {
    if (pinnedPlaceholder.getBoundingClientRect().top >= topbarH + 8) unpinFilter();
    else syncPinnedFilter(topbarH);
    return;
  }
  const rect = activeFilter.getBoundingClientRect();
  if (rect.height > 0 && rect.top < topbarH) {
    pinnedPlaceholder = document.createElement('div');
    pinnedPlaceholder.setAttribute('aria-hidden', 'true');
    pinnedPlaceholder.style.height = rect.height + 'px';
    activeFilter.before(pinnedPlaceholder);
    pinnedFilter = activeFilter;
    pinnedFilter.style.position = 'fixed';
    pinnedFilter.style.zIndex = '50';
    syncPinnedFilter(topbarH);
  }
}

window.addEventListener('scroll', updatePinnedFilter, { passive: true });
window.addEventListener('pageshow', updatePinnedFilter);

function packFilterRows() {
  document.querySelectorAll('.section-filter').forEach(filter => {
    filter.querySelectorAll(':scope > .section-filter-row').forEach(row => row.replaceWith(...row.childNodes));
    const buttons = [...filter.querySelectorAll(':scope > .section-filter-button')];
    if (!buttons.length) return;
    const filterWidth = filter.clientWidth;
    if (filterWidth <= 0) return;
    const label = filter.querySelector(':scope > .section-filter-label');
    const labelWidth = label ? Math.ceil(label.getBoundingClientRect().width) + 8 : 0;
    const rows = [];
    let current = [];
    let currentWidth = 0;
    let capacity = filterWidth - labelWidth;
    buttons.forEach(button => {
      const width = Math.ceil(button.getBoundingClientRect().width);
      if (current.length && currentWidth + width > capacity) {
        rows.push(current);
        current = [];
        currentWidth = 0;
        capacity = filterWidth;
      }
      current.push(button);
      currentWidth += width;
    });
    if (current.length) rows.push(current);
    const rowElements = rows.map(rowButtons => {
      const row = document.createElement('div');
      row.className = 'section-filter-row';
      row.append(...rowButtons);
      filter.appendChild(row);
      return row;
    });
    const rowLefts = rowElements.map(row => row.getBoundingClientRect().left);
    rowElements.forEach((row, index) => {
      if (index === 0) return;
      const exposedWidth = Math.max(0, rowLefts[index - 1] - rowLefts[index]);
      row.style.setProperty('--exposed-top-line-width', `${exposedWidth}px`);
    });
    if (pinnedFilter) {
      pinnedPlaceholder.style.height = pinnedFilter.getBoundingClientRect().height + 'px';
      syncPinnedFilter(getPinnedTopbarHeight());
    }
  });
}

document.fonts?.ready.then(packFilterRows);

function positionCarousel() {
  const wrapper = document.getElementById('carousel-wrapper');
  const themeToggle = document.getElementById('themeToggle');
  const contactBar = document.getElementById('contact-bar');
  if (!wrapper || !themeToggle || !contactBar) return;
  if (mobileQuery.matches) {
    if (!document.getElementById('home')?.classList.contains('active')) { wrapper.style.display = 'none'; return; }
    const anchorEl = document.querySelector('.home-work-link') || document.querySelector('.home-intro');
    if (!anchorEl) return;
    const bottomInset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing')) || 24;
    const topPos = anchorEl.getBoundingClientRect().bottom + bottomInset;
    const availableHeight = window.innerHeight - topPos - bottomInset;
    if (availableHeight < 60) { wrapper.style.display = 'none'; return; }
    wrapper.style.display = '';
    wrapper.style.bottom = 'auto';
    wrapper.style.top = topPos + 'px';
    wrapper.style.height = availableHeight + 'px';
    wrapper.style.maxHeight = availableHeight + 'px';
  } else {
    wrapper.style.display = '';
    wrapper.style.bottom = 'auto';
    wrapper.style.maxHeight = '';
    const top = themeToggle.getBoundingClientRect().bottom + 24;
    const height = contactBar.getBoundingClientRect().top - top;
    wrapper.style.top = top + 'px';
    wrapper.style.height = Math.max(height, 100) + 'px';
  }
}

let lastColCount = window.PortfolioGallery.getColumnCount();
let resizeTimer = null;
let resizeFrame = null;

function applyResizeLayout() {
  resizeFrame = null;
  if (!mobileQuery.matches && sidebar.classList.contains('menu-open')) {
    closeMobileMenu();
  }
  updatePinnedFilter();
  positionCarousel();
  const newColCount = window.PortfolioGallery.getColumnCount();
  if (newColCount !== lastColCount) {
    lastColCount = newColCount;
    window.PortfolioGallery.buildGalleryGrid();
  }
}

window.addEventListener('resize', () => {
  document.body.classList.add('is-resizing');
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    document.body.classList.remove('is-resizing');
    packFilterRows();
  }, 150);

  if (resizeFrame === null) resizeFrame = requestAnimationFrame(applyResizeLayout);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    positionCarousel();
    updatePinnedFilter();
  }
});

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark-mode');
  document.getElementById('system-theme-color')?.setAttribute('content', isDark ? '#121212' : '#ffead3');
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  } catch {}
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('themeToggleMobile')?.addEventListener('click', toggleTheme);

const cursorFollower = document.getElementById('cursorFollower');
const cursorVisibleQuery = window.matchMedia('(min-width: 1025px)');
const coarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
const reducedCursorMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let mouseX = 0;
let mouseY = 0;
let followerX = 0;
let followerY = 0;
let cursorFrame = null;

function animateFollower() {
  followerX += (mouseX - followerX) * 0.15;
  followerY += (mouseY - followerY) * 0.15;
  followerX = Math.min(Math.max(followerX, 16), window.innerWidth - 16);
  followerY = Math.min(Math.max(followerY, 16), window.innerHeight - 16);
  cursorFollower.style.transform = 'translate3d(' + followerX.toFixed(1) + 'px,' + followerY.toFixed(1) + 'px,0) translate(-50%, -50%)';
  cursorFrame = requestAnimationFrame(animateFollower);
}

function syncCursorAnimation() {
  const visible = !document.hidden && cursorVisibleQuery.matches && !coarsePointerQuery.matches && !reducedCursorMotionQuery.matches;
  if (visible && cursorFrame === null) {
    cursorFrame = requestAnimationFrame(animateFollower);
  } else if (!visible && cursorFrame !== null) {
    cancelAnimationFrame(cursorFrame);
    cursorFrame = null;
  }
}

document.addEventListener('mousemove', event => {
  mouseX = event.clientX;
  mouseY = event.clientY;
});
document.querySelectorAll('a, button').forEach(el => {
  el.addEventListener('mouseenter', () => cursorFollower.classList.add('hovering'));
  el.addEventListener('mouseleave', () => cursorFollower.classList.remove('hovering'));
});
cursorVisibleQuery.addEventListener('change', syncCursorAnimation);
coarsePointerQuery.addEventListener('change', syncCursorAnimation);
reducedCursorMotionQuery.addEventListener('change', syncCursorAnimation);
document.addEventListener('visibilitychange', syncCursorAnimation);
syncCursorAnimation();

function renderStats(el, stars, forks) {
  const item = el.closest('.item');
  if (item) {
    item.dataset.projectStars = String(stars);
    item.dataset.projectForks = String(forks);
  }
  el.innerHTML =
    '<span class="stat-badge"><svg viewBox="0 0 16 16" fill="currentColor"><path d="' + STAR_PATH + '"/></svg> ' + stars + '</span>' +
    '<span class="stat-badge"><svg viewBox="0 0 16 16" fill="currentColor"><path d="' + FORK_PATH + '"/></svg> ' + forks + '</span>';
}

function initGitHubStats() {
  const refreshSort = () => routeControls.get('projects')?.refresh();
  document.querySelectorAll('.item-stats[data-repo]').forEach(el => {
    const repo = el.dataset.repo;
    const cacheKey = 'gh-stats-' + repo;
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey));
    } catch {}
    const stars = parseInt(el.dataset.stars, 10);
    const forks = parseInt(el.dataset.forks, 10);
    if (cached) renderStats(el, cached.stars, cached.forks);
    else if (!isNaN(stars) && !isNaN(forks)) renderStats(el, stars, forks);
    if (cached && Date.now() - cached.ts < 86400000) return;

    fetch('https://api.github.com/repos/' + repo)
      .then(response => response.json())
      .then(data => {
        if (typeof data.stargazers_count !== 'number') return;
        renderStats(el, data.stargazers_count, data.forks_count);
        refreshSort();
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ stars: data.stargazers_count, forks: data.forks_count, ts: Date.now() }));
        } catch {}
      })
      .catch(() => {});
  });
  refreshSort();
}

function initOrganizationLogos() {
  document.querySelectorAll('.experience-logo').forEach(img => {
    const wrapper = img.closest('.experience-logo-link');
    if (!wrapper) return;
    wrapper.dataset.fallback = (img.alt || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase();
    const reveal = () => wrapper.classList.add('logo-loaded');
    if (img.complete && img.naturalWidth) reveal();
    else img.addEventListener('load', reveal, { once: true });
  });
}

initOrganizationLogos();
initSectionFilters();
initProjectSort();
initGitHubStats();
initLoadingSequence();
