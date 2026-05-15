/* ============================================
   JS TABLE OF CONTENTS
   ============================================
   1.  Constants & Configuration
   2.  Shared State
   3.  Loading Screen
   4.  Gallery Grid
   5.  Favicon
   6.  Navigation & Routing
   7.  Scroll Indicator
   8.  Photo Carousel
   9.  Window Resize Handler
   10. Theme Toggle
   11. Cursor Follower
   12. Lightbox / Image Viewer
   13. GitHub Stats
   14. Boot
   ============================================ */


/* ============================================
   1. CONSTANTS & CONFIGURATION
   ============================================ */
const INITIAL_COUNT = 4;
const VALID_SECTIONS = ['home', 'projects', 'opensource', 'writing', 'talks', 'gallery', 'experience'];
const EXTERNAL_REDIRECTS = {
  'linkedin': 'https://linkedin.com/in/osinachiokpara',
  'github': 'https://github.com/sin4ch',
  'x': 'https://x.com/sin4ch',
  'twitter': 'https://x.com/sin4ch',
  'email': 'mailto:okparaosi17@gmail.com',
  'resume': 'https://drive.google.com/file/d/1L5ceYqwEsZa2TuNwEsT65-IAWpmQLh8Y/view'
};
function getSectionPath(sectionId) {
  return sectionId === 'home' ? '/' : `/${sectionId}`;
}

function getPathRoute() {
  return window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase();
}

function getQueryRoute() {
  return new URLSearchParams(window.location.search).get('section')?.toLowerCase() || '';
}

function normalizeSectionRoute(route) {
  return route === 'about' ? 'home' : route;
}



/* ============================================
   2. SHARED STATE
   ============================================ */
let preloadedGalleryData = null;
let loadedGalleryImages = [];
let actualPct = 0;
let displayedPct = 0;
let animating = false;
let galleryColumns = [];
let columnHeights = [];
let skeletonMap = {};
let shuffledOrder = [];
let carouselSkeletonQueue = [];
const loadingScreen = document.getElementById('loading-screen');
const loadingPercentage = document.getElementById('loading-percentage');
const mainWrapper = document.getElementById('main-wrapper');
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('section');



/* ============================================
   3. LOADING SCREEN
   ============================================ */
function setActualProgress(pct) {
  actualPct = Math.min(pct, 100);
  if (!animating) {
    animating = true;
    requestAnimationFrame(animateCounter);
  }
}

function animateCounter() {
  if (displayedPct < actualPct) {
    const diff = actualPct - displayedPct;
    const step = Math.max(0.3, diff * 0.12);
    displayedPct = Math.min(displayedPct + step, actualPct);
    loadingPercentage.textContent = Math.round(displayedPct) + '%';
  }
  if (displayedPct < 100) {
    requestAnimationFrame(animateCounter);
  } else {
    loadingPercentage.textContent = '100%';
    animating = false;
  }
}

async function initLoadingSequence() {
  const jsonPromise = fetch('gallery/gallery.json')
    .then(r => r.json())
    .then(data => {
      if (data.images && data.images.length > 0) preloadedGalleryData = data;
    })
    .catch(() => {});
  const profileImg = document.querySelector('.profile-photo img');
  const profilePromise = profileImg && !profileImg.complete
    ? new Promise(r => { profileImg.onload = r; profileImg.onerror = r; })
    : Promise.resolve();
  await Promise.all([document.fonts.ready, jsonPromise, profilePromise]);
  loadingScreen.classList.add('ready');
  await preloadGalleryImages();
}

async function preloadGalleryImages() {
  if (!preloadedGalleryData || !preloadedGalleryData.images.length) {
    completeLoading();
    return;
  }
  // Fisher-Yates shuffle for random order on every refresh
  const shuffledImages = [...preloadedGalleryData.images];
  for (let i = shuffledImages.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledImages[i], shuffledImages[j]] = [shuffledImages[j], shuffledImages[i]];
  }
  shuffledOrder = shuffledImages;

  const initialBatch = shuffledImages.slice(0, INITIAL_COUNT);
  let completed = 0;
  let targetPct = 0;
  let simulatedPct = 0;
  const speedJitter = 0.5 + Math.random() * 0.5;
  const decelBase = 0.01 + Math.random() * 0.06;
  const weights = Array.from({length: INITIAL_COUNT}, () => 0.5 + Math.random());
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const checkpoints = [];
  let cumulative = 0;
  weights.forEach(w => {
    cumulative += (w / totalWeight) * 100;
    checkpoints.push(cumulative);
  });
  checkpoints[checkpoints.length - 1] = 100;
  const bufferOffsets = Array.from({length: INITIAL_COUNT}, () => Math.floor(Math.random() * 21) - 10);
  let simRunning = true;

  // Organic progress simulation
  function tickProgress() {
    if (!simRunning) return;
    const gap = targetPct - simulatedPct;
    const noise = 0.8 + Math.random() * 0.4;
    let speed;
    if (gap > 5) {
      speed = (1.0 + gap * 0.15) * speedJitter * noise;
    } else if (gap > 0) {
      speed = (0.2 + gap * 0.08) * speedJitter * noise;
    } else {
      const currentOffset = bufferOffsets[completed] || 0;
      const buffer = targetPct < 100 ? Math.max(0, targetPct + currentOffset) : 100;
      speed = simulatedPct < buffer ? decelBase * noise : 0;
    }
    simulatedPct = Math.min(simulatedPct + speed, 100);
    setActualProgress(simulatedPct);
    requestAnimationFrame(tickProgress);
  }
  requestAnimationFrame(tickProgress);

  for (const imgData of initialBatch) {
    try {
      const img = new Image();
      img.src = imgData.url;
      await img.decode();
      imgData.naturalWidth = img.naturalWidth;
      imgData.naturalHeight = img.naturalHeight;
      loadedGalleryImages.push(imgData);
    } catch (e) {
      // image failed to load, skip it
    }
    completed++;
    targetPct = checkpoints[completed - 1];
  }
  await new Promise(r => {
    function waitForAnimation() {
      if (displayedPct >= 99.5) {
        simRunning = false;
        r();
        return;
      }
      requestAnimationFrame(waitForAnimation);
    }
    waitForAnimation();
  });
  completeLoading();
  const loadedIds = new Set(loadedGalleryImages.map(img => img.id));
  const remainingInOrder = shuffledImages.filter(img => !loadedIds.has(img.id));
  loadRemainingImages(remainingInOrder);
}

function loadRemainingImages(remaining) {
  if (remaining.length === 0) return;
  let idx = 0;

  function loadNext() {
    if (idx >= remaining.length) return;
    const imgData = remaining[idx++];
    const img = new Image();
    img.onload = () => {
      imgData.naturalWidth = img.naturalWidth;
      imgData.naturalHeight = img.naturalHeight;
      loadedGalleryImages.push(imgData);
      appendToGalleryGrid(imgData);
      const imgEl = document.createElement('img');
      imgEl.src = imgData.url;
      imgEl.alt = imgData.title || 'Gallery photo';
      imgEl.className = 'carousel-img-loaded';
      const carouselSkeleton = carouselSkeletonQueue.length > 0 ? carouselSkeletonQueue.shift() : null;
      if (carouselSkeleton && carouselSkeleton.parentNode) {
        carouselSkeleton.parentNode.replaceChild(imgEl, carouselSkeleton);
      } else {
        const track = document.querySelector('.photo-carousel-track');
        if (track) track.appendChild(imgEl);
      }
      loadNext();
    };
    img.onerror = () => loadNext();
    img.src = imgData.url;
  }

  loadNext();
}

function completeLoading() {
  loadingPercentage.textContent = '100%';
  buildGalleryGrid();
  fetchGitHubStats();
  setTimeout(() => {
    loadingScreen.classList.add('hidden');
    mainWrapper.classList.add('visible');
    handleInitialRoute();
    setTimeout(updateScrollIndicator, 100);
    setTimeout(() => {
      positionCarousel();
      loadPhotoCarousel();
    }, 850);
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 800);
  }, 300);
}



/* ============================================
   4. GALLERY GRID
   ============================================ */
function getColumnCount() {
  const w = window.innerWidth;
  if (w <= 480) return 1;
  if (w <= 768) return 2;
  if (w <= 1024) return 3;
  return 4;
}

function getRenderedHeight(imgData) {
  if (!imgData.naturalWidth || !imgData.naturalHeight) return 200;
  if (galleryColumns.length === 0) return 200;
  const colWidth = galleryColumns[0].offsetWidth || 200;
  return (imgData.naturalHeight / imgData.naturalWidth) * colWidth;
}

function buildGalleryGrid() {
  const galleryGrid = document.getElementById('gallery-grid');
  if (!galleryGrid) return;
  const colCount = getColumnCount();
  galleryGrid.innerHTML = '';
  galleryColumns = [];
  columnHeights = [];
  for (let i = 0; i < colCount; i++) {
    const col = document.createElement('div');
    col.className = 'gallery-column';
    galleryGrid.appendChild(col);
    galleryColumns.push(col);
    columnHeights.push(0);
  }
  loadedGalleryImages.forEach((img, index) => {
    const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
    galleryColumns[shortestIdx].appendChild(createGalleryItem(img, index));
    columnHeights[shortestIdx] += getRenderedHeight(img) + 6;
  });
  buildSkeletonPlaceholders();
}

function createGalleryItem(img, index) {
  const itemEl = document.createElement('div');
  itemEl.className = 'gallery-item';
  itemEl.innerHTML = `<img src="${img.blobUrl || img.url}" alt="${img.title || 'Gallery photo'}">`;
  itemEl.addEventListener('click', () => openLightbox(loadedGalleryImages.indexOf(img)));
  return itemEl;
}

function appendToGalleryGrid(imgData) {
  if (galleryColumns.length === 0) return;
  const index = loadedGalleryImages.indexOf(imgData);
  const item = createGalleryItem(imgData, index);
  const skeleton = skeletonMap[imgData.id];
  if (skeleton && skeleton.parentNode) {
    const colIdx = Array.prototype.indexOf.call(galleryColumns, skeleton.parentNode);
    if (colIdx !== -1) {
      skeleton.parentNode.replaceChild(item, skeleton);
    } else {
      const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
      galleryColumns[shortestIdx].appendChild(item);
      columnHeights[shortestIdx] += getRenderedHeight(imgData) + 6;
    }
    delete skeletonMap[imgData.id];
  } else {
    const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
    galleryColumns[shortestIdx].appendChild(item);
    columnHeights[shortestIdx] += getRenderedHeight(imgData) + 6;
  }
}

function buildSkeletonPlaceholders() {
  skeletonMap = {};
  if (!preloadedGalleryData || galleryColumns.length === 0) return;
  const colWidth = galleryColumns[0].offsetWidth || 200;
  const loadedIds = new Set(loadedGalleryImages.map(img => img.id));
  const remaining = (shuffledOrder.length > 0 ? shuffledOrder : preloadedGalleryData.images)
    .filter(img => !loadedIds.has(img.id));

  remaining.forEach(imgData => {
    const skeleton = document.createElement('div');
    skeleton.className = 'gallery-skeleton';
    const height = (imgData.width && imgData.height)
      ? (imgData.height / imgData.width) * colWidth
      : colWidth * 1.25;
    skeleton.style.height = height + 'px';
    const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
    galleryColumns[shortestIdx].appendChild(skeleton);
    columnHeights[shortestIdx] += height + 6;
    skeletonMap[imgData.id] = skeleton;
  });
}



/* ============================================
   5. FAVICON
   ============================================ */
function createRoundedFavicon() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    const favicon = document.getElementById('favicon');
    favicon.href = canvas.toDataURL('image/png');
  };
  img.src = 'profile-picture.webp';
}



/* ============================================
   6. NAVIGATION & ROUTING
   ============================================ */
function showSection(targetId, updateUrl = true) {
  const activeLightbox = document.getElementById('lightbox');
  if (activeLightbox && activeLightbox.classList.contains('active')) {
    activeLightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  sections.forEach(section => {
    section.classList.remove('active');
  });
  const targetSection = document.getElementById(targetId);
  if (targetSection) {
    targetSection.classList.add('active');
    if (typeof badgeRectsDirty !== 'undefined') badgeRectsDirty = true;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  navItems.forEach(nav => {
    nav.classList.remove('active');
    if (nav.dataset.target === targetId) {
      nav.classList.add('active');
    }
  });
  if (updateUrl) {
    history.pushState({ section: targetId }, '', getSectionPath(targetId));
  }
  const carouselWrapper = document.getElementById('carousel-wrapper');
  if (carouselWrapper) {
    carouselWrapper.classList.toggle('visible', targetId === 'home');
    carouselWrapper.classList.toggle('hidden', targetId !== 'home');
  }
  document.body.classList.toggle('home-active', targetId === 'home');
  positionCarousel();
  updateScrollIndicator();
}

function handleInitialRoute() {
  const path = getPathRoute();
  if (EXTERNAL_REDIRECTS[path]) {
    window.location.replace(EXTERNAL_REDIRECTS[path]);
    return;
  }
  const query = getQueryRoute();
  const route = normalizeSectionRoute(query || path || 'home');
  const targetSection = VALID_SECTIONS.includes(route)  ? route : 'home';
  history.replaceState({ section: targetSection }, '', getSectionPath(targetSection));
  showSection(targetSection, false);
}

const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const mobileProfilePhoto = document.getElementById('mobileProfilePhoto');

if (mobileProfilePhoto) {
  mobileProfilePhoto.addEventListener('click', () => {
    showSection('home');
  });
}

function getFocusableMenuElements() {
  return sidebar.querySelectorAll('button.nav-item:not([data-target="home"]), button.theme-toggle, .mobile-menu-contact a');
}

function handleMenuFocusTrap(e) {
  if (e.key === 'Escape') {
    sidebar.classList.remove('menu-open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-label', 'Open menu');
    document.removeEventListener('keydown', handleMenuFocusTrap);
    hamburger.focus();
    return;
  }
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const focusable = Array.from(getFocusableMenuElements());
  focusable.push(hamburger);
  if (focusable.length === 0) return;
  const currentIndex = focusable.indexOf(document.activeElement);
  let nextIndex;
  if (e.shiftKey) {
    nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
  } else {
    nextIndex = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1;
  }
  focusable[nextIndex].focus();
}

hamburger.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('menu-open');
  hamburger.classList.toggle('open');
  if (isOpen) {
    hamburger.setAttribute('aria-label', 'Close menu');
    const firstNav = sidebar.querySelector('button.nav-item:not([data-target="home"])');
    if (firstNav) firstNav.focus();
    document.addEventListener('keydown', handleMenuFocusTrap);
  } else {
    hamburger.setAttribute('aria-label', 'Open menu');
    document.removeEventListener('keydown', handleMenuFocusTrap);
  }
});

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetId = item.dataset.target;
    if (sidebar.classList.contains('menu-open')) {
      sections.forEach(s => s.style.transition = 'none');
      showSection(targetId);
      document.body.offsetHeight;
      sections.forEach(s => s.style.transition = '');
      sidebar.classList.remove('menu-open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-label', 'Open menu');
      document.removeEventListener('keydown', handleMenuFocusTrap);
    } else {
      showSection(targetId);
    }
  });
});

window.addEventListener('popstate', (event) => {
  if (event.state && event.state.section) {
    showSection(event.state.section, false);
  } else {
    const route = normalizeSectionRoute(getPathRoute() || 'home');
    const targetSection = VALID_SECTIONS.includes(route)  ? route : 'home';
    showSection(targetSection, false);
  }
});



/* ============================================
   7. SCROLL INDICATOR
   ============================================ */
const scrollIndicatorDown = document.getElementById('scroll-indicator-down');
const scrollIndicatorUp = document.getElementById('scroll-indicator-up');
let lastScrollTop = 0;
let scrollDirection = 'down';

function updateScrollIndicator() {
  const root = document.documentElement;
  const currentScrollTop = window.scrollY || root.scrollTop;
  const viewportHeight = window.innerHeight;
  const scrollHeight = root.scrollHeight;
  const isScrollable = scrollHeight > viewportHeight + 1;
  const isAtBottom = currentScrollTop + viewportHeight >= scrollHeight - 20;
  const isAtTop = currentScrollTop <= 20;

  if (currentScrollTop < lastScrollTop) {
    scrollDirection = 'up';
  } else if (currentScrollTop > lastScrollTop) {
    scrollDirection = 'down';
  }
  lastScrollTop = currentScrollTop;

  const showUp = isScrollable && scrollDirection === 'up' && !isAtTop;
  const showDown = isScrollable && !isAtBottom && !showUp;
  if (scrollIndicatorDown) {
    scrollIndicatorDown.classList.toggle('visible', showDown);
  }
  if (scrollIndicatorUp) {
    scrollIndicatorUp.classList.toggle('visible', showUp);
  }
}

if (scrollIndicatorDown) {
  scrollIndicatorDown.addEventListener('click', () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  });
}

if (scrollIndicatorUp) {
  scrollIndicatorUp.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

window.addEventListener('scroll', updateScrollIndicator, { passive: true });



/* ============================================
   8. PHOTO CAROUSEL
   ============================================ */
function isMobileLayout() {
  return window.innerWidth <= 768;
}

function positionCarousel() {
  const wrapper = document.getElementById('carousel-wrapper');
  const themeToggle = document.getElementById('themeToggle');
  const contactBar = document.getElementById('contact-bar');
  if (!wrapper || !themeToggle || !contactBar) return;
  if (isMobileLayout()) {
    const homeSection = document.getElementById('home');
    const isHomeActive = homeSection && homeSection.classList.contains('active');
    if (!isHomeActive) { wrapper.style.display = 'none'; return; }
    const homeIntro = document.querySelector('.home-intro');
    if (!homeIntro) return;
    const introRect = homeIntro.getBoundingClientRect();
    const fontSize = parseFloat(getComputedStyle(homeIntro).fontSize);
    const oneLineHeight = fontSize * 1.6;
    const maxIntroBottom = introRect.top + Math.min(introRect.height, window.innerHeight * 0.5 + oneLineHeight);
    const topPos = maxIntroBottom + (oneLineHeight * 0.55);
    const bottomInset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing')) || 24;
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
    const toggleRect = themeToggle.getBoundingClientRect();
    const contactRect = contactBar.getBoundingClientRect();
    const margin = 24;
    const top = toggleRect.bottom + margin;
    const bottom = contactRect.top;
    const height = bottom - top;
    wrapper.style.top = top + 'px';
    wrapper.style.height = Math.max(height, 100) + 'px';
  }
}

function loadPhotoCarousel() {
  const carousel = document.getElementById('photo-carousel');
  if (!carousel || loadedGalleryImages.length === 0) return;
  const track = document.createElement('div');
  track.className = 'photo-carousel-track';
  loadedGalleryImages.forEach(img => {
    const imgEl = document.createElement('img');
    imgEl.src = img.blobUrl || img.url;
    imgEl.alt = img.title || 'Gallery photo';
    imgEl.className = 'carousel-img-loaded';
    track.appendChild(imgEl);
  });
  carouselSkeletonQueue = [];
  if (preloadedGalleryData) {
    const remainingCount = preloadedGalleryData.images.length - loadedGalleryImages.length;
    for (let i = 0; i < remainingCount; i++) {
      const skeleton = document.createElement('div');
      skeleton.className = 'carousel-skeleton';
      track.appendChild(skeleton);
      carouselSkeletonQueue.push(skeleton);
    }
  }
  carousel.innerHTML = '';
  carousel.appendChild(track);
  requestAnimationFrame(() => initCarouselScroll(track));
}

function initCarouselScroll(track) {
  const carousel = track.parentElement;
  if (!carousel) return;
  let lastTimestamp = 0;
  let isPaused = false;
  let scrollPosition = carousel.scrollLeft;
  let resumeTimer = null;
  const speed = 20;

  function pauseTemporarily(duration = 1400) {
    isPaused = true;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      scrollPosition = carousel.scrollLeft;
      isPaused = false;
      lastTimestamp = 0;
    }, duration);
  }

  function tick(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaMs = Math.min(timestamp - lastTimestamp, 100);
    lastTimestamp = timestamp;
    if (!isPaused && speed > 0) {
      scrollPosition += speed * (deltaMs / 1000);
      carousel.scrollLeft = scrollPosition;
      const first = track.firstElementChild;
      if (first) {
        const firstWidth = first.offsetWidth + 8;
        if (firstWidth > 0 && scrollPosition >= firstWidth) {
          track.appendChild(first);
          scrollPosition -= firstWidth;
          carousel.scrollLeft = scrollPosition;
        }
      }
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  carousel.addEventListener('pointerdown', () => {
    carousel.classList.add('is-dragging');
    scrollPosition = carousel.scrollLeft;
    pauseTemporarily(2500);
  });
  carousel.addEventListener('pointerup', () => {
    carousel.classList.remove('is-dragging');
    pauseTemporarily();
  });
  carousel.addEventListener('pointercancel', () => {
    carousel.classList.remove('is-dragging');
    pauseTemporarily();
  });
  carousel.addEventListener('wheel', () => {
    scrollPosition = carousel.scrollLeft;
    pauseTemporarily();
  }, { passive: true });
}



/* ============================================
   9. WINDOW RESIZE HANDLER
   ============================================ */
let lastColCount = getColumnCount();
let resizeTimer = null;

window.addEventListener('resize', () => {
  document.body.classList.add('is-resizing');
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    document.body.classList.remove('is-resizing');
  }, 150);

  if (window.innerWidth > 768 && sidebar.classList.contains('menu-open')) {
    sidebar.classList.remove('menu-open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-label', 'Open menu');
    document.removeEventListener('keydown', handleMenuFocusTrap);
  }
  updateScrollIndicator();
  positionCarousel();
  const newColCount = getColumnCount();
  if (newColCount !== lastColCount) {
    lastColCount = newColCount;
    buildGalleryGrid();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    positionCarousel();
  }
});



/* ============================================
   10. THEME TOGGLE
   ============================================ */
function applyThemeToggle() {
  const isDark = document.body.classList.toggle('dark-mode');
  document.documentElement.classList.toggle('dark-mode', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleTheme() {
  if (document.startViewTransition) {
    document.startViewTransition(applyThemeToggle);
  } else {
    applyThemeToggle();
  }
}

if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark-mode');
  document.documentElement.classList.add('dark-mode');
}

const themeToggle = document.getElementById('themeToggle');
const themeToggleMobile = document.getElementById('themeToggleMobile');
themeToggle.addEventListener('click', toggleTheme);
if (themeToggleMobile) themeToggleMobile.addEventListener('click', toggleTheme);



/* ============================================
   11. CURSOR FOLLOWER
   ============================================ */
const cursorFollower = document.getElementById('cursorFollower');
const isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.matchMedia('(hover: none)').matches;

var badgeRectsDirty = true;

if (!isTouchDevice) {
  var mouseX = 0;
  var mouseY = 0;
  var followerX = 0;
  var followerY = 0;
  var badgeElements = [];
  var activeBadge = null;

  var MAGNETIC_RADIUS = 20;
  var EASE_DEFAULT = 0.15;
  var EASE_ATTRACT = 0.12;
  var BASE_SIZE = 12;
  var SHAPE_EASE_IN = 0.07;
  var SHAPE_EASE_OUT = 0.15;

  // Lerped shape state for fluid morph
  var currentScaleX = 1;
  var currentScaleY = 1;
  var currentBorderRadius = 6; // px (6 = circle for 12px element)

  function distToRect(px, py, r) {
    var dx = Math.max(r.left - px, 0, px - r.right);
    var dy = Math.max(r.top - py, 0, py - r.bottom);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function cacheBadgeElements() {
    var badges = document.querySelectorAll('.stat-badge, .role-badge');
    badgeElements = [];
    badges.forEach(function(badge) {
      var section = badge.closest('section');
      if (section && !section.classList.contains('active')) return;
      badgeElements.push(badge);
    });
    badgeRectsDirty = false;
  }

  document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function animateFollower() {
    if (badgeRectsDirty) cacheBadgeElements();

    // Find closest badge (fresh rects every frame — no stale positions)
    var closestDist = MAGNETIC_RADIUS;
    var closestRect = null;
    var closestEl = null;
    for (var i = 0; i < badgeElements.length; i++) {
      var rect = badgeElements[i].getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var d = distToRect(mouseX, mouseY, rect);
      if (d < closestDist) {
        closestDist = d;
        closestRect = rect;
        closestEl = badgeElements[i];
      }
    }

    // Compute magnetic pull
    var targetX = mouseX;
    var targetY = mouseY;
    var strength = 0;
    var targetScaleX = 1;
    var targetScaleY = 1;
    var targetRadius = 6; // px (6 = circle)

    if (closestRect) {
      strength = 1 - closestDist / MAGNETIC_RADIUS;
      strength = strength * strength; // quadratic ease-in
      var cx = closestRect.left + closestRect.width / 2;
      var cy = closestRect.top + closestRect.height / 2;
      targetX = mouseX + (cx - mouseX) * strength;
      targetY = mouseY + (cy - mouseY) * strength;

      // Target: fill inside the badge
      targetScaleX = 1 + (closestRect.width / BASE_SIZE - 1) * strength;
      targetScaleY = 1 + (closestRect.height / BASE_SIZE - 1) * strength;
      // Lerp toward 2px border-radius (matches badge border-radius)
      targetRadius = 6 + (2 - 6) * strength;
    }

    // Lerp position
    var ease = closestRect ? EASE_ATTRACT : EASE_DEFAULT;
    followerX += (targetX - followerX) * ease;
    followerY += (targetY - followerY) * ease;

    // Lerp shape — slow approach, fast retreat
    var shapeEase = closestRect ? SHAPE_EASE_IN : SHAPE_EASE_OUT;
    currentScaleX += (targetScaleX - currentScaleX) * shapeEase;
    currentScaleY += (targetScaleY - currentScaleY) * shapeEase;
    currentBorderRadius += (targetRadius - currentBorderRadius) * shapeEase;

    // Position (same as original — left/top)
    cursorFollower.style.left = followerX + 'px';
    cursorFollower.style.top = followerY + 'px';

    // Track proximity separately from visual morph
    var wasBadge = !!activeBadge;
    activeBadge = closestEl || null;

    // Re-apply hover when leaving badge but still over a link
    if (wasBadge && !activeBadge && isOverInteractive) {
      cursorFollower.classList.add('hovering');
    }

    // Shape: only apply transform/borderRadius when morphing
    var isBlob = Math.abs(currentScaleX - 1) > 0.01 || Math.abs(currentScaleY - 1) > 0.01;

    if (isBlob && closestRect) {
      // Near a badge: morph and suppress link hover
      cursorFollower.classList.remove('hovering');
      cursorFollower.style.transform =
        'translate(-50%, -50%) scale(' + currentScaleX.toFixed(3) + ',' + currentScaleY.toFixed(3) + ')';
      cursorFollower.style.borderRadius = currentBorderRadius.toFixed(1) + 'px';
    } else if (isBlob && cursorFollower.classList.contains('hovering')) {
      // Left badge, on a link: snap morph to default so CSS hover works
      currentScaleX = 1;
      currentScaleY = 1;
      currentBorderRadius = 6;
      cursorFollower.style.transform = '';
      cursorFollower.style.borderRadius = '';
    } else if (isBlob) {
      // Left badge, empty space: smooth retreat animation
      cursorFollower.style.transform =
        'translate(-50%, -50%) scale(' + currentScaleX.toFixed(3) + ',' + currentScaleY.toFixed(3) + ')';
      cursorFollower.style.borderRadius = currentBorderRadius.toFixed(1) + 'px';
    } else {
      // Not morphing: clean default
      currentScaleX = 1;
      currentScaleY = 1;
      currentBorderRadius = 6;
      cursorFollower.style.transform = '';
      cursorFollower.style.borderRadius = '';
    }

    requestAnimationFrame(animateFollower);
  }

  animateFollower();

  // Link hover — original behaviour (CSS width/height transition)
  var isOverInteractive = false;
  var interactiveElements = document.querySelectorAll('a, button, .theme-toggle');
  interactiveElements.forEach(function(el) {
    el.addEventListener('mouseenter', function() {
      isOverInteractive = true;
      if (!activeBadge) cursorFollower.classList.add('hovering');
    });
    el.addEventListener('mouseleave', function() {
      isOverInteractive = false;
      cursorFollower.classList.remove('hovering');
    });
  });

  // Invalidate badge element cache on scroll and resize
  sections.forEach(function(s) {
    s.addEventListener('scroll', function() { badgeRectsDirty = true; }, { passive: true });
  });
  window.addEventListener('scroll', function() { badgeRectsDirty = true; }, { passive: true });
  window.addEventListener('resize', function() { badgeRectsDirty = true; }, { passive: true });
}



/* ============================================
   12. LIGHTBOX / IMAGE VIEWER
   ============================================ */
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxTapPrev = document.getElementById('lightbox-tap-prev');
const lightboxTapNext = document.getElementById('lightbox-tap-next');
const lightboxPauseZone = document.getElementById('lightbox-pause-zone');
const lightboxHintOverlay = document.getElementById('lightbox-hint-overlay');
const lightboxCounter = document.getElementById('lightbox-counter');
const lightboxStoryProgress = document.getElementById('lightbox-story-progress');
const STORY_DURATION = 5000;
let currentImageIndex = 0;
let storyTimer = null;
let storyStartedAt = 0;
let storyRemaining = STORY_DURATION;
let storyPaused = false;

function openLightbox(index) {
  if (loadedGalleryImages.length === 0) return;
  currentImageIndex = index;
  updateLightboxImage();
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
  startStoryTimer();
  showTapHint();
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
  stopStoryTimer();
  storyPaused = false;
}

function updateLightboxImage() {
  const img = loadedGalleryImages[currentImageIndex];
  lightboxImg.src = img.blobUrl || img.url;
  lightboxImg.alt = img.title || 'Gallery photo';
  const counterText = `${currentImageIndex + 1} / ${loadedGalleryImages.length}`;
  lightboxCounter.textContent = counterText;
}

function stopStoryTimer() {
  if (storyTimer) {
    clearTimeout(storyTimer);
    storyTimer = null;
  }
  if (lightboxStoryProgress) {
    lightboxStoryProgress.classList.remove('is-running');
  }
}

function startStoryTimer(duration = STORY_DURATION) {
  stopStoryTimer();
  if (!lightboxStoryProgress || !lightbox.classList.contains('active')) return;
  storyRemaining = duration;
  storyStartedAt = performance.now();
  storyPaused = false;
  lightboxStoryProgress.style.animation = 'none';
  lightboxStoryProgress.offsetHeight;
  lightboxStoryProgress.style.animation = `story-progress ${duration}ms linear forwards`;
  lightboxStoryProgress.classList.add('is-running');
  storyTimer = setTimeout(showNextImage, duration);
}

function pauseStoryTimer() {
  if (storyPaused || !lightboxStoryProgress || !lightbox.classList.contains('active')) return;
  if (storyTimer) {
    clearTimeout(storyTimer);
    storyTimer = null;
  }
  storyRemaining = Math.max(250, storyRemaining - (performance.now() - storyStartedAt));
  const computedWidth = getComputedStyle(lightboxStoryProgress).width;
  lightboxStoryProgress.classList.remove('is-running');
  lightboxStoryProgress.style.animation = 'none';
  lightboxStoryProgress.style.width = computedWidth;
  lightboxStoryProgress.style.transform = 'none';
  storyPaused = true;
}

function resumeStoryTimer() {
  if (!storyPaused) return;
  if (lightboxStoryProgress) {
    lightboxStoryProgress.style.width = '';
    lightboxStoryProgress.style.animation = '';
    lightboxStoryProgress.style.transform = '';
  }
  startStoryTimer(storyRemaining);
}

function pulseTapZone(zone) {
  if (!zone) return;
  zone.classList.add('is-tapped');
  setTimeout(() => zone.classList.remove('is-tapped'), 180);
}

function showTapHint() {
  if (!lightboxHintOverlay) return;
  lightboxHintOverlay.classList.remove('is-visible');
  lightboxHintOverlay.offsetHeight;
  lightboxHintOverlay.classList.add('is-visible');
  setTimeout(() => lightboxHintOverlay.classList.remove('is-visible'), 3000);
}

function showPrevImage() {
  currentImageIndex = (currentImageIndex - 1 + loadedGalleryImages.length) % loadedGalleryImages.length;
  updateLightboxImage();
  startStoryTimer();
}

function showNextImage() {
  currentImageIndex = (currentImageIndex + 1) % loadedGalleryImages.length;
  updateLightboxImage();
  startStoryTimer();
}

lightboxClose.addEventListener('click', closeLightbox);

lightboxTapPrev.addEventListener('click', () => {
  pulseTapZone(lightboxTapPrev);
  showPrevImage();
});

lightboxTapNext.addEventListener('click', () => {
  pulseTapZone(lightboxTapNext);
  showNextImage();
});

lightboxPauseZone.addEventListener('click', () => {
  if (storyPaused) {
    resumeStoryTimer();
    lightboxPauseZone.classList.remove('is-tapped');
  } else {
    pauseStoryTimer();
    lightboxPauseZone.classList.add('is-tapped');
  }
});

document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') {
    closeLightbox();
  } else if (e.key === 'ArrowLeft') {
    showPrevImage();
  } else if (e.key === 'ArrowRight') {
    showNextImage();
  }
});

/* ============================================
   13. GITHUB STATS
   ============================================ */
function fetchGitHubStats() {
  const els = document.querySelectorAll('[data-repo]');
  if (!els.length) return;

  const STAR_PATH = 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z';
  const FORK_PATH = 'M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878Zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm3-8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z';

  function renderStats(el, stars, forks) {
    el.innerHTML =
      '<span class="stat-badge"><svg viewBox="0 0 16 16" fill="currentColor"><path d="' + STAR_PATH + '"/></svg> ' + stars + '</span>' +
      '<span class="stat-badge"><svg viewBox="0 0 16 16" fill="currentColor"><path d="' + FORK_PATH + '"/></svg> ' + forks + '</span>';
    if (typeof badgeRectsDirty !== 'undefined') badgeRectsDirty = true;
  }

  els.forEach(function(el) {
    var repo = el.getAttribute('data-repo');
    var cacheKey = 'gh-stats-' + repo;
    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey));
    } catch(e) {}

    var isFresh = cached && (Date.now() - cached.ts < 3600000);

    if (isFresh) {
      renderStats(el, cached.stars, cached.forks);
      return;
    }

    if (cached) {
      renderStats(el, cached.stars, cached.forks);
    }

    fetch('https://api.github.com/repos/' + repo)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (typeof data.stargazers_count === 'number') {
          var stars = data.stargazers_count;
          var forks = data.forks_count;
          localStorage.setItem(cacheKey, JSON.stringify({ stars: stars, forks: forks, ts: Date.now() }));
          renderStats(el, stars, forks);
        }
      })
      .catch(function() {});
  });
}


/* ============================================
   14. BOOT
   ============================================ */
createRoundedFavicon();
initLoadingSequence();
