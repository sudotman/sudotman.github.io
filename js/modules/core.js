gsap.registerPlugin(InertiaPlugin);

// -------- Global performance tuning --------
const PERF = {
  isLowEnd: (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || /mobile|android|iphone|ipad/i.test(navigator.userAgent),
  isMobile: /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent),
  isTouch: ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
};

PERF.tier = PERF.isLowEnd ? 'low' : (PERF.isMobile ? 'medium' : 'high');
PERF.maxDots = PERF.tier === 'low' ? 240 : (PERF.tier === 'medium' ? 420 : 620);
PERF.asciiFps = PERF.tier === 'low' ? 8 : 12;
PERF.moodFps = PERF.tier === 'low' ? 10 : 14;
PERF.asciiMaxCols = PERF.tier === 'low' ? 72 : (PERF.tier === 'medium' ? 96 : 118);
PERF.asciiMaxRows = PERF.tier === 'low' ? 40 : (PERF.tier === 'medium' ? 54 : 68);

try {
  gsap.config({ autoSleep: 60, nullTargetWarn: false });
  if (gsap.ticker && gsap.ticker.lagSmoothing) {
    gsap.ticker.lagSmoothing(500, 16);
  }
  gsap.defaults({ force3D: true });
} catch (_) { /* noop */ }

const DOT_PIXEL_MAPS = {
  diamond: [
    [2, 0],
    [1, 1], [2, 1], [3, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
    [1, 3], [2, 3], [3, 3],
    [2, 4]
  ],
  heart: [
    [1, 0], [2, 0], [3, 0],
    [0, 1], [1, 1], [3, 1], [4, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
    [1, 3], [2, 3], [3, 3],
    [2, 4]
  ]
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPrimaryDotField() {
  return document.querySelector('[data-dots-container-init]')?._dotField || null;
}

function parseColour(input) {
  if (!input) return { r: 36, g: 94, b: 81 };

  if (input.startsWith('#')) {
    let hex = input.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('');
    }

    const value = Number.parseInt(hex, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  const rgbMatch = input.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const [r = 36, g = 94, b = 81] = rgbMatch[1]
      .split(',')
      .map(part => Number.parseFloat(part.trim()));

    return { r, g, b };
  }

  return { r: 36, g: 94, b: 81 };
}

function colourToCss(colour, alpha = 1) {
  if (alpha >= 0.999) {
    return colour;
  }

  const { r, g, b } = parseColour(colour);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function interpolateColour(from, to, amount) {
  const start = parseColour(from);
  const end = parseColour(to);
  const t = clamp(amount, 0, 1);

  return `rgb(${Math.round(start.r + ((end.r - start.r) * t))}, ${Math.round(start.g + ((end.g - start.g) * t))}, ${Math.round(start.b + ((end.b - start.b) * t))})`;
}

function drawPixelShape(ctx, shape, x, y, size, colour, alpha = 1) {
  const map = DOT_PIXEL_MAPS[shape] || DOT_PIXEL_MAPS.diamond;
  const unit = Math.max(1.1, Math.round((size / 5) * 100) / 100);
  const half = (5 * unit) / 2;

  ctx.fillStyle = colourToCss(colour, alpha);
  for (let i = 0; i < map.length; i++) {
    const [px, py] = map[i];
    ctx.fillRect(
      Math.round(x - half + (px * unit)),
      Math.round(y - half + (py * unit)),
      Math.ceil(unit),
      Math.ceil(unit)
    );
  }
}

function renderAsciiFrame(field) {
  const frame = field.asciiFrame;
  if (!frame || !frame.data || !frame.cols || !frame.rows) return;

  const ctx = field.ctx;
  const chars = window.__ASCII_CHARSET || " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  const cellW = field.width / frame.cols;
  const cellH = field.height / frame.rows;
  const fontSize = Math.max(6, Math.min(cellW, cellH) * 0.92);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px "Courier New", monospace`;

  for (let row = 0; row < frame.rows; row++) {
    for (let col = 0; col < frame.cols; col++) {
      const pixelIndex = ((row * frame.cols) + col) * 4;
      const r = frame.data[pixelIndex];
      const g = frame.data[pixelIndex + 1];
      const b = frame.data[pixelIndex + 2];
      const a = frame.data[pixelIndex + 3];

      if (a < 8) continue;

      const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
      const charIndex = Math.round(((255 - luminance) / 255) * (chars.length - 1));
      const glyph = chars.charAt(clamp(charIndex, 0, chars.length - 1));

      if (glyph === ' ') continue;

      const tint = `rgb(${Math.min(255, Math.round((r * 1.18) + 10))}, ${Math.min(255, Math.round((g * 1.18) + 10))}, ${Math.min(255, Math.round((b * 1.18) + 10))})`;

      ctx.fillStyle = colourToCss(tint, 0.95);
      ctx.fillText(
        glyph,
        ((col + 0.5) * cellW),
        ((row + 0.5) * cellH)
      );
    }
  }

  ctx.restore();
}

function queueDotFieldRender(field) {
  if (!field || field._renderQueued) return;

  field._renderQueued = true;
  requestAnimationFrame(() => {
    field._renderQueued = false;
    renderDotField(field);
  });
}

function renderDotField(field) {
  if (!field || !field.ctx) return;

  const now = performance.now();
  const ctx = field.ctx;
  const accent = document.body.classList.contains('theme-pink') ? '#F05CEB' : field.colors.active;
  const shape = document.body.classList.contains('theme-pink') ? 'heart' : 'diamond';
  const activeRipples = [];

  ctx.clearRect(0, 0, field.width, field.height);

  if (field.asciiMode && field.asciiFrame) {
    renderAsciiFrame(field);
    return;
  }

  for (let i = 0; i < field.clickRipples.length; i++) {
    const ripple = field.clickRipples[i];
    const elapsed = now - ripple.start;
    if (elapsed <= ripple.duration) {
      ripple.progress = elapsed / ripple.duration;
      activeRipples.push(ripple);
    }
  }
  field.clickRipples = activeRipples;

  for (let i = 0; i < field.cells.length; i++) {
    const cell = field.cells[i];
    if (cell._isHole) continue;

    let drawX = cell.x;
    let drawY = cell.y;
    let scale = 1;
    let alpha = 0.9 * field.introOpacity;

    if (field.introProgress < 1) {
      const localIntro = clamp((field.introProgress - cell.introOffset) / (1 - cell.introOffset || 1), 0, 1);
      const easedIntro = localIntro * localIntro * (3 - (2 * localIntro));
      const introShift = 10 * (1 - easedIntro);
      drawY += introShift;
      scale *= 0.72 + (0.28 * easedIntro);
      alpha *= easedIntro;
    }

    if (field.disperse > 0) {
      const keepFactor = cell.scatterKeep ? 0.28 : 1;
      drawX += cell.scatterX * field.disperse * keepFactor;
      drawY += cell.scatterY * field.disperse * keepFactor;
      alpha *= clamp(1 - (field.disperse * (cell.scatterKeep ? 0.72 : 0.98)), 0.04, 1);
      scale *= clamp(1 - (field.disperse * (cell.scatterKeep ? 0.18 : 0.82)), 0.2, 1);
    }

    if (field.scrollInfluence > 0) {
      const wave = field.scrollProgress * Math.PI * 2;
      drawX += Math.sin(cell.wavePhase + wave) * 9 * field.scrollInfluence;
      drawY += Math.cos((cell.wavePhase * 0.65) + (wave * 0.7)) * 6 * field.scrollInfluence;
    }

    let colour = cell._heatmapCount > 0 ? colourFromCount(cell._heatmapCount) : field.colors.base;

    if (field.pointer.active && cell._heatmapCount === 0) {
      const dx = drawX - field.pointer.x;
      const dy = drawY - field.pointer.y;
      const distance = Math.hypot(dx, dy);
      const intensity = clamp(1 - (distance / field.pointer.radius), 0, 1);
      if (intensity > 0) {
        colour = interpolateColour(field.colors.base, accent, intensity);
        const verticalLift = intensity * field.cellSize * 0.18;
        drawY += dy < 0 ? -verticalLift : verticalLift;
        scale += intensity * 1.08;
        alpha = Math.min(1, alpha + (intensity * 0.24));
      }
    }

    for (let rippleIndex = 0; rippleIndex < field.clickRipples.length; rippleIndex++) {
      const ripple = field.clickRipples[rippleIndex];
      const dx = drawX - ripple.x;
      const dy = drawY - ripple.y;
      const distance = Math.hypot(dx, dy);
      const radius = ripple.progress * ripple.radius;
      const bandDistance = Math.abs(distance - radius);

      if (bandDistance < ripple.band) {
        const force = 1 - (bandDistance / ripple.band);
        const direction = distance > 0 ? 1 / distance : 0;
        drawX += dx * direction * force * ripple.push;
        drawY += dy * direction * force * ripple.push;
        alpha = Math.min(1, alpha + (force * 0.25));
        scale += force * 0.18;
      }
    }

    if (cell._pulseUntil && cell._pulseUntil > now) {
      const pulseProgress = (cell._pulseUntil - now) / 260;
      scale += Math.sin((1 - pulseProgress) * Math.PI) * 0.45;
      alpha = Math.min(1, alpha + 0.2);
    }

    if (field.revealBoost > 0 && cell._heatmapCount > 0) {
      scale += field.revealBoost * 0.25;
    }

    drawPixelShape(
      ctx,
      shape,
      drawX,
      drawY,
      field.cellSize * scale,
      colour,
      alpha
    );
  }

  if (field.pointer.active || field.clickRipples.length || field.scrollInfluence > 0 || field.disperse > 0 || field.revealBoost > 0 || field.introOpacity < 1 || field.introProgress < 1) {
    queueDotFieldRender(field);
  }
}

function createDotField(container) {
  if (!container) return null;

  container.innerHTML = '';
  container.style.pointerEvents = 'auto';

  const canvas = document.createElement('canvas');
  canvas.className = 'dots-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  const colors = { base: '#245E51', active: '#A8FF51' };
  window.__DOT_GRIDS = window.__DOT_GRIDS || [];
  window.__DOT_GRIDS.push(colors);

  const field = {
    container,
    canvas,
    ctx,
    cells: [],
    colors,
    width: 0,
    height: 0,
    cellSize: 6,
    pointer: {
      active: false,
      x: 0,
      y: 0,
      radius: PERF.isMobile ? 135 : 185
    },
    clickRipples: [],
    asciiMode: false,
    asciiFrame: null,
    scrollProgress: 0,
    scrollInfluence: 0,
    disperse: 0,
    revealBoost: 0,
    introOpacity: 0,
    introProgress: 0,
    _renderQueued: false
  };

  function buildGrid() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    const prevCounts = new Map(field.cells.map(cell => [cell.key, {
      count: cell._heatmapCount || 0,
      colour: cell._heatmapColor || null
    }]));

    field.width = width;
    field.height = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const idealGap = PERF.isMobile ? 22 : 18;
    let cols = Math.max(18, Math.floor(width / idealGap));
    let rows = Math.max(12, Math.floor(height / idealGap));
    let total = cols * rows;

    if (total > PERF.maxDots) {
      const scale = Math.sqrt(total / PERF.maxDots);
      cols = Math.max(18, Math.floor(cols / scale));
      rows = Math.max(12, Math.floor(rows / scale));
      total = cols * rows;
    }

    const holeCols = cols % 2 === 0 ? 4 : 5;
    const holeRows = rows % 2 === 0 ? 4 : 5;
    const startCol = Math.floor((cols - holeCols) / 2);
    const startRow = Math.floor((rows - holeRows) / 2);
    const stepX = width / cols;
    const stepY = height / rows;
    const size = Math.max(4, Math.min(stepX, stepY) * 0.42);

    field.cells = [];
    field.stepX = stepX;
    field.stepY = stepY;
    field.cellSize = size;
    container._cols = cols;
    container._rows = rows;
    container._interactionStride = 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row}_${col}`;
        const isHole = row >= startRow && row < startRow + holeRows && col >= startCol && col < startCol + holeCols;
        const seed = (((row * 73) + (col * 37)) % 1000) / 1000;
        const previous = prevCounts.get(key);

        field.cells.push({
          key,
          _row: row,
          _col: col,
          _isHole: isHole,
          x: (col + 0.5) * stepX,
          y: (row + 0.5) * stepY,
          scatterX: Math.cos(seed * Math.PI * 2) * (90 + (seed * 140)),
          scatterY: Math.sin(seed * Math.PI * 2) * (90 + (seed * 140)),
          scatterKeep: seed > 0.62,
          wavePhase: seed * Math.PI * 2,
          introOffset: seed * 0.18,
          _heatmapCount: previous?.count || 0,
          _heatmapColor: previous?.colour || null
        });
      }
    }

    queueDotFieldRender(field);
  }

  field.buildGrid = buildGrid;
  field.requestRender = () => queueDotFieldRender(field);
  field.setBaseColour = colour => {
    field.colors.base = colour;
    queueDotFieldRender(field);
  };
  field.setAsciiFrame = frame => {
    field.asciiFrame = frame;
    field.asciiMode = !!frame;
    container.classList.toggle('ascii-active', field.asciiMode);
    queueDotFieldRender(field);
  };
  field.clearAsciiFrame = () => {
    field.asciiFrame = null;
    field.asciiMode = false;
    container.classList.remove('ascii-active');
    queueDotFieldRender(field);
  };
  field.setScrollState = (progress, influence) => {
    field.scrollProgress = progress;
    field.scrollInfluence = influence;
    queueDotFieldRender(field);
  };
  field.setDisperse = value => {
    field.disperse = clamp(value, 0, 1);
    queueDotFieldRender(field);
  };
  field.triggerRipple = (x, y, options = {}) => {
    field.clickRipples.push({
      x,
      y,
      start: performance.now(),
      duration: options.duration || 520,
      radius: options.radius || (Math.max(field.width, field.height) * 0.42),
      band: options.band || (field.cellSize * 2.4),
      push: options.push || (field.cellSize * 0.95)
    });
    queueDotFieldRender(field);
  };
  field.getCellFromPoint = (x, y, requireExact = false) => {
    const col = Math.floor(x / field.stepX);
    const row = Math.floor(y / field.stepY);

    if (row < 0 || col < 0 || row >= container._rows || col >= container._cols) return null;

    const cell = field.cells[(row * container._cols) + col];
    if (!cell || cell._isHole) return null;

    if (requireExact) {
      const hitRadius = Math.max(3.5, field.cellSize * 0.58);
      if (Math.hypot(x - cell.x, y - cell.y) > hitRadius) {
        return null;
      }
    }

    return cell;
  };
  field.getNearestCell = (x, y, maxDistance = Math.max(field.stepX, field.stepY) * 0.85) => {
    let nearest = null;
    let nearestDistance = maxDistance;

    for (let i = 0; i < field.cells.length; i++) {
      const cell = field.cells[i];
      if (!cell || cell._isHole) continue;

      const distance = Math.hypot(x - cell.x, y - cell.y);
      if (distance <= nearestDistance) {
        nearest = cell;
        nearestDistance = distance;
      }
    }

    return nearest;
  };

  container._rebuildGrid = buildGrid;
  container._dotField = field;

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(buildGrid, 120);
  });

  window.addEventListener('load', buildGrid, { once: true });

  container.addEventListener('pointerenter', event => {
    if (field.asciiMode) return;

    const rect = container.getBoundingClientRect();
    field.pointer.active = true;
    field.pointer.x = event.clientX - rect.left;
    field.pointer.y = event.clientY - rect.top;
    queueDotFieldRender(field);
  });

  container.addEventListener('pointermove', event => {
    const rect = container.getBoundingClientRect();
    field.pointer.active = !field.asciiMode;
    field.pointer.x = event.clientX - rect.left;
    field.pointer.y = event.clientY - rect.top;
    queueDotFieldRender(field);
  });

  container.addEventListener('pointerleave', () => {
    field.pointer.active = false;
    queueDotFieldRender(field);
  });

  buildGrid();
  field.introOpacity = 0;
  field.introProgress = 0;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof gsap !== 'undefined') {
        gsap.to(field, {
          introOpacity: 1,
          introProgress: 1,
          duration: 0.55,
          ease: 'power2.out',
          onUpdate: () => field.requestRender()
        });
      } else {
        field.introOpacity = 1;
        field.introProgress = 1;
        field.requestRender();
      }
    });
  });

  return field;
}

function initGlowingInteractiveDotsGrid() {
  document.querySelectorAll('[data-dots-container-init]').forEach(container => {
    createDotField(container);
  });
}

// Initialize Glowing Interactive Dots Grid
document.addEventListener('DOMContentLoaded', function() {
  initGlowingInteractiveDotsGrid();
  loadProjects().then(() => {
    // Once projects are loaded, set up drag events
    // Disable drag only for small viewports or explicit mobile UAs
    const isSmallViewport = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
    const shouldDisableDrag = PERF.isMobile || isSmallViewport;
    if (!shouldDisableDrag) {
      initCardDragSystem();
    } else {
      try { console.log('[mobile/small] skipping draggable cards'); } catch (_) {}
    }
  });
  loadProfileData();
  initTabSwitching();
  initScrollBasedDotAnimation();
  initColorSampler();
  initThemeToggle();
});
// Theme toggle: footer title click switches to pink theme and back
function initThemeToggle() {
  const titleContainer = document.querySelector('.cloneable-title');
  const titleLine1 = document.querySelector('.cloneable-title__nr');
  const titleLine2 = document.querySelector('.cloneable-title__h1');
  if (!titleContainer || !titleLine1 || !titleLine2) return;

  function applyThemeNow(isPink) {
    const field = getPrimaryDotField();

    if (isPink) {
      titleLine1.textContent = "nothing ever happens";
      titleLine2.textContent = "we are so back";
      document.documentElement.style.setProperty('--accent-default', '#F05CEB');
    } else {
      titleLine1.textContent = "dante's digital inferno";
      titleLine2.textContent = "everything is what it truly is";
      document.documentElement.style.setProperty('--accent-default', '#A8FF51');
    }

    if (field) {
      field.requestRender();
    }
  }

  // Restore persisted preference
  try {
    const saved = localStorage.getItem('themeVariant');
    if (saved === 'pink') {
      document.body.classList.add('theme-pink');
      // defer apply to after first frame so DOM nodes likely exist
      requestAnimationFrame(() => applyThemeNow(true));
    }
  } catch (_) { /* ignore */ }

  titleContainer.addEventListener('click', () => {
    // Use consistent oracle animation+sound, custom message
    showThemeSwitchOracle(() => {
      const isPink = !document.body.classList.contains('theme-pink');
      if (isPink) document.body.classList.add('theme-pink'); else document.body.classList.remove('theme-pink');
      try { localStorage.setItem('themeVariant', isPink ? 'pink' : 'default'); } catch (_) {}
      applyThemeNow(isPink);
    });
  });
}

// Themed oracle overlay for theme switch: reuse style/sound with custom text
function showThemeSwitchOracle(onFinish) {
  const id = 'oracle-overlay-theme-switch';
  let ov = document.getElementById(id);
  if (!ov) {
    ov = document.createElement('div');
    ov.id = id;
    Object.assign(ov.style, {
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10000, opacity: 0, background: 'transparent'
    });
    ov.innerHTML = `<div style="font-family: 'Cinzel', serif; color:#F05CEB; font-size:clamp(1.5rem,4vw,3rem); text-align:center; text-shadow:0 0 18px rgba(240,92,235,0.6); transform: translateY(-25vh);">
        nothing ever happens...
      </div>`;
    document.body.appendChild(ov);
  }

  // play consistent mystical sound
  try { playOracleSound(); } catch (_) {}

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(ov);
    gsap.set(ov, { opacity: 0, pointerEvents: 'auto' });
    gsap.to(ov, { opacity: 1, duration: 0.4, ease: 'power2.out', onComplete: () => {
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 600);
      gsap.to(ov, { opacity: 0, duration: 0.8, delay: 0.8, ease: 'power2.in', onComplete: () => {
        ov.style.pointerEvents = 'none';
      }});
    }});
  } else {
    // Fallback without GSAP
    ov.style.transition = 'opacity 0.4s ease';
    ov.style.opacity = '1';
    setTimeout(() => { if (onFinish) onFinish(); }, 600);
    setTimeout(() => { ov.style.opacity = '0'; }, 1200);
  }
}

// Tab Switching Functionality
function initTabSwitching() {
  const navNodes = document.querySelectorAll('.nav-node');
  const tabContents = document.querySelectorAll('.tab-content');
  
  navNodes.forEach(node => {
    node.addEventListener('click', () => {
      if (node.classList.contains('active')) return;

      const targetTab = node.dataset.tab;
      try { playTabSwitchSound(targetTab); } catch (_) {}
      
      // Remove active class from all nodes and contents
      navNodes.forEach(n => n.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked node and corresponding content
      node.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
      
      // Handle card action buttons visibility/functionality
      updateCardActionsForTab(targetTab);
      
      // Enhanced constellation morphing effect
      morphConstellation(targetTab);
      
      // Trigger animations for the newly visible content
      setTimeout(() => {
        if (targetTab === 'experience') {
          animateExperienceCards();
        } else if (targetTab === 'interests') {
          animateInterestCards();
        }
      }, 100);
    });
  });
}

// Update card actions based on active tab
function updateCardActionsForTab(activeTab) {
  const cardActions = document.querySelector('.cards-actions');
  const filterDropdown = document.getElementById('filter-dropdown');
  
  if (activeTab === 'projects') {
    // Enable card actions for projects tab
    if (cardActions) {
      cardActions.style.opacity = '1';
      cardActions.style.pointerEvents = 'auto';
    }
    // Close filter dropdown if open
    if (filterDropdown) {
      filterDropdown.classList.remove('show');
      document.querySelector('.filter-cards-btn')?.classList.remove('active');
    }
  } else {
    // Disable card actions for other tabs
    if (cardActions) {
      cardActions.style.opacity = '0.3';
      cardActions.style.pointerEvents = 'none';
    }
    // Close filter dropdown if open
    if (filterDropdown) {
      filterDropdown.classList.remove('show');
      document.querySelector('.filter-cards-btn')?.classList.remove('active');
    }
  }
}

// Constellation morphing animation
function morphConstellation(activeTab) {
  const constellation = document.querySelector('.constellation-nav');
  const connections = document.querySelectorAll('.connection-line');
  const center = document.querySelector('.constellation-center');

  
  // const navNodesClasses = constellation.querySelectorAll('.nav-node');
  // navNodesClasses.forEach((node, index) => {
  //   node.addEventListener('click', () => {
  //     playExperienceCardSound();
  //   });
  // });
  
  // Add morphing class for enhanced effects
  constellation.classList.add('morphing');
  
  // Center pulsing based on active tab
  if (center) {
    center.style.animation = 'none';
    center.offsetHeight; // Trigger reflow
    center.style.animation = 'centerPulse 3s ease-in-out infinite';
  }
  
  // Connection lines morphing
  connections.forEach((line, index) => {
    line.style.animation = 'none';
    line.offsetHeight; // Trigger reflow
    line.style.animation = `connectionFlow 4s ease-in-out infinite`;
    line.style.animationDelay = `${index * 0.3}s`;
  });
  
  // Remove morphing class after animation
  setTimeout(() => {
    constellation.classList.remove('morphing');
  }, 2000);
}

// Profile Data Loading
async function loadProfileData() {
  try {
    const response = await fetch('profile.json');
    if (!response.ok) throw new Error('Failed to fetch profile data');
    const profileData = await response.json();
    
    loadExperienceData(profileData.workExperience);
    loadSkillsData(profileData.techStack);
    loadInterestsData(profileData.interests);
  } catch (error) {
    console.error('Error loading profile data:', error);
  }
}

// Load Experience Data with integrated skills
function loadExperienceData(workExperience) {
  const experienceCards = document.querySelector('.experience-cards');
  if (!experienceCards) return;
  
  experienceCards.innerHTML = workExperience.map((job, index) => `
    <article class="experience-card">
      <div class="experience-card-meta">
        <span class="experience-index">0${index + 1}</span>
        <span class="experience-chip">${job.roles.length} role${job.roles.length > 1 ? 's' : ''}</span>
      </div>
      <div class="experience-card-header">
        ${job.website ? `
          <a class="experience-org" href="${job.website}" target="_blank" rel="noopener noreferrer">${job.organization}</a>
        ` : `
          <div class="experience-org">${job.organization}</div>
        `}
        <div class="experience-period">${job.period}</div>
      </div>
      <div class="experience-roles">
        ${job.roles.map((role) => `
          <div class="experience-role">
            <span class="experience-role-head" aria-hidden="true"></span>
            <div class="experience-role-copy">
              <span class="experience-role-title">${role.title}</span>
              <span class="experience-role-period">${role.period}</span>
            </div>
            <span class="experience-role-resonator" aria-hidden="true"></span>
          </div>
        `).join('')}
      </div>
      <div class="experience-summary">${job.summary}</div>
    </article>
  `).join('');
  
  // Major scale frequencies (C4, D4, E4, F4, G4, A4, B4, C5, D5, E5...)
  // Creates a different but harmonious sound compared to pentatonic
  const majorScale = [
    261.63, // C4
    293.66, // D4
    329.63, // E4
    349.23, // F4
    392.00, // G4
    440.00, // A4
    493.88, // B4
    523.25, // C5
    587.33, // D5
    659.25  // E5
  ];
  
  // Add click event listeners to experience-role elements
  const roleTitles = experienceCards.querySelectorAll('.experience-role');
  roleTitles.forEach((title, index) => {
    // Assign each title a different note from the major scale
    const frequency = majorScale[index % majorScale.length];
    title.addEventListener('click', () => {
      playExperienceRoleTitleSound(frequency);
    });
  });

  // const fullCards = experienceCards.querySelectorAll('.experience-card');
  // fullCards.forEach((card, index) => {
  //   card.addEventListener('click', () => {
  //     playExperienceCardSound();
  //   });
  // });
}
// Load Skills Data into constellation
function loadSkillsData(techStack) {
  const skillsOrbits = document.querySelector('.skills-orbits');
  if (!skillsOrbits) return;
  
  // Create skill orbits and nodes
  const skillCategories = [
    { name: 'engines', items: techStack.gameEngines.slice(0, 4), label: 'game engines' },
    { name: 'languages', items: techStack.languages.slice(0, 6), label: 'languages' }
  ];
  
  let orbitIndex = 0;
  const orbitsHtml = skillCategories.map(category => {
    orbitIndex++;
    const orbitRadius = orbitIndex * 60 + 60; // 120px, 180px, 240px
    const nodes = category.items.map((skill, index) => {
      const angle = (index / category.items.length) * 360;
      const x = Math.cos(angle * Math.PI / 180) * (orbitRadius / 2);
      const y = Math.sin(angle * Math.PI / 180) * (orbitRadius / 2);
      
      return `
        <div class="skill-node" style="
          left: calc(50% + ${x}px - 40px);
          top: calc(50% + ${y}px - 40px);
        " title="${skill}">
          ${skill.length > 8 ? skill.substring(0, 6) + '...' : skill}
        </div>
      `;
    }).join('');
    
    return `
      <div class="skill-orbit">
        ${nodes}
      </div>
    `;
  }).join('');
  
  // Add category labels
  const labelsHtml = `
    <div class="skill-category-label engines">engines orbit</div>
    <div class="skill-category-label languages">as is often required, a lot of other hats are also worn</div>
  `;
  
  skillsOrbits.innerHTML = orbitsHtml + labelsHtml;
  
  // Pentatonic scale frequencies (C4, D4, E4, G4, A4, C5, D5, E5, G5, A5...)
  // These create pleasant, harmonious sounds
  const pentatonicScale = [
    261.63, // C4
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
    659.25, // E5
    783.99, // G5
    880.00  // A5
  ];
  
  // Add click event listeners to skill nodes for soothing sound
  const skillNodes = skillsOrbits.querySelectorAll('.skill-node');
  skillNodes.forEach((node, index) => {
    // Assign each node a different note from the pentatonic scale
    const frequency = pentatonicScale[index % pentatonicScale.length];
    node.addEventListener('click', () => {
      playSkillNodeSound(frequency);
    });
  });
}

// Load Interests Data
function loadInterestsData(interests) {
  const interestsConstellation = document.querySelector('.interests-constellation');
  if (!interestsConstellation) return;
  
  const interestNodes = [
    {
      title: 'cinema',
      tone: 'cinema',
      code: '01',
      kicker: 'shot / memory / fever',
      tag: 'screening ritual',
      essence: 'kinos and more',
      description: interests.cinema.description,
      links: [{ label: 'letterboxd', url: interests.cinema.letterboxd }]
    },
    {
      title: 'music',
      tone: 'music',
      code: '02',
      kicker: 'noise / devotion / loop',
      tag: 'headphones required',
      essence: 'grails and more',
      description: interests.music.description,
      links: [
        { label: 'last.fm', url: interests.music.lastfm },
        { label: 'topster', url: interests.music.topster }
      ]
    },
    {
      title: 'books',
      tone: 'books',
      code: '03',
      kicker: 'margin / spine / confession',
      tag: 'paper cuts welcome',
      essence: 'performativeness and more',
      description: interests.books.description,
      links: []
    },
    {
      title: 'games',
      tone: 'games',
      code: '04',
      kicker: 'systems / wonder / punishment',
      tag: 'controller drift',
      essence: 'vidya and more',
      description: interests.games.description,
      links: []
    }
  ];
  
  // Insert nodes before the constellation-web div
  const constellationWeb = interestsConstellation.querySelector('.constellation-web');
  const nodesHtml = interestNodes.map(node => `
    <article class="interest-node tone-${node.tone}">
      <div class="interest-orb">
        <div class="interest-meta">
          <span class="interest-code">${node.code}</span>
          <span class="interest-kicker">${node.kicker}</span>
        </div>
        <div class="interest-content">
          <div class="interest-heading">
            <div class="interest-title">${node.title}</div>
            <div class="interest-essence">${node.essence}</div>
          </div>
          <div class="interest-description">${node.description}</div>
          <div class="interest-footer">
            <span class="interest-tag">${node.tag}</span>
            <div class="interest-links">
              ${node.links.map(link => `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="interest-link">${link.label}</a>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </article>
  `).join('');
  
  constellationWeb.insertAdjacentHTML('beforebegin', nodesHtml);

  const notePairs = [
    [392.0, 587.33],
    [440.0, 659.25],
    [493.88, 739.99],
    [349.23, 523.25]
  ];

  const interestElements = interestsConstellation.querySelectorAll('.interest-node');
  interestElements.forEach((node, index) => {
    const [root, accent] = notePairs[index % notePairs.length];
    node.addEventListener('click', event => {
      if (event.target.closest('.interest-link')) return;
      try { playInterestNodeSound(root, accent); } catch (_) {}
    });
  });

  const interestLinks = interestsConstellation.querySelectorAll('.interest-link');
  interestLinks.forEach((link, index) => {
    const [root, accent] = notePairs[(index + 1) % notePairs.length];
    link.addEventListener('click', event => {
      event.stopPropagation();
      try { playInterestNodeSound(root * 1.12, accent * 1.05); } catch (_) {}
    });
  });
}

// Animation Functions
function animateExperienceCards() {
  const experienceCards = document.querySelectorAll('.experience-card');
  const skillNodes = document.querySelectorAll('.skill-node');
  
  // Animate experience cards
  experienceCards.forEach((card, index) => {
    card.style.animation = 'none';
    card.offsetHeight; // Trigger reflow
    card.style.animation = `slideInExperience 0.8s ease forwards`;
    card.style.animationDelay = `${index * 0.2}s`;
  });
  
  // Animate skill nodes with staggered entrance
  skillNodes.forEach((node, index) => {
    node.style.opacity = '0';
    node.style.transform = 'scale(0) rotate(180deg)';
    
    setTimeout(() => {
      if (typeof gsap !== 'undefined') {
        gsap.to(node, {
          opacity: 1,
          scale: 1,
          rotation: 0,
          duration: 0.6,
          ease: "back.out(1.7)"
        });
      } else {
        node.style.opacity = '1';
        node.style.transform = 'scale(1) rotate(0deg)';
      }
    }, index * 100 + 1000); // Start after cards are done animating
  });
}

function animateTimelineItems() {
  // Deprecated - redirect to new function
  animateExperienceCards();
}

function animateSkillCards() {
  // Deprecated - skills are now integrated into experience
  return;
}

function animateInterestCards() {
  const interestCards = document.querySelectorAll('.interest-node');
  interestCards.forEach((card, index) => {
    card.style.animation = 'none';
    card.offsetHeight; // Trigger reflow
    card.style.animation = 'nodeReveal 0.75s ease-out forwards';
    card.style.animationDelay = `${(index + 1) * 0.12}s`;
  });
}

// Card Drag System
function initCardDragSystem() {
  let isDragging = false;
  let currentCard = null;
  let startX, startY;
  let highestZIndex = 100;
  let cardData = new Map();
  let pendingMove = null;
  let moveRAF = null;

  function handleStart(e, card) {
    // Ignore drag initiation if the user clicked on an interactive child such as the view-more button
    if (e.target.closest('.project-expand-btn')) {
      return; // let the regular click event propagate
    }

    isDragging = true;
    currentCard = card;
    
    // Add dragging class to prevent hover interference
    card.classList.add('dragging');
    
    // Get current GSAP transform values
    const currentX = gsap.getProperty(card, "x");
    const currentY = gsap.getProperty(card, "y");
    const currentRotation = gsap.getProperty(card, "rotation");
    
    // Store card data
    cardData.set(card, {
      startX: currentX,
      startY: currentY,
      originalRotation: currentRotation,
      originalZIndex: card.style.zIndex || 'auto'
    });
    
    // Bring card to front
    card.style.zIndex = ++highestZIndex;
    
    // Get pointer position
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    startX = clientX;
    startY = clientY;
    
    // Add visual feedback using GSAP - gradual rotation to zero
    gsap.to(card, {
      scale: 1.05,
      rotation: 0, // Gradually straighten card while dragging
      boxShadow: '0 25px 50px rgba(255, 76, 36, 0.4)',
      duration: 0.4,
      ease: "power2.out"
    });
    
    e.preventDefault();
  }

  function handleMove(e) {
    if (!isDragging || !currentCard) return;
    pendingMove = e;
    if (moveRAF) return;
    moveRAF = requestAnimationFrame(() => {
      const ev = pendingMove;
      moveRAF = null;
      if (!ev || !currentCard) return;
      const clientX = ev.type.includes('touch') ? (ev.touches?.[0]?.clientX || ev.clientX) : ev.clientX;
      const clientY = ev.type.includes('touch') ? (ev.touches?.[0]?.clientY || ev.clientY) : ev.clientY;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      const data = cardData.get(currentCard);
      const newX = data.startX + deltaX;
      const newY = data.startY + deltaY;
      gsap.set(currentCard, { x: newX, y: newY });
    });
    e.preventDefault();
  }

  function handleEnd(e) {
    if (!isDragging || !currentCard) return;
    
    const data = cardData.get(currentCard);
    
    // Remove dragging class
    currentCard.classList.remove('dragging');
    
    isDragging = false;
    
    // Reset visual feedback using GSAP, but keep current position
    gsap.to(currentCard, {
      scale: 1,
      // Don't reset rotation - let the card stay at 0 degrees if dragged
      boxShadow: '0 15px 35px rgba(0, 0, 0, 0.4), 0 5px 15px rgba(255, 76, 36, 0.1)',
      duration: 0.3,
      ease: "power2.out"
    });
    
    // Update the stored rotation to 0 so it doesn't revert
    if (cardData.has(currentCard)) {
      const updatedData = cardData.get(currentCard);
      updatedData.originalRotation = 0;
      cardData.set(currentCard, updatedData);
    }
    
    currentCard = null;
  }

  // Initialize drag events for all project cards
  function setupCardEvents() {
    const cards = document.querySelectorAll('.project-card');
    
    cards.forEach((card, index) => {
      // Extract rotation from CSS transform
      const computedStyle = window.getComputedStyle(card);
      const transform = computedStyle.transform;
      let rotation = 0;
      
      if (transform && transform !== 'none') {
        const matrix = transform.split('(')[1].split(')')[0].split(',');
        if (matrix.length >= 4) {
          const a = parseFloat(matrix[0]);
          const b = parseFloat(matrix[1]);
          rotation = Math.round(Math.atan2(b, a) * (180 / Math.PI));
        }
      }
      
      // Set initial GSAP properties to match CSS positioning
      gsap.set(card, {
        x: 0,
        y: 0,
        rotation: rotation
      });
      
      // Mouse events
      card.addEventListener('mousedown', (e) => handleStart(e, card));
      
      // Touch events
      card.addEventListener('touchstart', (e) => handleStart(e, card), { passive: false });
      
      // Prevent text selection while dragging
      card.addEventListener('selectstart', (e) => e.preventDefault());
      
      // Prevent context menu on long press
      card.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // Global move and end events
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);

  // Setup events when projects are revealed
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('revealed') && target.id === 'projects-content') {
          setTimeout(setupCardEvents, 1500); // Wait for cards to appear
        }
      }
    });
  });

  const projectsContent = document.getElementById('projects-content');
  if (projectsContent) {
    observer.observe(projectsContent, { attributes: true });
  }
}

