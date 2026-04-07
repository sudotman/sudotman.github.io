/* ================= Visitor Heatmap ================= */
const KVDB_BUCKET = 'GpuEbRgGPvKxLPDh5ktKRc';
const HEATMAP_ENDPOINT = `https://kvdb.io/${KVDB_BUCKET}`;

let kvdbAvailable = true;
let kvdbRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1000;

const dotClickCounts = {};
const pendingWrites = new Map();
const MAX_STORED_CLICKS = 60;

let writeTimeout = null;
let oracleShownThisSession = false;
let moodOracleShownThisSession = false;
let heatmapDataLoaded = false;
let globalClickSequence = 0;

function getHeatmapContainer() {
  return document.querySelector('[data-dots-container-init]');
}

function getHeatmapField(container = getHeatmapContainer()) {
  return container?._dotField || null;
}

function getHeatmapCells(container = getHeatmapContainer()) {
  return getHeatmapField(container)?.cells.filter(cell => !cell._isHole) || [];
}

async function kvdbRequest(url, options = {}, retryAttempt = 0) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`KVDB request failed: ${response.status} ${response.statusText}`);
    }

    kvdbRetryCount = 0;
    kvdbAvailable = true;
    return response;
  } catch (error) {
    if (retryAttempt < MAX_RETRY_ATTEMPTS && error.name !== 'AbortError') {
      const delay = RETRY_BASE_DELAY * Math.pow(2, retryAttempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      return kvdbRequest(url, options, retryAttempt + 1);
    }

    kvdbRetryCount++;
    if (kvdbRetryCount >= 3) {
      kvdbAvailable = false;
    }

    throw error;
  }
}

async function flushPendingWrites() {
  if (pendingWrites.size === 0 || !kvdbAvailable) return;

  const writes = Array.from(pendingWrites.entries());
  pendingWrites.clear();

  await Promise.allSettled(writes.map(async ([key, entry]) => {
    try {
      await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`, {
        method: 'PUT',
        body: JSON.stringify(entry),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (_) {
      pendingWrites.set(key, entry);
    }
  }));
}

function queuePendingWrite(key, entry) {
  if (!kvdbAvailable) return;

  pendingWrites.set(key, entry);
  clearTimeout(writeTimeout);
  writeTimeout = setTimeout(() => {
    flushPendingWrites().catch(() => {});
  }, 1800);
}

function colourFromCount(count) {
  if (document.body.classList.contains('theme-pink')) {
    if (count === 0) return '#6E1B59';
    if (count === 1) return '#F05CEB';
    if (count === 2) return '#FF8BD8';
    if (count === 3) return '#FF70C8';
    if (count <= 5) return '#E23ED6';
    return '#C82CC5';
  }

  if (count === 0) return '#245E51';
  if (count === 1) return '#A8FF51';
  if (count === 2) return '#FFFF51';
  if (count === 3) return '#FF9F51';
  if (count <= 5) return '#FF6B47';
  return '#FF4C24';
}

function getDotKey(dot) {
  return `${dot._row}_${dot._col}`;
}

function applyHeatToDot(dot, count, animate = true) {
  const field = getHeatmapField();
  dot._heatmapCount = count;
  dot._heatmapColor = colourFromCount(count);

  if (animate) {
    dot._pulseUntil = performance.now() + 260;
  }

  if (field) {
    field.requestRender();
  }
}

function cleanupOldEntries() {
  const entries = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('heat_')) continue;

    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed?.count > 0) {
        entries.push({ key, ...parsed });
      }
    } catch (_) {
      localStorage.removeItem(key);
    }
  }

  if (entries.length <= MAX_STORED_CLICKS) return;

  entries.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const staleEntries = entries.slice(0, entries.length - MAX_STORED_CLICKS);

  staleEntries.forEach(entry => {
    localStorage.removeItem(entry.key);
    delete dotClickCounts[entry.key.replace('heat_', '')];
  });
}

async function incrementHeat(dot) {
  const key = getDotKey(dot);
  if (!key || key.includes('undefined')) return;

  globalClickSequence++;
  const newCount = (dotClickCounts[key] || 0) + 1;
  dotClickCounts[key] = newCount;

  const clickEntry = {
    count: newCount,
    sequence: globalClickSequence,
    timestamp: Date.now()
  };

  try {
    localStorage.setItem(`heat_${key}`, JSON.stringify(clickEntry));
  } catch (_) {
    // ignore localStorage issues and keep UI responsive
  }

  applyHeatToDot(dot, newCount, true);
  queuePendingWrite(key, clickEntry);
  cleanupOldEntries();
}

async function loadHeatmapData(container) {
  if (heatmapDataLoaded) return;
  heatmapDataLoaded = true;

  const cells = getHeatmapCells(container);
  cells.forEach(cell => {
    const lsKey = `heat_${getDotKey(cell)}`;

    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (parsed?.count > 0) {
        dotClickCounts[getDotKey(cell)] = parsed.count;
        globalClickSequence = Math.max(globalClickSequence, parsed.sequence || 0);
        applyHeatToDot(cell, parsed.count, false);
      }
    } catch (_) {
      localStorage.removeItem(lsKey);
    }
  });

  if (!kvdbAvailable) return;

  const keysToSync = Object.keys(dotClickCounts);
  for (let i = 0; i < keysToSync.length; i += 4) {
    const chunk = keysToSync.slice(i, i + 4);

    await Promise.allSettled(chunk.map(async key => {
      try {
        const response = await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`);
        const remoteText = await response.text();
        const remoteCount = (() => {
          try {
            return JSON.parse(remoteText).count || 0;
          } catch (_) {
            return parseInt(remoteText, 10) || 0;
          }
        })();

        if (remoteCount > (dotClickCounts[key] || 0)) {
          dotClickCounts[key] = remoteCount;

          try {
            localStorage.setItem(`heat_${key}`, JSON.stringify({
              count: remoteCount,
              sequence: ++globalClickSequence,
              timestamp: Date.now()
            }));
          } catch (_) {
            // ignore storage failures
          }

          const cell = getHeatmapCells(container).find(candidate => getDotKey(candidate) === key);
          if (cell) {
            applyHeatToDot(cell, remoteCount, false);
          }
        }
      } catch (_) {
        // ignore sync failures; local mode still works
      }
    }));
  }
}

function generateFallbackHeatSpots(cells) {
  const spots = [];
  const interestingPoints = [
    { x: 0.25, y: 0.3, intensity: 1 },
    { x: 0.75, y: 0.32, intensity: 2 },
    { x: 0.3, y: 0.68, intensity: 1 },
    { x: 0.68, y: 0.72, intensity: 3 }
  ];

  interestingPoints.forEach(point => {
    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    cells.forEach(cell => {
      const dx = (cell._col / Math.max(1, (getHeatmapContainer()?._cols || 1))) - point.x;
      const dy = (cell._row / Math.max(1, (getHeatmapContainer()?._rows || 1))) - point.y;
      const distance = Math.hypot(dx, dy);

      if (distance < closestDistance) {
        closest = cell;
        closestDistance = distance;
      }
    });

    if (closest) {
      spots.push({ dot: closest, intensity: point.intensity });
    }
  });

  return spots;
}

async function progressiveLoadHeatmap(container) {
  if (!kvdbAvailable) return 'local-only';

  const keysToSync = Object.keys(dotClickCounts);
  if (!keysToSync.length) return 'local-only';

  for (let i = 0; i < keysToSync.length; i += 3) {
    const chunk = keysToSync.slice(i, i + 3);
    await Promise.allSettled(chunk.map(async key => {
      try {
        const response = await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`);
        const remoteText = await response.text();
        const remoteCount = (() => {
          try {
            return JSON.parse(remoteText).count || 0;
          } catch (_) {
            return parseInt(remoteText, 10) || 0;
          }
        })();

        if (remoteCount > (dotClickCounts[key] || 0)) {
          dotClickCounts[key] = remoteCount;
          const cell = getHeatmapCells(container).find(candidate => getDotKey(candidate) === key);
          if (cell) {
            applyHeatToDot(cell, remoteCount, true);
          }
        }
      } catch (_) {
        // ignore individual failures
      }
    }));
  }

  return 'completed';
}

async function animateHeatmapReveal(container) {
  const field = getHeatmapField(container);
  if (!field) return;

  if (typeof gsap !== 'undefined') {
    field.revealBoost = 1.2;
    field.introOpacity = 0;
    field.introProgress = 0;
    field.triggerRipple(field.width * 0.5, field.height * 0.5, {
      duration: 900,
      radius: Math.max(field.width, field.height) * 0.52,
      band: field.cellSize * 3.2,
      push: field.cellSize * 0.55
    });

    gsap.to(field, {
      revealBoost: 0,
      duration: 1.05,
      ease: 'power2.out',
      onUpdate: () => field.requestRender()
    });

    gsap.to(field, {
      introOpacity: 1,
      introProgress: 1,
      duration: 0.82,
      ease: 'power3.out',
      onUpdate: () => field.requestRender()
    });
  } else {
    field.revealBoost = 0.6;
    field.introOpacity = 1;
    field.introProgress = 1;
    field.requestRender();
  }
}

async function revealHeatmap(container) {
  const field = getHeatmapField(container);
  if (!field) return;

  startLoadingAnimation();
  await loadHeatmapData(container);

  const cells = getHeatmapCells(container);
  const hasRealHeat = cells.some(cell => cell._heatmapCount > 0);

  if (!hasRealHeat) {
    generateFallbackHeatSpots(cells).forEach(({ dot, intensity }) => {
      dot._heatmapCount = intensity;
      dot._heatmapColor = colourFromCount(intensity);
    });
    field.requestRender();
  }

  cleanupLoadingAnimation();
  await animateHeatmapReveal(container);
  progressiveLoadHeatmap(container).catch(() => {});
}

function initHeatmapClickHandler() {
  const container = getHeatmapContainer();
  const field = getHeatmapField(container);
  if (!container || !field) return;

  container.style.pointerEvents = 'auto';

  container.addEventListener('click', event => {
    if (field.asciiMode) return;

    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cell = field.getCellFromPoint(x, y, true);

    if (!cell || cell._isHole) {
      const nearbyCell = typeof field.getNearestCell === 'function'
        ? field.getNearestCell(x, y, Math.max(field.stepX, field.stepY) * 0.9)
        : null;

      if (!nearbyCell) return;

      field.triggerRipple(nearbyCell.x, nearbyCell.y, {
        duration: 1850,
        radius: Math.max(field.stepX, field.stepY) * 4.2,
        band: field.cellSize * 3.8,
        push: field.cellSize * 0.42
      });
      return;
    }

    field.triggerRipple(x, y, {
      duration: 620,
      radius: Math.max(field.width, field.height) * 0.46,
      band: field.cellSize * 2.7,
      push: field.cellSize * 1.05
    });
    showOracleOverlay(() => revealHeatmap(container));
    incrementHeat(cell).catch(() => {});
  });

  const handleUnload = () => {
    if (!pendingWrites.size) return;

    if (navigator.sendBeacon && kvdbAvailable) {
      pendingWrites.forEach((entry, key) => {
        navigator.sendBeacon(`${HEATMAP_ENDPOINT}/${key}`, JSON.stringify(entry));
      });
      pendingWrites.clear();
      return;
    }

    flushPendingWrites().catch(() => {});
  };

  window.addEventListener('beforeunload', handleUnload);
  window.addEventListener('unload', handleUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingWrites().catch(() => {});
    }
  });

  window.heatmapDebug = {
    flushNow: () => flushPendingWrites(),
    getState: () => ({
      kvdbAvailable,
      kvdbRetryCount,
      pendingWrites: pendingWrites.size,
      dotClickCounts: Object.keys(dotClickCounts).length,
      heatmapDataLoaded
    })
  };
}

document.addEventListener('DOMContentLoaded', initHeatmapClickHandler);
/* =============== End Visitor Heatmap =============== */

function ensureOracleOverlay() {
  if (document.getElementById('oracle-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'oracle-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10000,
    opacity: 0,
    background: 'transparent'
  });
  overlay.innerHTML = `<div style="font-family: 'Cinzel', serif; color:#A8FF51; font-size:clamp(1.5rem,4vw,3rem); text-align:center; text-shadow:0 0 15px rgba(168,255,81,0.6); transform: translateY(-25vh);">
      the oracle will remember you...<br/>as it has everyone prior
    </div>`;
  document.body.appendChild(overlay);
}

function ensureMoodOracleOverlay() {
  if (document.getElementById('mood-oracle-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'mood-oracle-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10000,
    opacity: 0,
    background: 'transparent'
  });
  overlay.innerHTML = `<div style="font-family: 'Cinzel', serif; color:#A8FF51; font-size:clamp(1.5rem,4vw,3rem); text-align:center; text-shadow:0 0 15px rgba(168,255,81,0.6); transform: translateY(-25vh);">
      the oracle perceives you...<br/>colors singing through the dots
    </div>`;
  document.body.appendChild(overlay);
}

function showOracleOverlay(onFinish) {
  if (oracleShownThisSession) {
    if (onFinish) onFinish();
    return;
  }

  oracleShownThisSession = true;
  ensureOracleOverlay();
  const overlay = document.getElementById('oracle-overlay');
  if (!overlay) {
    if (onFinish) onFinish();
    return;
  }

  try { playOracleSound(); } catch (_) {}

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(overlay);
    gsap.set(overlay, { opacity: 0, pointerEvents: 'auto' });
    gsap.to(overlay, {
      opacity: 1,
      duration: 0.35,
      ease: 'power2.out',
      onComplete: () => {
        startLoadingAnimation();
        setTimeout(() => {
          if (onFinish) onFinish();
        }, 900);
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.8,
          delay: 1,
          ease: 'power2.in',
          onComplete: () => {
            overlay.style.pointerEvents = 'none';
          }
        });
      }
    });
  } else {
    overlay.style.opacity = 1;
    startLoadingAnimation();
    setTimeout(() => {
      if (onFinish) onFinish();
      overlay.style.opacity = 0;
    }, 1200);
  }
}

function playOracleSound(isShort) {
  try {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const audioContext = playOracleSound._ctx || (playOracleSound._ctx = new (AudioContext || webkitAudioContext)());
    const duration = isShort ? 0.18 : 0.48;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(196, now);
    oscillator.frequency.exponentialRampToValueAtTime(246, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch (_) {
    // ignore audio failures
  }
}

function getSharedUiAudioContext(key) {
  try {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
    const fn = getSharedUiAudioContext;
    fn._contexts = fn._contexts || {};
    const ctx = fn._contexts[key] || (fn._contexts[key] = new (AudioContext || webkitAudioContext)());
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  } catch (_) {
    return null;
  }
}

function playSoftUiChime(key, tones, options = {}) {
  try {
    const audioContext = getSharedUiAudioContext(key);
    if (!audioContext || !Array.isArray(tones) || tones.length === 0) return;

    const now = audioContext.currentTime;
    const attack = options.attack || 0.02;
    const decay = options.decay || 0.52;
    const spacing = options.spacing || 0.018;
    const volume = options.volume || 0.042;
    const cutoff = options.cutoff || 1800;
    const masterGain = options.masterGain || 1.15;
    const destinationGain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.setValueAtTime(0.3, now);
    destinationGain.gain.setValueAtTime(masterGain, now);
    destinationGain.connect(filter);
    filter.connect(audioContext.destination);

    tones.forEach((tone, index) => {
      const startAt = now + (index * spacing);
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const level = volume / (1 + (index * 0.42));

      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(tone, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(tone * 1.006, startAt + Math.min(0.08, decay * 0.2));

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(level, startAt + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);

      oscillator.connect(gain);
      gain.connect(destinationGain);
      oscillator.start(startAt);
      oscillator.stop(startAt + decay + 0.04);
    });
  } catch (_) {
    // ignore audio failures
  }
}

function playSkillNodeSound(frequency) {
  try {
    const audioContext = getSharedUiAudioContext('skill');
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency || 440, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.36);
  } catch (_) {
    // ignore audio failures
  }
}

function playExperienceCardSound() {
  try {
    playSkillNodeSound(330);
  } catch (_) {
    // ignore audio failures
  }
}

function playExperienceRoleTitleSound(frequency) {
  try {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const audioContext = new (AudioContext || webkitAudioContext)();
    const baseFreq = frequency || 330;
    const now = audioContext.currentTime;

    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);

    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq * 2, now);
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.05, now + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.start(now);
    osc1.stop(now + 0.8);
    osc2.start(now);
    osc2.stop(now + 0.5);
  } catch (_) {
    // ignore audio failures
  }
}

function playInterestNodeSound(baseFrequency, harmonicFrequency) {
  try {
    const root = baseFrequency || 440;
    const accent = harmonicFrequency || (root * 1.333);
    playSoftUiChime('interest', [root, accent], {
      decay: 0.48,
      volume: 0.044,
      cutoff: 1650,
      spacing: 0.028,
      attack: 0.022,
      masterGain: 1.2
    });
  } catch (_) {
    // ignore audio failures
  }
}

function playTabSwitchSound(targetTab) {
  const tabFrequencies = {
    projects: [392.0, 587.33],
    experience: [493.88, 739.99],
    interests: [587.33, 880.0]
  };

  const [root, accent] = tabFrequencies[targetTab] || [392.0, 587.33];
  playSoftUiChime('tab', [root, accent], {
    decay: 0.34,
    volume: 0.04,
    cutoff: 1550,
    spacing: 0.03,
    attack: 0.02,
    masterGain: 1.12
  });
}

function startLoadingAnimation() {
  const container = getHeatmapContainer();
  if (!container || document.getElementById('heatmap-loading-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'heatmap-loading-overlay';
  overlay.style.cssText = `
    position:absolute;
    inset:0;
    pointer-events:none;
    z-index:1000;
    opacity:0;
    background:radial-gradient(circle at center, rgba(168,255,81,0.06) 20%, transparent 70%);
  `;
  container.appendChild(overlay);

  if (typeof gsap !== 'undefined') {
    gsap.to(overlay, { opacity: 1, duration: 0.35, ease: 'power2.out' });
  } else {
    overlay.style.opacity = '1';
  }
}

function cleanupLoadingAnimation() {
  const overlay = document.getElementById('heatmap-loading-overlay');
  if (!overlay) return;

  if (typeof gsap !== 'undefined') {
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.35,
      ease: 'power2.out',
      onComplete: () => overlay.remove()
    });
  } else {
    overlay.remove();
  }
}

function showMoodOracleOverlay(onFinish) {
  if (moodOracleShownThisSession) {
    if (onFinish) onFinish();
    return;
  }

  moodOracleShownThisSession = true;
  ensureMoodOracleOverlay();
  const overlay = document.getElementById('mood-oracle-overlay');
  if (!overlay) {
    if (onFinish) onFinish();
    return;
  }

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(overlay);
    gsap.set(overlay, { opacity: 0, pointerEvents: 'auto' });
    gsap.to(overlay, {
      opacity: 1,
      duration: 0.35,
      ease: 'power2.out',
      onComplete: () => {
        setTimeout(() => {
          if (onFinish) onFinish();
        }, 650);

        gsap.to(overlay, {
          opacity: 0,
          duration: 0.8,
          delay: 1,
          ease: 'power2.in',
          onComplete: () => {
            overlay.style.pointerEvents = 'none';
          }
        });
      }
    });
  } else {
    overlay.style.opacity = 1;
    setTimeout(() => {
      if (onFinish) onFinish();
      overlay.style.opacity = 0;
    }, 1200);
  }
}
