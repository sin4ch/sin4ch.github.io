/* ============================================
   GALLERY MODULE
   ============================================ */
(function() {
  const MINIMUM_LOADER_MS = 700;
  const SOFT_LOADER_MS = 2500;
  const HARD_LOADER_MS = 4000;
  const STORY_DURATION = 5000;
  const CAROUSEL_SPEED = 48;

  let galleryData = null;
  let galleryImages = [];
  let carouselImages = [];
  let galleryColumns = [];
  let columnHeights = [];
  let galleryElements = [];
  let carouselSlides = new Map();
  let carouselAnimationFrame = null;
  let carouselObserver = null;
  let galleryObserver = null;
  let loadingAnimationObserver = null;
  let galleryLoadTarget = -1;
  let galleryNextRequest = 0;
  let galleryNextReveal = 0;
  let galleryActiveLoads = 0;
  let galleryResults = new Map();
  let galleryRevealed = new Set();
  let lastCarouselWarmAt = 0;
  let fastWarmScheduled = false;
  let fastConnectionConfirmed = false;

  const imageRequests = new Map();
  const recentImageDurations = [];
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxPreview = document.getElementById('lightbox-preview');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxTapPrev = document.getElementById('lightbox-tap-prev');
  const lightboxTapNext = document.getElementById('lightbox-tap-next');
  const lightboxPauseZone = document.getElementById('lightbox-pause-zone');
  const lightboxHintOverlay = document.getElementById('lightbox-hint-overlay');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxStoryProgress = document.getElementById('lightbox-story-progress');

  let currentImageIndex = 0;
  let lightboxRequestToken = 0;
  let storyTimer = null;
  let storyStartedAt = 0;
  let storyRemaining = STORY_DURATION;
  let storyPaused = false;
  let lightboxScrollY = 0;
  let lightboxTrigger = null;
  let backgroundStates = [];

  function getConnectionProfile() {
    const measuredDownlink = Number(connection?.downlink) || 0;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '') || (measuredDownlink > 0 && measuredDownlink < 1.5)) {
      return 'slow';
    }

    const latestDuration = recentImageDurations.at(-1) || Infinity;
    const recentPair = recentImageDurations.slice(-2);
    const recentPairAverage = recentPair.length === 2
      ? recentPair.reduce((sum, duration) => sum + duration, 0) / recentPair.length
      : Infinity;
    const measuredFast = latestDuration < 350 || recentPairAverage < 800;
    const reportedFast = connection?.effectiveType === '4g' && (!measuredDownlink || measuredDownlink >= 8);
    if (measuredFast || reportedFast) fastConnectionConfirmed = true;

    return fastConnectionConfirmed ? 'fast' : 'standard';
  }

  function getGalleryConcurrency() {
    const profile = getConnectionProfile();
    if (profile === 'fast') return galleryImages.length;
    if (profile === 'slow') return 4;
    return 8;
  }

  function shuffle(images) {
    const result = [...images];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  async function loadGalleryData() {
    if (galleryData) return galleryData;
    try {
      const response = await fetch('/gallery/gallery.json?v=2');
      if (!response.ok) throw new Error('Gallery manifest request failed');
      const data = await response.json();
      if (data.images && data.images.length > 0) {
        galleryData = data;
        galleryImages = shuffle(data.images);
        carouselImages = shuffle(data.images);
      }
    } catch (error) {
      galleryData = { images: [] };
      galleryImages = [];
      carouselImages = [];
    }
    return galleryData;
  }

  function requestImage(imageData, priority = 'auto') {
    const existing = imageRequests.get(imageData.id);
    if (existing?.status === 'loaded') return Promise.resolve(existing);
    if (existing?.status === 'loading') {
      if (priority === 'high') existing.loader.fetchPriority = 'high';
      return existing.promise;
    }

    const loader = new Image();
    const startedAt = performance.now();
    const state = { status: 'loading', loader, startedAt, promise: null };
    loader.decoding = 'async';
    loader.fetchPriority = priority;

    state.promise = new Promise((resolve, reject) => {
      loader.addEventListener('load', async () => {
        try {
          if (loader.decode) await loader.decode();
        } catch (error) {}
        state.status = 'loaded';
        state.duration = performance.now() - startedAt;
        recentImageDurations.push(state.duration);
        if (recentImageDurations.length > 8) recentImageDurations.shift();
        maybeWarmEverything();
        resolve(state);
      }, { once: true });
      loader.addEventListener('error', () => {
        state.status = 'error';
        reject(new Error(`Could not load ${imageData.url}`));
      }, { once: true });
      loader.src = imageData.url;
    });

    imageRequests.set(imageData.id, state);
    return state.promise;
  }

  function setImageDimensions(imgEl, imageData) {
    if (!imageData.width || !imageData.height) return;
    imgEl.width = imageData.width;
    imgEl.height = imageData.height;
  }

  function createImageLayers(imageData, context) {
    const preview = document.createElement('img');
    preview.className = 'progressive-image-preview';
    preview.src = imageData.preview || '';
    preview.alt = '';
    preview.setAttribute('aria-hidden', 'true');
    preview.decoding = 'async';
    setImageDimensions(preview, imageData);

    const original = document.createElement('img');
    original.className = 'progressive-image-original';
    original.alt = context === 'carousel' ? '' : (imageData.title || 'Gallery photo');
    original.decoding = 'async';
    setImageDimensions(original, imageData);

    return { preview, original };
  }

  function observeLoadingAnimation(container) {
    if (!('IntersectionObserver' in window)) {
      container.classList.add('is-loading-visible');
      return;
    }
    if (!loadingAnimationObserver) {
      loadingAnimationObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-loading-visible', entry.isIntersecting);
        });
      }, { rootMargin: '100px', threshold: 0.01 });
    }
    loadingAnimationObserver.observe(container);
  }

  function stopLoadingAnimation(container) {
    container.classList.remove('is-loading-visible');
    loadingAnimationObserver?.unobserve(container);
  }

  async function revealOriginal(container, original, preview, imageData, priority = 'auto') {
    if (container.classList.contains('is-sharp')) return true;
    try {
      await requestImage(imageData, priority);
      if (!original.src) original.src = imageData.url;
      if (priority === 'high') original.fetchPriority = 'high';
      try {
        if (original.decode) await original.decode();
      } catch (error) {}
      container.classList.add('is-sharp');
      stopLoadingAnimation(container);
      window.setTimeout(() => {
        if (container.classList.contains('is-sharp')) preview.removeAttribute('src');
      }, 100);
      return true;
    } catch (error) {
      container.classList.add('image-load-failed');
      stopLoadingAnimation(container);
      return false;
    }
  }

  function getColumnCount() {
    const width = window.innerWidth;
    if (width <= 480) return 1;
    if (width <= 768) return 2;
    if (width <= 1024) return 3;
    return 4;
  }

  function getRenderedImageHeight(imageData) {
    if (!imageData.width || !imageData.height || galleryColumns.length === 0) return 200;
    const columnWidth = galleryColumns[0].offsetWidth || 200;
    return (imageData.height / imageData.width) * columnWidth;
  }

  function getShortestColumnIndex() {
    return columnHeights.indexOf(Math.min(...columnHeights));
  }

  function placeInShortestColumn(element, height) {
    const index = getShortestColumnIndex();
    galleryColumns[index].appendChild(element);
    columnHeights[index] += height + 6;
  }

  function createGalleryItem(imageData, index) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'gallery-item progressive-image';
    item.dataset.galleryIndex = String(index);
    item.dataset.imageId = imageData.id;
    item.setAttribute('aria-label', `Open ${imageData.title || 'gallery photo'}`);
    item.style.aspectRatio = `${imageData.width} / ${imageData.height}`;

    const { preview, original } = createImageLayers(imageData, 'gallery');
    item.append(preview, original);
    observeLoadingAnimation(item);
    item.addEventListener('click', () => openLightbox(index));
    galleryElements[index] = { item, preview, original, imageData };
    return item;
  }

  function buildGalleryGrid() {
    const galleryGrid = document.getElementById('gallery-grid');
    if (!galleryGrid || !galleryImages.length) return;

    galleryObserver?.disconnect();
    galleryGrid.innerHTML = '';
    galleryColumns = [];
    columnHeights = [];
    galleryElements = [];

    const columnCount = getColumnCount();
    for (let i = 0; i < columnCount; i++) {
      const column = document.createElement('div');
      column.className = 'gallery-column';
      galleryGrid.appendChild(column);
      galleryColumns.push(column);
      columnHeights.push(0);
    }

    galleryImages.forEach((imageData, index) => {
      const item = createGalleryItem(imageData, index);
      placeInShortestColumn(item, getRenderedImageHeight(imageData));
      if (galleryRevealed.has(index)) {
        if (imageRequests.get(imageData.id)?.status === 'loaded') {
          revealOriginal(item, galleryElements[index].original, galleryElements[index].preview, imageData);
        } else {
          item.classList.add('image-load-failed');
          stopLoadingAnimation(item);
        }
      }
    });

    initGalleryObserver();
  }

  function initGalleryObserver() {
    galleryObserver?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const profile = getConnectionProfile();
    const margin = profile === 'slow' ? '180px' : profile === 'fast' ? '1600px' : '700px';
    galleryObserver = new IntersectionObserver((entries) => {
      let furthestIndex = -1;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        furthestIndex = Math.max(furthestIndex, Number(entry.target.dataset.galleryIndex));
      });
      if (furthestIndex >= 0) queueGalleryThrough(furthestIndex);
    }, { rootMargin: `${margin} 0px`, threshold: 0.01 });
    galleryElements.forEach(({ item }) => galleryObserver.observe(item));
  }

  function queueGalleryThrough(index) {
    galleryLoadTarget = Math.max(galleryLoadTarget, Math.min(index, galleryImages.length - 1));
    pumpGalleryQueue();
  }

  function pumpGalleryQueue() {
    const concurrency = getGalleryConcurrency();
    while (galleryActiveLoads < concurrency && galleryNextRequest <= galleryLoadTarget) {
      const index = galleryNextRequest++;
      const imageData = galleryImages[index];
      galleryActiveLoads++;
      requestImage(imageData, index < getColumnCount() ? 'high' : 'auto')
        .then(() => galleryResults.set(index, true))
        .catch(() => galleryResults.set(index, false))
        .finally(() => {
          galleryActiveLoads--;
          flushGalleryResults();
          pumpGalleryQueue();
        });
    }
  }

  function flushGalleryResults() {
    if (getConnectionProfile() === 'fast') {
      flushFastGalleryResults();
      return;
    }

    while (galleryNextReveal < galleryImages.length) {
      if (galleryRevealed.has(galleryNextReveal)) {
        galleryNextReveal++;
        continue;
      }
      if (!galleryResults.has(galleryNextReveal)) break;
      revealGalleryResult(galleryNextReveal++);
    }
  }

  function flushFastGalleryResults() {
    let previousStart = -1;
    const revealWindow = Math.max(8, getColumnCount() * 2);

    while (previousStart !== galleryNextReveal) {
      previousStart = galleryNextReveal;
      const revealLimit = Math.min(galleryNextReveal + revealWindow, galleryImages.length);
      for (let index = galleryNextReveal; index < revealLimit; index++) {
        if (galleryResults.has(index)) revealGalleryResult(index);
      }
      while (galleryRevealed.has(galleryNextReveal)) galleryNextReveal++;
    }
  }

  function revealGalleryResult(index) {
    const succeeded = galleryResults.get(index);
    galleryResults.delete(index);
    galleryRevealed.add(index);
    const entry = galleryElements[index];
    if (!entry) return;
    if (succeeded) revealOriginal(entry.item, entry.original, entry.preview, entry.imageData);
    else {
      entry.item.classList.add('image-load-failed');
      stopLoadingAnimation(entry.item);
    }
  }

  function createCarouselSlide(imageData) {
    const slide = document.createElement('div');
    slide.className = 'photo-carousel-slide progressive-image';
    slide.dataset.imageId = imageData.id;
    slide.style.aspectRatio = `${imageData.width} / ${imageData.height}`;
    slide.setAttribute('aria-label', imageData.title || 'Gallery photo');

    const { preview, original } = createImageLayers(imageData, 'carousel');
    slide.append(preview, original);
    observeLoadingAnimation(slide);
    carouselSlides.set(imageData.id, { slide, preview, original, imageData });
    return slide;
  }

  function buildCarouselTrack() {
    const carousel = document.getElementById('photo-carousel');
    if (!carousel || !carouselImages.length) return null;

    carouselObserver?.disconnect();
    carouselSlides = new Map();
    const track = document.createElement('div');
    track.className = 'photo-carousel-track';
    carouselImages.forEach((imageData) => track.appendChild(createCarouselSlide(imageData)));
    carousel.replaceChildren(track);
    initCarouselObserver(carousel);
    return track;
  }

  function initCarouselObserver(carousel) {
    if (!('IntersectionObserver' in window)) return;
    const profile = getConnectionProfile();
    const marginPercent = profile === 'slow' ? 75 : profile === 'fast' ? 600 : 200;
    carouselObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const imageData = carouselSlides.get(entry.target.dataset.imageId)?.imageData;
        if (imageData) revealCarouselImage(imageData);
      });
    }, {
      root: carousel,
      rootMargin: `0px ${marginPercent}%`,
      threshold: 0.01
    });
    carouselSlides.forEach(({ slide }) => carouselObserver.observe(slide));
  }

  function revealCarouselImage(imageData, priority = 'auto') {
    const entry = carouselSlides.get(imageData.id);
    if (!entry) return Promise.resolve(false);
    return revealOriginal(entry.slide, entry.original, entry.preview, imageData, priority);
  }

  function getInitialCarouselImages() {
    const carousel = document.getElementById('photo-carousel');
    const targetWidth = carousel?.clientWidth || window.innerWidth;
    const estimatedHeight = 200;
    const result = [];
    let coveredWidth = 0;
    for (const imageData of carouselImages) {
      result.push(imageData);
      coveredWidth += (imageData.width / imageData.height) * estimatedHeight + 8;
      if (coveredWidth >= targetWidth && result.length >= 2) break;
    }
    return result;
  }

  async function preloadInitialImages(progress) {
    const startedAt = performance.now();
    await loadGalleryData();
    progress.report('manifest');
    if (!galleryImages.length) {
      progress.report('previews');
      progress.report('carousel');
      await waitUntil(startedAt + MINIMUM_LOADER_MS);
      return;
    }

    buildGalleryGrid();
    buildCarouselTrack();
    progress.report('previews');

    const criticalImages = getInitialCarouselImages();
    const totalBytes = criticalImages.reduce((sum, image) => sum + (image.fileSize || 1), 0);
    const targetWidth = document.getElementById('photo-carousel')?.clientWidth || window.innerWidth;
    let completedBytes = 0;
    let sharpCount = 0;
    let sharpCoverage = 0;
    let finished = false;

    await new Promise((resolve) => {
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      const checkReadiness = () => {
        const elapsed = performance.now() - startedAt;
        const hasFullCoverage = sharpCoverage >= targetWidth;
        const passedSoftLimit = elapsed >= SOFT_LOADER_MS && sharpCount >= 1;
        const passedHardLimit = elapsed >= HARD_LOADER_MS;
        if (elapsed >= MINIMUM_LOADER_MS && (hasFullCoverage || passedSoftLimit || passedHardLimit)) finish();
      };

      const scheduleFromStart = (deadline, callback) => {
        const elapsed = performance.now() - startedAt;
        window.setTimeout(callback, Math.max(0, deadline - elapsed));
      };

      scheduleFromStart(MINIMUM_LOADER_MS, checkReadiness);
      scheduleFromStart(SOFT_LOADER_MS, checkReadiness);
      scheduleFromStart(HARD_LOADER_MS, finish);

      criticalImages.forEach((imageData) => {
        requestImage(imageData, 'high')
          .then(() => revealCarouselImage(imageData, 'high'))
          .then((succeeded) => {
            if (succeeded) {
              sharpCount++;
              sharpCoverage += (imageData.width / imageData.height) * 200 + 8;
            }
          })
          .catch(() => {})
          .finally(() => {
            completedBytes += imageData.fileSize || 1;
            const fraction = totalBytes ? completedBytes / totalBytes : 1;
            progress.report('carousel', fraction);
            checkReadiness();
          });
      });
    });
    progress.report('carousel');
  }

  function waitUntil(timestamp) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, timestamp - performance.now())));
  }

  function loadRemainingImages() {
    if (!galleryImages.length) return;
    const profile = getConnectionProfile();
    const initialGalleryCount = profile === 'slow' ? 4 : profile === 'fast' ? galleryImages.length : 12;
    if (profile === 'fast') {
      warmEverything();
      return;
    }
    queueGalleryThrough(initialGalleryCount - 1);
    warmCarouselViewport();
  }

  function maybeWarmEverything() {
    if (fastWarmScheduled || !galleryImages.length || getConnectionProfile() !== 'fast') return;
    warmEverything();
  }

  function warmEverything() {
    if (fastWarmScheduled) return;
    fastWarmScheduled = true;
    queueGalleryThrough(galleryImages.length - 1);
    carouselImages.forEach((imageData) => revealCarouselImage(imageData, 'low'));
  }

  function warmCarouselViewport() {
    const carousel = document.getElementById('photo-carousel');
    if (!carousel) return;
    const profile = getConnectionProfile();
    const buffer = carousel.clientWidth * (profile === 'slow' ? 0.75 : 2);
    const carouselRect = carousel.getBoundingClientRect();
    carouselSlides.forEach((entry) => {
      const rect = entry.slide.getBoundingClientRect();
      if (rect.right >= carouselRect.left - buffer && rect.left <= carouselRect.right + buffer) {
        revealCarouselImage(entry.imageData);
      }
    });
  }

  function loadPhotoCarousel() {
    const carousel = document.getElementById('photo-carousel');
    let track = carousel?.querySelector('.photo-carousel-track');
    if (!track) track = buildCarouselTrack();
    if (track) requestAnimationFrame(() => initCarouselScroll(track));
  }

  function initCarouselScroll(track) {
    const carousel = track.parentElement;
    if (!carousel) return;
    if (carouselAnimationFrame) cancelAnimationFrame(carouselAnimationFrame);
    let lastTimestamp = 0;
    let scrollPosition = carousel.scrollLeft;
    let isTouchScrolling = false;
    let touchResumeTimer = null;

    function getSlideWidth(slide) {
      return slide ? slide.offsetWidth + 8 : 0;
    }
    function prependLastSlide() {
      const last = track.lastElementChild;
      const first = track.firstElementChild;
      if (!last || !first || last === first) return;
      const lastWidth = getSlideWidth(last);
      if (lastWidth <= 0) return;
      track.insertBefore(last, first);
      scrollPosition += lastWidth;
      carousel.scrollLeft = scrollPosition;
    }
    function addBackwardScrollBuffer(count = 3) {
      let addedWidth = 0;
      for (let i = 0; i < count; i++) {
        const last = track.lastElementChild;
        const first = track.firstElementChild;
        if (!last || !first || last === first) break;
        const lastWidth = getSlideWidth(last);
        if (lastWidth <= 0) break;
        track.insertBefore(last, first);
        addedWidth += lastWidth;
      }
      if (addedWidth > 0) {
        scrollPosition += addedWidth;
        carousel.scrollLeft = scrollPosition;
      }
    }
    function wrapForwardIfNeeded() {
      const first = track.firstElementChild;
      if (!first) return;
      const firstWidth = getSlideWidth(first);
      if (firstWidth > 0 && scrollPosition >= firstWidth) {
        track.appendChild(first);
        scrollPosition -= firstWidth;
        carousel.scrollLeft = scrollPosition;
      }
    }
    function tick(timestamp) {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const deltaMs = Math.min(timestamp - lastTimestamp, 100);
      lastTimestamp = timestamp;
      if (!document.hidden && !reducedMotionQuery.matches && !isTouchScrolling) {
        scrollPosition += CAROUSEL_SPEED * (deltaMs / 1000);
        carousel.scrollLeft = scrollPosition;
        wrapForwardIfNeeded();
        if (timestamp - lastCarouselWarmAt > 500) {
          lastCarouselWarmAt = timestamp;
          warmCarouselViewport();
        }
      }
      carouselAnimationFrame = requestAnimationFrame(tick);
    }

    requestAnimationFrame(() => addBackwardScrollBuffer());
    carouselAnimationFrame = requestAnimationFrame(tick);
    carousel.addEventListener('touchstart', () => {
      isTouchScrolling = true;
      window.clearTimeout(touchResumeTimer);
      if (carousel.scrollLeft < 12) addBackwardScrollBuffer();
    }, { passive: true });
    function resumeAfterTouchScrollSettles() {
      window.clearTimeout(touchResumeTimer);
      touchResumeTimer = window.setTimeout(() => {
        scrollPosition = carousel.scrollLeft;
        isTouchScrolling = false;
        lastTimestamp = 0;
      }, 100);
    }
    carousel.addEventListener('touchend', resumeAfterTouchScrollSettles, { passive: true });
    carousel.addEventListener('touchcancel', resumeAfterTouchScrollSettles, { passive: true });
    carousel.addEventListener('wheel', (event) => {
      const horizontalDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (horizontalDelta < 0 && carousel.scrollLeft < 48) addBackwardScrollBuffer();
      scrollPosition = carousel.scrollLeft;
    }, { passive: true });
    carousel.addEventListener('scroll', () => {
      scrollPosition = carousel.scrollLeft;
      if (scrollPosition < 12) prependLastSlide();
      if (isTouchScrolling) resumeAfterTouchScrollSettles();
    }, { passive: true });
  }

  function onSectionChange(sectionId) {
    if (sectionId === 'gallery') {
      const profile = getConnectionProfile();
      queueGalleryThrough(profile === 'slow' ? 7 : profile === 'fast' ? galleryImages.length - 1 : 19);
    }
    if (sectionId === 'home') warmCarouselViewport();
  }

  function openLightbox(index) {
    if (!galleryImages.length) return;
    lightboxTrigger = document.activeElement;
    backgroundStates = [...document.body.children]
      .filter((element) => element !== lightbox && element.tagName !== 'SCRIPT')
      .map((element) => [element, element.inert]);
    backgroundStates.forEach(([element]) => { element.inert = true; });
    currentImageIndex = index;
    lightboxScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    lightbox.classList.add('active');
    lightbox.removeAttribute('aria-hidden');
    document.body.classList.add('lightbox-open');
    document.body.style.top = `-${lightboxScrollY}px`;
    lightboxClose.focus({ preventScroll: true });
    updateLightboxImage();
    showTapHint();
  }

  function closeLightbox() {
    if (!lightbox.classList.contains('active')) return;
    lightboxRequestToken++;
    lightbox.classList.remove('active');
    backgroundStates.forEach(([element, wasInert]) => { element.inert = wasInert; });
    backgroundStates = [];
    if (lightboxTrigger?.isConnected) lightboxTrigger.focus({ preventScroll: true });
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    document.body.style.top = '';
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo({ top: lightboxScrollY, behavior: 'auto' });
    requestAnimationFrame(() => { root.style.scrollBehavior = previousScrollBehavior; });
    stopStoryTimer();
    storyPaused = false;
  }

  async function updateLightboxImage() {
    const token = ++lightboxRequestToken;
    const imageData = galleryImages[currentImageIndex];
    stopStoryTimer();
    lightbox.classList.remove('is-sharp', 'image-load-failed');
    lightboxPreview.src = imageData.preview || '';
    setImageDimensions(lightboxPreview, imageData);
    lightboxImg.removeAttribute('src');
    lightboxImg.alt = imageData.title || 'Gallery photo';
    setImageDimensions(lightboxImg, imageData);
    lightboxCounter.textContent = `${currentImageIndex + 1} / ${galleryImages.length}`;
    const startedAt = performance.now();

    try {
      await requestImage(imageData, 'high');
      if (token !== lightboxRequestToken || !lightbox.classList.contains('active')) return;
      lightboxImg.fetchPriority = 'high';
      lightboxImg.src = imageData.url;
      try {
        if (lightboxImg.decode) await lightboxImg.decode();
      } catch (error) {}
      if (token !== lightboxRequestToken) return;
      lightbox.classList.add('is-sharp');
      recentImageDurations.push(performance.now() - startedAt);
      if (recentImageDurations.length > 8) recentImageDurations.shift();
      prefetchLightboxNeighbours();
      startStoryTimer();
    } catch (error) {
      if (token === lightboxRequestToken) lightbox.classList.add('image-load-failed');
    }
  }

  function getAverageImageDuration() {
    if (!recentImageDurations.length) return Infinity;
    return recentImageDurations.reduce((sum, duration) => sum + duration, 0) / recentImageDurations.length;
  }

  function prefetchLightboxNeighbours() {
    const profile = getConnectionProfile();
    if (profile === 'slow') {
      if (!connection?.saveData) prefetchLightboxOffset(1);
      return;
    }

    const averageDuration = getAverageImageDuration();
    const distance = profile === 'fast' && averageDuration < 300 ? 6 : profile === 'fast' ? 3 : 2;
    for (let offset = 1; offset <= distance; offset++) {
      prefetchLightboxOffset(offset);
      prefetchLightboxOffset(-offset);
    }
    if (profile === 'fast' && averageDuration < 300) {
      scheduleIdleWork(() => {
        galleryImages.forEach((imageData) => requestImage(imageData, 'low').catch(() => {}));
      });
    }
  }

  function prefetchLightboxOffset(offset) {
    const index = (currentImageIndex + offset + galleryImages.length) % galleryImages.length;
    requestImage(galleryImages[index], 'low').catch(() => {});
  }

  function scheduleIdleWork(callback) {
    if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 1200 });
    else window.setTimeout(callback, 200);
  }

  function stopStoryTimer() {
    if (storyTimer) {
      clearTimeout(storyTimer);
      storyTimer = null;
    }
    if (lightboxStoryProgress) {
      lightboxStoryProgress.classList.remove('is-running');
      lightboxStoryProgress.style.animation = 'none';
    }
  }

  function startStoryTimer(duration = STORY_DURATION) {
    stopStoryTimer();
    if (!lightboxStoryProgress || !lightbox.classList.contains('active')) return;
    storyRemaining = duration;
    storyStartedAt = performance.now();
    storyPaused = false;
    lightboxPauseZone.setAttribute('aria-pressed', 'false');
    lightboxPauseZone.disabled = reducedMotionQuery.matches;
    lightboxPauseZone.setAttribute('aria-label', reducedMotionQuery.matches
      ? 'Automatic slideshow is off for reduced motion'
      : 'Pause or play slideshow');
    if (reducedMotionQuery.matches) return;
    lightboxStoryProgress.style.animationPlayState = 'running';
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
    storyRemaining = Math.max(0, storyRemaining - (performance.now() - storyStartedAt));
    lightboxStoryProgress.style.animationPlayState = 'paused';
    lightboxPauseZone.setAttribute('aria-pressed', 'true');
    storyPaused = true;
  }

  function resumeStoryTimer() {
    if (!storyPaused) return;
    storyPaused = false;
    storyStartedAt = performance.now();
    lightboxStoryProgress.style.animationPlayState = 'running';
    lightboxPauseZone.setAttribute('aria-pressed', 'false');
    storyTimer = setTimeout(showNextImage, storyRemaining);
  }

  function showTapHint() {
    if (!lightboxHintOverlay) return;
    lightboxHintOverlay.classList.remove('is-visible');
    lightboxHintOverlay.offsetHeight;
    lightboxHintOverlay.classList.add('is-visible');
    setTimeout(() => lightboxHintOverlay.classList.remove('is-visible'), 3000);
  }

  function showPrevImage() {
    currentImageIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
    updateLightboxImage();
  }

  function showNextImage() {
    currentImageIndex = (currentImageIndex + 1) % galleryImages.length;
    updateLightboxImage();
  }

  function bindLightboxEvents() {
    if (!lightbox) return;
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxTapPrev.addEventListener('click', showPrevImage);
    lightboxTapNext.addEventListener('click', showNextImage);
    lightboxPauseZone.addEventListener('click', () => {
      if (storyPaused) resumeStoryTimer();
      else pauseStoryTimer();
    });
    document.addEventListener('keydown', (event) => {
      if (!lightbox.classList.contains('active')) return;
      if (event.key === 'Tab') {
        const controls = [...lightbox.querySelectorAll('button:not(:disabled)')];
        const index = controls.indexOf(document.activeElement);
        const next = event.shiftKey
          ? (index <= 0 ? controls.length - 1 : index - 1)
          : (index + 1) % controls.length;
        event.preventDefault();
        controls[next].focus();
      } else if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPrevImage();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNextImage();
      }
    });
  }

  bindLightboxEvents();
  reducedMotionQuery.addEventListener('change', () => {
    if (lightbox.classList.contains('active') && lightbox.classList.contains('is-sharp')) startStoryTimer();
  });

  window.PortfolioGallery = {
    preloadInitialImages,
    loadRemainingImages,
    buildGalleryGrid,
    getColumnCount,
    loadPhotoCarousel,
    onSectionChange,
    closeLightbox,
    isLightboxOpen() {
      return !!lightbox?.classList.contains('active');
    }
  };
})();
