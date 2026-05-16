/* ============================================
   GALLERY MODULE
   ============================================
   1.  State & DOM References
   2.  Gallery Data & Loading
   3.  Gallery Grid
   4.  Photo Carousel
   5.  Lightbox / Story Viewer
   6.  Public API
   ============================================ */
(function() {
  /* ============================================
     1. STATE & DOM REFERENCES
     ============================================ */
  const INITIAL_COUNT = 4;
  const CAROUSEL_IMAGE_LIMIT = 28;
  const GALLERY_BATCH_SIZE = 12;
  let galleryData = null;
  let galleryImages = [];
  let galleryColumns = [];
  let columnHeights = [];
  let gallerySkeletonsById = {};
  let shuffledGalleryImages = [];
  let carouselAnimationFrame = null;

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

  /* ============================================
     2. GALLERY DATA & LOADING
     ============================================ */
  async function loadGalleryData() {
    try {
      const response = await fetch('gallery/gallery.json');
      const data = await response.json();
      if (data.images && data.images.length > 0) galleryData = data;
    } catch (e) {}
  }

  async function preloadInitialImages(setProgress) {
    await loadGalleryData();
    if (!galleryData || !galleryData.images.length) return;

    const shuffledImages = [...galleryData.images];
    for (let i = shuffledImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledImages[i], shuffledImages[j]] = [shuffledImages[j], shuffledImages[i]];
    }
    shuffledGalleryImages = shuffledImages;

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
      setProgress(simulatedPct);
      requestAnimationFrame(tickProgress);
    }
    requestAnimationFrame(tickProgress);

    for (const imageData of initialBatch) {
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = imageData.url;
        await img.decode();
        imageData.naturalWidth = img.naturalWidth;
        imageData.naturalHeight = img.naturalHeight;
        galleryImages.push(imageData);
      } catch (e) {}
      completed++;
      targetPct = checkpoints[completed - 1];
    }

    await new Promise(r => {
      function waitForAnimation() {
        const currentText = document.getElementById('loading-percentage')?.textContent || '0%';
        const displayedPct = parseFloat(currentText) || 0;
        if (displayedPct >= 99.5) {
          simRunning = false;
          r();
          return;
        }
        requestAnimationFrame(waitForAnimation);
      }
      waitForAnimation();
    });
  }

  function loadRemainingImages() {
    if (!galleryData) return;
    const loadedIds = new Set(galleryImages.map(img => img.id));
    const remaining = (shuffledGalleryImages.length > 0 ? shuffledGalleryImages : galleryData.images)
      .filter(img => !loadedIds.has(img.id));
    if (remaining.length === 0) return;
    let idx = 0;

    function appendGalleryBatch() {
      if (idx >= remaining.length) return;
      const end = Math.min(idx + GALLERY_BATCH_SIZE, remaining.length);
      while (idx < end) {
        const imageData = remaining[idx++];
        imageData.naturalWidth = imageData.naturalWidth || imageData.width;
        imageData.naturalHeight = imageData.naturalHeight || imageData.height;
        galleryImages.push(imageData);
        appendToGalleryGrid(imageData);
        appendToCarousel(imageData);
      }
      scheduleNextGalleryBatch();
    }

    function scheduleNextGalleryBatch() {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(appendGalleryBatch, { timeout: 700 });
      } else {
        window.setTimeout(appendGalleryBatch, 24);
      }
    }

    scheduleNextGalleryBatch();
  }

  /* ============================================
     3. GALLERY GRID
     ============================================ */
  function getColumnCount() {
    const w = window.innerWidth;
    if (w <= 480) return 1;
    if (w <= 768) return 2;
    if (w <= 1024) return 3;
    return 4;
  }

  function getRenderedImageHeight(imageData) {
    const imageWidth = imageData.naturalWidth || imageData.width;
    const imageHeight = imageData.naturalHeight || imageData.height;
    if (!imageWidth || !imageHeight) return 200;
    if (galleryColumns.length === 0) return 200;
    const colWidth = galleryColumns[0].offsetWidth || 200;
    return (imageHeight / imageWidth) * colWidth;
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
    galleryImages.forEach((img) => {
      const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
      galleryColumns[shortestIdx].appendChild(createGalleryItem(img));
      columnHeights[shortestIdx] += getRenderedImageHeight(img) + 6;
    });
    buildGallerySkeletons();
  }

  function createGalleryItem(img) {
    const itemEl = document.createElement('div');
    itemEl.className = 'gallery-item is-loading';
    const imgEl = document.createElement('img');
    imgEl.src = img.blobUrl || img.url;
    imgEl.alt = img.title || 'Gallery photo';
    imgEl.loading = 'lazy';
    imgEl.decoding = 'async';
    if (img.width && img.height) {
      imgEl.width = img.width;
      imgEl.height = img.height;
    }
    imgEl.addEventListener('load', () => itemEl.classList.remove('is-loading'), { once: true });
    imgEl.addEventListener('error', () => itemEl.classList.remove('is-loading'), { once: true });
    itemEl.appendChild(imgEl);
    itemEl.addEventListener('click', () => openLightbox(galleryImages.indexOf(img)));
    return itemEl;
  }

  function appendToGalleryGrid(imageData) {
    if (galleryColumns.length === 0) return;
    const item = createGalleryItem(imageData);
    const skeleton = gallerySkeletonsById[imageData.id];
    if (skeleton && skeleton.parentNode) {
      const colIdx = Array.prototype.indexOf.call(galleryColumns, skeleton.parentNode);
      if (colIdx !== -1) {
        skeleton.parentNode.replaceChild(item, skeleton);
      } else {
        const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
        galleryColumns[shortestIdx].appendChild(item);
        columnHeights[shortestIdx] += getRenderedImageHeight(imageData) + 6;
      }
      delete gallerySkeletonsById[imageData.id];
    } else {
      const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
      galleryColumns[shortestIdx].appendChild(item);
      columnHeights[shortestIdx] += getRenderedImageHeight(imageData) + 6;
    }
  }

  function buildGallerySkeletons() {
    gallerySkeletonsById = {};
    if (!galleryData || galleryColumns.length === 0) return;
    const colWidth = galleryColumns[0].offsetWidth || 200;
    const loadedIds = new Set(galleryImages.map(img => img.id));
    const remaining = (shuffledGalleryImages.length > 0 ? shuffledGalleryImages : galleryData.images)
      .filter(img => !loadedIds.has(img.id));

    remaining.forEach(imageData => {
      const skeleton = document.createElement('div');
      skeleton.className = 'gallery-skeleton';
      const height = (imageData.width && imageData.height)
        ? (imageData.height / imageData.width) * colWidth
        : colWidth * 1.25;
      skeleton.style.height = height + 'px';
      const shortestIdx = columnHeights.indexOf(Math.min(...columnHeights));
      galleryColumns[shortestIdx].appendChild(skeleton);
      columnHeights[shortestIdx] += height + 6;
      gallerySkeletonsById[imageData.id] = skeleton;
    });
  }

  /* ============================================
     4. PHOTO CAROUSEL
     ============================================ */
  function loadPhotoCarousel() {
    const carousel = document.getElementById('photo-carousel');
    if (!carousel || galleryImages.length === 0) return;
    const track = document.createElement('div');
    track.className = 'photo-carousel-track';
    galleryImages.slice(0, CAROUSEL_IMAGE_LIMIT).forEach(img => appendToCarousel(img, track));
    carousel.innerHTML = '';
    carousel.appendChild(track);
    requestAnimationFrame(() => initCarouselScroll(track));
  }

  function appendToCarousel(img, targetTrack) {
    const track = targetTrack || document.querySelector('.photo-carousel-track');
    if (!track || track.children.length >= CAROUSEL_IMAGE_LIMIT) return;
    const imgEl = document.createElement('img');
    imgEl.src = img.blobUrl || img.url;
    imgEl.alt = img.title || 'Gallery photo';
    imgEl.className = 'carousel-img-loaded';
    imgEl.decoding = 'async';
    imgEl.loading = 'lazy';
    if (img.width && img.height) {
      imgEl.width = img.width;
      imgEl.height = img.height;
    }
    track.appendChild(imgEl);
  }

  function initCarouselScroll(track) {
    const carousel = track.parentElement;
    if (!carousel) return;
    if (carouselAnimationFrame) {
      cancelAnimationFrame(carouselAnimationFrame);
      carouselAnimationFrame = null;
    }
    let lastTimestamp = 0;
    let isPaused = false;
    let scrollPosition = carousel.scrollLeft;
    let resumeTimer = null;
    const speed = 20;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      const wrapperVisible = carousel.closest('.photo-carousel-wrapper')?.classList.contains('visible');
      if (!document.hidden && wrapperVisible && !reducedMotion && !isPaused && speed > 0) {
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
      carouselAnimationFrame = requestAnimationFrame(tick);
    }

    carouselAnimationFrame = requestAnimationFrame(tick);
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
     5. LIGHTBOX / STORY VIEWER
     ============================================ */
  function openLightbox(index) {
    if (galleryImages.length === 0) return;
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
    const img = galleryImages[currentImageIndex];
    lightboxImg.src = img.blobUrl || img.url;
    lightboxImg.alt = img.title || 'Gallery photo';
    const counterText = (currentImageIndex + 1) + ' / ' + galleryImages.length;
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
    lightboxStoryProgress.style.animation = 'story-progress ' + duration + 'ms linear forwards';
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
    currentImageIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
    updateLightboxImage();
    startStoryTimer();
  }

  function showNextImage() {
    currentImageIndex = (currentImageIndex + 1) % galleryImages.length;
    updateLightboxImage();
    startStoryTimer();
  }

  function bindLightboxEvents() {
    if (!lightbox) return;
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
  }

  bindLightboxEvents();

  /* ============================================
     6. PUBLIC API
     ============================================ */
  window.PortfolioGallery = {
    preloadInitialImages,
    loadRemainingImages,
    buildGalleryGrid,
    getColumnCount,
    loadPhotoCarousel,
    closeLightbox,
    isLightboxOpen() {
      return !!(lightbox && lightbox.classList.contains('active'));
    }
  };
})();
