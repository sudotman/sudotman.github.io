// Scroll-based Dot Animation
function initScrollBasedDotAnimation() {
  let scrollTimeout;
  let lastScrollTop = 0;
  let ticking = false;

  function animateDotsOnScroll() {
    const projectsContent = document.getElementById('projects-content');
    const field = getPrimaryDotField();

    if (!projectsContent || !field) return;

    function updateScrollAnimation() {
      ticking = false;

      if (field.asciiMode) return;

      const scrollHeight = projectsContent.scrollHeight - projectsContent.clientHeight;
      const scrollProgress = scrollHeight > 0 ? lastScrollTop / scrollHeight : 0;
      field.setScrollState(scrollProgress, 1);
    }

    projectsContent.addEventListener('scroll', event => {
      lastScrollTop = event.target.scrollTop;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateScrollAnimation);
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!field) return;

        if (typeof gsap !== 'undefined') {
          gsap.to(field, {
            scrollInfluence: 0,
            duration: 0.5,
            ease: 'power2.out',
            onUpdate: () => field.requestRender()
          });
        } else {
          field.setScrollState(field.scrollProgress, 0);
        }
      }, 150);
    });
  }

  // Setup scroll animation when projects are revealed
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('revealed') && target.id === 'projects-content') {
          setTimeout(animateDotsOnScroll, 1000); // Wait for projects to fully load
        }
      }
    });
  });

  const projectsContent = document.getElementById('projects-content');
  if (projectsContent) {
    observer.observe(projectsContent, { attributes: true });
  }
} 

// ------------------- Dynamic Projects Loader -------------------
async function loadProjects() {
  try {
    const res = await fetch('content.json');
    if (!res.ok) throw new Error('Failed to fetch content.json');
    const data = await res.json();
    if (!data.projects || !Array.isArray(data.projects)) return;

    const grid = document.querySelector('.projects-grid');
    if (!grid) return;

    // Clear any hard-coded cards
    grid.innerHTML = '';

    // once projects are loaded, set up drag events
    const accentMap = {
      game: '#FFB74C',
      programming: '#A8FF51',
      art: '#F05CEB',
      design: '#5CB3FF',
      rnd: '#d7f113',
      open_source: '#FF5C5C',
    };

    window.projectMap = {};
    // Reduce DOM thrash: use fragment
    const frag = document.createDocumentFragment();
    data.projects.forEach((proj, idx) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.dataset.project = proj.id || `project-${idx}`;

      // Set accent color CSS variable based on category
      const accent = accentMap[proj.category] || '#A8FF51';
      card.style.setProperty('--accent', accent);

      // Template
      card.innerHTML = `
        <div class="project-card-header">
          <div class="project-icon">
            ${proj.iconSvg || `<span>${(proj.title || '?')[0]}</span>`}
          </div>
          <div class="project-header-text">
            <h3>${proj.title || 'Untitled'}</h3>
            <p class="project-type">${proj.category || 'Project'}</p>
          </div>
        </div>
        <div class="project-card-body">
          <p class="project-description">${proj.short || ''}</p>
          <div class="project-tags">
            ${(proj.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
        </div>
        <div class="project-card-footer">
          <button class="project-expand-btn" data-project-id="${proj.id}" onclick="toggleProjectDetails(this)">
            <span>view more</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>` +
        (proj.long || (proj.links && proj.links.length) ? `
        <div class="project-details" style="display: none;">
          <div class="project-details-content">
            <p>${proj.long || ''}</p>
            ${(proj.links || []).map(link => `<a href="${link.href}" target="_blank" class="project-link">${link.label || 'link'}</a>`).join('')}
          </div>
        </div>` : '')
      ;

      // Map storage & button dataset
      window.projectMap[proj.id] = proj;
      const btn = card.querySelector('.project-expand-btn');
      if (btn) btn.dataset.projectId = proj.id;

      // Random subtle rotation for staggered look
      const rot = (Math.random() * 8) - 4; // -4 to +4 degrees
      card.style.transform = `rotate(${rot}deg)`;

      frag.appendChild(card);
    });
    grid.appendChild(frag);
  } catch (err) {
    console.error(err);
  }
}

// ------------------- End Dynamic Projects Loader --------------- 

// Color Sampler for Interactive Dots
function legacyColorSampler() {
  // Legacy DOM-dot sampler retired in favour of the canvas-backed field renderer.
}

function getColorAtPixel(x, y) {
  void x;
  void y;
  return null;
} 

/* ------------------- Real-Time Colour Sampler ------------------- */
function initColorSampler() {
  const supportsMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const field = getPrimaryDotField();
  const btn = document.createElement('button');
  btn.className = 'color-sampler-btn';
  btn.title = 'Enable real-time colour mood';
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 512 640" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><path fill="currentColor" d="M471.6,250.8c-3.9-3.9-97.7-95-215.6-95s-211.6,91.1-215.6,95c-1.4,1.4-2.2,3.2-2.2,5.2s0.8,3.8,2.2,5.2   c3.9,3.9,97.7,95,215.6,95s211.6-91.1,215.6-95c1.4-1.4,2.2-3.2,2.2-5.2S473,252.2,471.6,250.8z M256,341.6   c-96,0-177.9-66.3-199.7-85.6c2.4-2.1,5.5-4.8,9.2-7.9c0.8-0.7,1.6-1.3,2.5-2c0.3-0.2,0.6-0.5,0.9-0.7c0.6-0.5,1.2-1,1.8-1.4   c0.3-0.2,0.6-0.5,0.9-0.7c0.6-0.5,1.3-1,1.9-1.5c3.6-2.8,7.6-5.8,11.9-8.9c0.8-0.6,1.6-1.1,2.4-1.7c1.2-0.9,2.5-1.7,3.7-2.6   c0.4-0.3,0.9-0.6,1.3-0.9c1.7-1.2,3.5-2.4,5.3-3.6c1.4-0.9,2.7-1.8,4.1-2.7c0.9-0.6,1.9-1.2,2.8-1.8c2.9-1.8,5.8-3.6,8.9-5.5   c1-0.6,2-1.2,3.1-1.8c1-0.6,2.1-1.2,3.1-1.8c0.5-0.3,1.1-0.6,1.6-0.9c1.1-0.6,2.1-1.2,3.2-1.8c35.7-19.7,81.4-37.4,131-37.4   s95.3,17.6,131,37.4c1.1,0.6,2.2,1.2,3.2,1.8c0.5,0.3,1.1,0.6,1.6,0.9c1,0.6,2.1,1.2,3.1,1.8c1,0.6,2.1,1.2,3.1,1.8   c3,1.8,6,3.6,8.9,5.5c1,0.6,1.9,1.2,2.8,1.8c1.4,0.9,2.8,1.8,4.1,2.7c1.8,1.2,3.6,2.4,5.3,3.6c0.4,0.3,0.9,0.6,1.3,0.9   c1.3,0.9,2.5,1.7,3.7,2.6c0.8,0.6,1.6,1.1,2.4,1.7c4.3,3.1,8.3,6.1,11.9,8.9c0.6,0.5,1.3,1,1.9,1.5c0.3,0.2,0.6,0.5,0.9,0.7   c0.6,0.5,1.2,1,1.8,1.4c0.3,0.2,0.6,0.5,0.9,0.7c0.9,0.7,1.7,1.4,2.5,2c3.8,3.1,6.9,5.8,9.2,7.9C433.9,275.3,352,341.6,256,341.6z"/><ellipse cx="256" cy="256" rx="54.5" ry="54.5" fill="currentColor"/></g></svg><span>mood</span>';
  document.body.appendChild(btn);

  // ASCII button (initially hidden)
  const asciiBtn = document.createElement('button');
  asciiBtn.className = 'ascii-sampler-btn';
  asciiBtn.title = 'Enable ASCII camera view';
  asciiBtn.style.display = 'none';
  asciiBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3L11 7H13L11 3H9ZM13 8H11L9 12H11L13 8ZM15 13H13L11 17H13L15 13ZM7 8H5L3 12H5L7 8ZM5 13H3L1 17H3L5 13ZM19 8H17L15 12H17L19 8ZM17 13H15L13 17H15L17 13ZM21 8H19L17 12H19L21 8Z"/></svg><span>ascii</span>';
  document.body.appendChild(asciiBtn);

  let active = false;
  let asciiActive = false;
  let videoStream = null;
  let videoEl = null;
  let averageCanvas = null;
  let averageCtx = null;
  let asciiCanvas = null;
  let asciiCtx = null;
  let isFrontCamera = true;
  let lastColour = '#245E51';
  let lastSampleAt = 0;
  let asciiSupported = false;
  const asciiChars = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  window.__ASCII_CHARSET = asciiChars;

  btn.addEventListener('click', async () => {
    if (active) {
      stopSampling();
      return;
    }

    let stream = null;
    let usedCamera = false;

    if (supportsMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        isFrontCamera = true;
        usedCamera = true;
      } catch (errFront) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
          isFrontCamera = false;
          usedCamera = true;
        } catch (errEnv) {
          console.warn('Webcam permission denied or unavailable, using fallback colour', errEnv);
        }
      }
    }

    showMoodOracleOverlay(() => {
      if (usedCamera && stream) {
        startSampling(stream);
      } else {
        fallbackSample();
      }
    });
  });

  asciiBtn.addEventListener('click', () => {
    if (!active || !asciiSupported) return;
    
    asciiActive = !asciiActive;
    asciiBtn.classList.toggle('active', asciiActive);

    if (field) {
      field.pointer.active = false;
    }

    if (asciiActive && field) {
      field.setAsciiFrame({
        cols: 1,
        rows: 1,
        data: new Uint8ClampedArray([0, 0, 0, 0])
      });
    } else if (field) {
      field.clearAsciiFrame();
    }
  });

  function startSampling(stream) {
    active = true;
    asciiSupported = true;
    btn.classList.add('active');
    asciiBtn.style.display = 'block';
    videoStream = stream;

    videoEl = document.createElement('video');
    videoEl.style.display = 'none';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.srcObject = stream;
    videoEl.play();
    document.body.appendChild(videoEl);

    averageCanvas = document.createElement('canvas');
    averageCanvas.width = 32;
    averageCanvas.height = 18;
    averageCtx = averageCanvas.getContext('2d', { willReadFrequently: true });
    averageCtx.imageSmoothingEnabled = false;

    asciiCanvas = document.createElement('canvas');
    asciiCtx = asciiCanvas.getContext('2d', { willReadFrequently: true });
    asciiCtx.imageSmoothingEnabled = false;

    lastSampleAt = 0;
    sampleLoop();
  }

  function sampleLoop(now = performance.now()) {
    if (!active) return;

    const targetFps = asciiActive ? PERF.asciiFps : PERF.moodFps;
    if (now - lastSampleAt < (1000 / targetFps)) {
      requestAnimationFrame(sampleLoop);
      return;
    }

    lastSampleAt = now;

    if (videoEl.readyState >= 2) {
      if (asciiActive) {
        applyAsciiFrame();
      } else {
        applyAverageColour();
      }
    }

    requestAnimationFrame(sampleLoop);
  }

  function applyAverageColour() {
    if (!averageCtx || !videoEl) return;

    averageCtx.clearRect(0, 0, averageCanvas.width, averageCanvas.height);
    drawVideoCover(averageCtx, averageCanvas.width, averageCanvas.height);

    const data = averageCtx.getImageData(0, 0, averageCanvas.width, averageCanvas.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 16) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    if (!count) return;

    applyColour(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
  }

  function applyColour(colour) {
    if (colour === lastColour) return;
    lastColour = colour;

    if (field) {
      field.setBaseColour(colour);
    }

    if (window.__DOT_GRIDS) {
      window.__DOT_GRIDS.forEach(c => c.base = colour);
    }
  }

  function applyAsciiFrame() {
    if (!field || !asciiCtx || !videoEl) return;

    const rect = field.container.getBoundingClientRect();
    const cols = clamp(Math.floor(rect.width / 8), 48, PERF.asciiMaxCols);
    const rows = clamp(Math.floor(rect.height / 12), 28, PERF.asciiMaxRows);

    if (asciiCanvas.width !== cols || asciiCanvas.height !== rows) {
      asciiCanvas.width = cols;
      asciiCanvas.height = rows;
      asciiCtx.imageSmoothingEnabled = false;
    }

    asciiCtx.clearRect(0, 0, cols, rows);
    drawVideoCover(asciiCtx, cols, rows);

    field.setAsciiFrame({
      cols,
      rows,
      data: new Uint8ClampedArray(asciiCtx.getImageData(0, 0, cols, rows).data)
    });
  }

  function drawVideoCover(context, targetW, targetH) {
    const srcW = videoEl.videoWidth || 640;
    const srcH = videoEl.videoHeight || 480;
    const scale = Math.max(targetW / srcW, targetH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (targetW - drawW) / 2;
    const dy = (targetH - drawH) / 2;

    context.save();
    context.imageSmoothingEnabled = false;
    if (isFrontCamera) {
      context.translate(targetW, 0);
      context.scale(-1, 1);
      context.drawImage(videoEl, 0, 0, srcW, srcH, targetW - dx - drawW, dy, drawW, drawH);
    } else {
      context.drawImage(videoEl, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
    }
    context.restore();
  }

  function stopSampling() {
    active = false;
    asciiActive = false;
    asciiSupported = false;
    btn.classList.remove('active');
    asciiBtn.classList.remove('active');
    asciiBtn.style.display = 'none';

    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    if (videoEl) videoEl.remove();
    videoStream = null;
    videoEl = null;
    averageCanvas = null;
    averageCtx = null;
    asciiCanvas = null;
    asciiCtx = null;

    if (field) {
      field.clearAsciiFrame();
      field.pointer.active = false;
    }

    applyColour('#245E51');
  }

  function fallbackSample() {
    active = true;
    asciiActive = false;
    asciiSupported = false;
    btn.classList.add('active');
    asciiBtn.classList.remove('active');
    asciiBtn.style.display = 'none';
    const computed = getComputedStyle(document.body).backgroundColor || '#245E51';
    applyColour(computed);
  }
}
/* ----------------- End Real-Time Colour Sampler ----------------- */ 

// --------------- Card Action Sound Helper -----------------
function playStackSound() {
  try { 
    // Re-use a single <audio> instance for stack sound
    const audio = playStackSound._audio || (playStackSound._audio = new Audio('sounds/card-stack.wav'));
    audio.currentTime = 0; // rewind so rapid replays work
    // Attempt playback (will be allowed because the click counts as user interaction)
    audio.play().catch(() => {/* ignore autoplay issues silently */});
  } catch (err) {
    console.warn('Stack audio playback failed:', err);
  }
} 

function playShuffleSound() {
  try {
    // Re-use a single AudioContext if possible (some browsers limit concurrent contexts)
    const ctx = playShuffleSound._ctx || (playShuffleSound._ctx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Configure oscillator for a pleasant, short pluck
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);

    // ADSR-style envelope for a quick, satisfying click
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (err) {
    // If AudioContext fails (e.g., due to browser policies), silently ignore.
    console.warn('Shuffle audio playback failed:', err);
  }
}
// ------------- End Card Action Sound Helper -------------

/* ----------- Card Action Control Flag & Helpers ------------ */
let cardActionInProgress = false;

function setCardActionButtonsDisabled(disabled) {
  document.querySelectorAll('.cards-action-btn').forEach(btn => {
    btn.disabled = disabled;
    btn.classList.toggle('disabled', disabled);
    // light visual feedback
    btn.style.pointerEvents = disabled ? 'none' : '';
    btn.style.opacity = disabled ? '0.5' : '';
  });
}
/* ----------- End Helpers ------------ */

/* ------------------- Card Stack & Shuffle Controls ------------------- */
function stackProjectCards() {
  if (cardActionInProgress) return; // prevent overlapping actions
  cardActionInProgress = true;
  setCardActionButtonsDisabled(true);

  // Play stack sound
  playStackSound();
  const grid = document.querySelector('.projects-grid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.project-card'));
  if (!cards.length) return;

  const gridRect = grid.getBoundingClientRect();
  const header = document.querySelector('.projects-header');
  const headerRect = header ? header.getBoundingClientRect() : null;

  const centerX = gridRect.left + gridRect.width / 2;
  // place stack ~200px below divider line to ensure full stack sits beneath
  const centerY = headerRect ? (headerRect.bottom + 300) : (gridRect.top + 300);

  // Create satisfying stacking animation with momentum
  const tl = gsap.timeline({
    onComplete: () => {
      cardActionInProgress = false;
      setCardActionButtonsDisabled(false);
    }
  });

  const eased = gsap.parseEase('steps(6)');
  cards.forEach((card, idx) => {
    // Reset any drag offsets gradually
    const currentX = gsap.getProperty(card, 'x');
    const currentY = gsap.getProperty(card, 'y');

    const rect = card.getBoundingClientRect();
    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;

    const deltaX = centerX - cardCenterX;
    const deltaY = centerY - cardCenterY;

    // Calculate distance for speed variation
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const baseDuration = PERF.isLowEnd ? 0.26 : 0.38;
    const duration = baseDuration + (distance / 1000) * (PERF.isLowEnd ? 0.08 : 0.15);

    // Add anticipation micro-animation before main movement
    tl.to(card, {
      scale: 1.05,
      rotation: (Math.random() - 0.5) * (PERF.isLowEnd ? 6 : 10),
      duration: 0.08,
      ease: 'power2.out'
    }, idx * 0.04)
    .to(card, {
      x: currentX + deltaX,
      y: currentY + deltaY,
      scale: 1,
      rotation: -8 + idx * 1.5 + (Math.random() - 0.5) * (PERF.isLowEnd ? 2 : 3),
      duration: duration,
      ease: eased,
      onStart: () => {
        card.style.zIndex = 100 + idx;
      }
    }, idx * 0.04 + 0.08)
    // Small settling animation for weight feeling
    .to(card, {
      y: currentY + deltaY + 2, // Small drop
      duration: PERF.isLowEnd ? 0.04 : 0.06,
      ease: 'bounce.out'
    }, idx * 0.04 + 0.08 + duration - 0.03)
    .to(card, {
      y: currentY + deltaY, // Settle back
      duration: PERF.isLowEnd ? 0.04 : 0.06,
      ease: 'power2.out'
    }, idx * 0.04 + 0.08 + duration + 0.03);
  });
}

function shuffleProjectCards() {
  if (cardActionInProgress) return; // prevent overlapping actions
  cardActionInProgress = true;
  setCardActionButtonsDisabled(true);

  // Play shuffle sound
  playShuffleSound();
  const grid = document.querySelector('.projects-grid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.project-card'));
  if (!cards.length) {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
    return;
  }

  // Reset any transforms so layout is authoritative
  cards.forEach(card => {
    gsap.set(card, { x: 0, y: 0, rotation: 0, scale: 1 });
  });

  const fadeOutDuration = PERF && PERF.isLowEnd ? 0.08 : 0.12;
  const fadeInDuration = PERF && PERF.isLowEnd ? 0.10 : 0.15;

  gsap.to(cards, {
    opacity: 0,
    duration: fadeOutDuration,
    ease: 'none',
    onComplete: () => {
      // Fisher–Yates shuffle and re-append to apply new order instantly
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      cards.forEach(card => grid.appendChild(card));

      gsap.to(cards, {
        opacity: 1,
        duration: fadeInDuration,
        ease: 'power1.out',
        onComplete: () => {
          cardActionInProgress = false;
          setCardActionButtonsDisabled(false);
        }
      });
    }
  });
}

/* ------------------- Filter Functionality ------------------- */
let currentFilter = 'all';

function toggleFilterDropdown() {
  const dropdown = document.getElementById('filter-dropdown');
  const button = document.querySelector('.filter-cards-btn');
  
  if (!dropdown || !button) return;
  
  if (dropdown.classList.contains('show')) {
    dropdown.classList.remove('show');
    button.classList.remove('active');
  } else {
    dropdown.classList.add('show');
    button.classList.add('active');
  }
}

function filterProjects(category) {
  if (cardActionInProgress) return; // prevent filtering during other animations
  
  cardActionInProgress = true;
  setCardActionButtonsDisabled(true);
  
  currentFilter = category;
  const grid = document.querySelector('.projects-grid');
  if (!grid) return;
  
  const cards = Array.from(grid.querySelectorAll('.project-card'));
  const dropdown = document.getElementById('filter-dropdown');
  const button = document.querySelector('.filter-cards-btn');
  
  // Update active state in dropdown
  const options = dropdown.querySelectorAll('.filter-option');
  options.forEach(option => {
    if (option.dataset.filter === category) {
      option.classList.add('active');
    } else {
      option.classList.remove('active');
    }
  });
  
  // Close dropdown
  dropdown.classList.remove('show');
  button.classList.remove('active');
  
  // Separate cards into visible and hidden groups
  const visibleCards = [];
  const hiddenCards = [];
  
  cards.forEach(card => {
    const projectId = card.dataset.project;
    const project = window.projectMap ? window.projectMap[projectId] : null;
    
    if (category === 'all' || (project && project.category === category)) {
      visibleCards.push(card);
    } else {
      hiddenCards.push(card);
    }
  });
  
  // Create timeline for smooth orchestrated animation
  const tl = gsap.timeline({
    onComplete: () => {
      cardActionInProgress = false;
      setCardActionButtonsDisabled(false);
    }
  });
  
  // First, hide cards that should be hidden with satisfying exit animation
  if (hiddenCards.length > 0) {
    tl.to(hiddenCards, {
      opacity: 0,
      scale: 0.85,
      rotation: (i) => (Math.random() - 0.5) * (PERF.isLowEnd ? 8 : 20), // Random rotation for organic feel
      y: -20,
      duration: PERF.isLowEnd ? 0.35 : 0.5,
      ease: 'power3.in',
      stagger: {
        amount: PERF.isLowEnd ? 0.12 : 0.2,
        from: 'center'
      },
      onComplete: () => {
        hiddenCards.forEach(card => {
          card.style.display = 'none';
        });
      }
    });
  }
  
  // Then, show/rearrange visible cards with satisfying entrance
  tl.set(visibleCards, { display: 'block' })
    .fromTo(visibleCards, 
      { 
        opacity: 0, 
        scale: 0.9, 
        y: 40,
        rotation: (i) => (Math.random() - 0.5) * (PERF.isLowEnd ? 6 : 15)
      },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        rotation: (i) => (Math.random() - 0.5) * 4, // Subtle final rotation
        duration: PERF.isLowEnd ? 0.45 : 0.7,
        ease: 'back.out(1.7)',
        stagger: {
          amount: PERF.isLowEnd ? 0.25 : 0.4,
          from: 'start'
        }
      }, 
      hiddenCards.length > 0 ? 0.3 : 0
    );
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const dropdown = document.getElementById('filter-dropdown');
  const container = document.querySelector('.filter-dropdown-container');
  
  if (dropdown && container && !container.contains(event.target)) {
    dropdown.classList.remove('show');
    document.querySelector('.filter-cards-btn')?.classList.remove('active');
  }
});
/* ----------------- End Card Stack & Shuffle Controls ----------------- */ 

