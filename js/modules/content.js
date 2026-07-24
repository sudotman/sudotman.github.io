// Scroll-based Dot Animation
function initScrollBasedDotAnimation() {
  const projectsContent = document.getElementById('projects-content');
  if (!projectsContent || projectsContent.dataset.dotScrollBound === 'true') return;

  projectsContent.dataset.dotScrollBound = 'true';
  let scrollTimeout;
  let ticking = false;

  projectsContent.addEventListener('scroll', () => {
    const field = getPrimaryDotField();
    if (!field || field.asciiMode || !projectsContent.classList.contains('revealed')) return;

    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollRange = projectsContent.scrollHeight - projectsContent.clientHeight;
        field.setScrollState(scrollRange > 0 ? projectsContent.scrollTop / scrollRange : 0, 1);
      });
    }

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
        gsap.to(field, {
          scrollInfluence: 0,
          duration: 0.35,
          ease: 'power2.out',
          onUpdate: () => field.requestRender()
        });
      } else {
        field.setScrollState(field.scrollProgress, 0);
      }
    }, 120);
  }, { passive: true });
}

// ------------------- Dynamic Projects Loader -------------------
const catalogState = {
  manifest: null,
  projects: [],
  projectMap: new Map(),
  track: 'all',
  medium: 'all',
  sourceErrors: []
};

window.projectCatalog = catalogState;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isSafeUrl(value) {
  if (!value || typeof value !== 'string') return false;
  if (/^(images\/|icons\/|sounds\/|content\/|\.\.\/|\.\/)/i.test(value)) return true;

  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

function isSafeAssetUrl(value) {
  if (!value || typeof value !== 'string') return false;

  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

const EMBED_PROVIDER_IDS = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  vimeo: /^\d{1,12}$/
};

function normalizeMediaItem(item, projectTitle, index) {
  if (!item || typeof item !== 'object') return null;

  const type = String(item.type || '').toLowerCase();
  const title = typeof item.title === 'string' && item.title.trim()
    ? item.title.trim()
    : `${projectTitle || 'Project'} ${type || 'media'} ${index + 1}`;
  const caption = typeof item.caption === 'string' && item.caption.trim() ? item.caption.trim() : '';

  if (type === 'image') {
    if (!isSafeAssetUrl(item.src)) return null;
    return {
      type,
      src: item.src,
      alt: typeof item.alt === 'string' && item.alt.trim()
        ? item.alt.trim()
        : `${projectTitle || 'Project'} — visual ${index + 1}`,
      ...(isSafeAssetUrl(item.thumbnail) ? { thumbnail: item.thumbnail } : {}),
      ...(caption ? { caption } : {}),
      ...(Number.isInteger(item.width) && item.width > 0 ? { width: item.width } : {}),
      ...(Number.isInteger(item.height) && item.height > 0 ? { height: item.height } : {})
    };
  }

  if (type === 'video') {
    const provider = typeof item.provider === 'string' ? item.provider.toLowerCase() : '';
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const providerPattern = EMBED_PROVIDER_IDS[provider];
    const poster = isSafeAssetUrl(item.poster) ? item.poster : '';

    if (providerPattern?.test(id)) {
      return {
        type,
        provider,
        id,
        title,
        ...(caption ? { caption } : {})
      };
    }
    if (!isSafeAssetUrl(item.src)) return null;
    return {
      type,
      src: item.src,
      title,
      ...(poster ? { poster } : {}),
      ...(caption ? { caption } : {})
    };
  }

  if (type === 'audio' && isSafeAssetUrl(item.src)) {
    return {
      type,
      src: item.src,
      title,
      ...(caption ? { caption } : {})
    };
  }

  return null;
}

function sanitizeLegacyHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html);
  const allowed = new Set(['A', 'BR', 'STRONG', 'EM', 'P', 'UL', 'OL', 'LI']);

  template.content.querySelectorAll('*').forEach(element => {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      return;
    }

    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    if (element.tagName === 'A') {
      const original = element.getAttribute('data-safe-href');
      void original;
    }
  });

  // Reparse links separately so only safe href values survive the attribute scrub.
  const source = document.createElement('template');
  source.innerHTML = String(html);
  const sourceLinks = [...source.content.querySelectorAll('a')];
  const cleanLinks = [...template.content.querySelectorAll('a')];
  cleanLinks.forEach((link, index) => {
    const href = sourceLinks[index]?.getAttribute('href') || '';
    if (isSafeUrl(href)) {
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });

  return template.innerHTML;
}

function renderProjectBody(project) {
  const blocks = Array.isArray(project.body) ? project.body : [];
  if (!blocks.length) return `<p>${escapeHtml(project.summary || '')}</p>`;

  return blocks.map(block => {
    if (!block || typeof block !== 'object') return '';
    if (block.type === 'legacyHtml') return sanitizeLegacyHtml(block.html || '');
    if (block.type === 'paragraph') return `<p>${escapeHtml(block.text || '')}</p>`;
    if (block.type === 'heading') return `<h3>${escapeHtml(block.text || '')}</h3>`;
    if (block.type === 'quote') return `<blockquote>${escapeHtml(block.text || '')}</blockquote>`;
    if (block.type === 'list' && Array.isArray(block.items)) {
      return `<ul>${block.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    return '';
  }).join('');
}

function normalizeProject(raw, source, index) {
  const id = String(raw.id || `${source.id || 'work'}-${index + 1}`);
  const tracks = Array.isArray(raw.tracks) && raw.tracks.length
    ? raw.tracks
    : (source.defaultTracks || source.source?.defaultTracks || ['programming']);
  const medium = raw.medium || raw.category || 'project';
  const summary = raw.summary || raw.short || '';
  const cover = typeof raw.cover === 'string'
    ? { src: raw.cover, alt: `${raw.title || 'Project'} cover` }
    : (raw.cover || (raw.image ? { src: raw.image, alt: `${raw.title || 'Project'} cover` } : null));

  const media = Array.isArray(raw.media)
    ? raw.media.map((item, mediaIndex) => normalizeMediaItem(item, raw.title, mediaIndex)).filter(Boolean)
    : (raw.gallery || (raw.image ? [raw.image] : []))
      .filter(src => isSafeAssetUrl(src))
      .map((src, mediaIndex) => ({
        type: 'image',
        src,
        alt: `${raw.title || 'Project'} — visual ${mediaIndex + 1}`
      }));

  const links = (raw.links || [])
    .filter(link => link && isSafeUrl(link.href))
    .map(link => ({ kind: link.kind || 'external', href: link.href, label: link.label || 'open project' }));

  return {
    ...raw,
    id,
    title: raw.title || 'Untitled',
    tracks: [...new Set(tracks)],
    medium,
    category: raw.category || medium,
    summary,
    body: Array.isArray(raw.body) ? raw.body : [{ type: 'legacyHtml', html: raw.long || summary }],
    cover,
    media,
    links,
    sourceId: source.id || source.source?.id || 'inline',
    sourceIndex: index
  };
}

function taxonomyItem(type, id) {
  return catalogState.manifest?.catalog?.[type]?.find(item => item.id === id) || null;
}

function getMediumLabel(id) {
  return taxonomyItem('mediums', id)?.label || String(id || 'project').replace(/_/g, ' ');
}

function getProjectAccent(project) {
  return taxonomyItem('mediums', project.medium)?.accent
    || taxonomyItem('tracks', project.tracks[0])?.accent
    || '#A8FF51';
}

function renderProjectCard(project, index) {
  const card = document.createElement('article');
  const isVisual = project.tracks.includes('arts') && project.cover?.src;
  const titleId = `project-title-${project.id.replace(/[^a-z0-9_-]/gi, '-')}`;
  const tilt = [-1.1, 0.7, -0.35, 0.9, -0.65, 0.25][index % 6];

  card.className = `project-card${isVisual ? ' project-card--visual' : ''}`;
  card.dataset.project = project.id;
  card.dataset.medium = project.medium;
  card.dataset.tracks = project.tracks.join(' ');
  card.style.setProperty('--accent', getProjectAccent(project));
  card.style.setProperty('--card-tilt', `${tilt}deg`);

  const coverHtml = isVisual ? `
    <figure class="project-card-cover">
      <img src="${escapeHtml(project.cover.src)}" alt="${escapeHtml(project.cover.alt || `${project.title} cover`)}" loading="lazy" decoding="async" />
    </figure>` : '';
  const tags = project.tags || project.technical?.stack || project.roles || [];

  card.innerHTML = `
    ${coverHtml}
    <div class="project-card-header">
      <div class="project-icon" aria-hidden="true"><span>${escapeHtml(project.title.charAt(0).toLowerCase() || '?')}</span></div>
      <div class="project-header-text">
        <h3 id="${titleId}">${escapeHtml(project.title)}</h3>
        <p class="project-type">${escapeHtml(getMediumLabel(project.medium))}</p>
      </div>
    </div>
    <div class="project-card-body">
      <p class="project-description">${escapeHtml(project.summary)}</p>
      ${tags.length ? `<div class="project-tags">${tags.slice(0, 5).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="project-card-footer">
      <button class="project-expand-btn" type="button" data-project-id="${escapeHtml(project.id)}" aria-haspopup="dialog" aria-controls="project-modal" aria-describedby="${titleId}">
        <span>${isVisual ? 'enter work' : 'open dossier'}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>`;

  return card;
}

async function loadProjects() {
  const grid = document.querySelector('.projects-grid');
  const results = document.getElementById('project-results');
  if (!grid) return;

  try {
    const res = await fetch('content.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to fetch content.json');
    const manifest = await res.json();
    catalogState.manifest = manifest;
    catalogState.sourceErrors = [];
    const intro = document.querySelector('.projects-intro');
    const kicker = document.querySelector('.projects-kicker');
    if (intro && manifest.siteHeader?.subtitle) intro.textContent = manifest.siteHeader.subtitle;
    if (kicker && manifest.siteHeader?.kicker) kicker.textContent = manifest.siteHeader.kicker;

    const inlineProjects = Array.isArray(manifest.projects)
      ? manifest.projects.map((project, index) => normalizeProject(project, { id: 'inline', defaultTracks: ['programming'] }, index))
      : [];
    const sources = manifest.catalog?.sources || [];
    const sourcePayloads = await Promise.all(sources.map(async source => {
      try {
        const response = await fetch(source.src, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`${source.src} returned ${response.status}`);
        const payload = await response.json();
        const defaults = payload.source?.defaultTracks || source.defaultTracks || [];
        return (payload.works || []).map((project, index) => normalizeProject(project, { ...source, defaultTracks: defaults }, index));
      } catch (error) {
        catalogState.sourceErrors.push({ source: source.id, message: error.message });
        return [];
      }
    }));

    const seenIds = new Set();
    catalogState.projects = [...inlineProjects, ...sourcePayloads.flat()].filter(project => {
      if (seenIds.has(project.id)) {
        console.warn(`Skipping duplicate project id: ${project.id}`);
        return false;
      }
      seenIds.add(project.id);
      return true;
    });
    catalogState.projectMap = new Map(catalogState.projects.map(project => [project.id, project]));
    window.projectMap = Object.fromEntries(catalogState.projectMap);

    grid.replaceChildren();
    const frag = document.createDocumentFragment();
    catalogState.projects.forEach((project, index) => frag.appendChild(renderProjectCard(project, index)));
    grid.appendChild(frag);

    initCatalogControls();
    renderMediumFilters();
    applyProjectFilters({ announce: true });

    if (!grid.dataset.modalBound) {
      grid.dataset.modalBound = 'true';
      grid.addEventListener('click', event => {
        const button = event.target.closest('.project-expand-btn');
        if (button) openProjectModal(button);
      });
    }

    if (typeof openProjectFromHash === 'function') openProjectFromHash();
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="projects-load-error">the archive failed to answer. refresh the signal and try again.</p>';
    if (results) results.textContent = 'archive unavailable';
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
  let sampleTimer = null;
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
            width: { ideal: 640 },
            height: { ideal: 360 }
          }
        });
        isFrontCamera = true;
        usedCamera = true;
      } catch (errFront) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 640 },
              height: { ideal: 360 }
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

  function syncAsciiButtonVisibility() {
    const shouldShow = active && asciiSupported;
    asciiBtn.hidden = !shouldShow;
    asciiBtn.disabled = !shouldShow;
    asciiBtn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    asciiBtn.classList.toggle('visible', shouldShow);
    asciiBtn.classList.toggle('enabled', shouldShow);
    asciiBtn.style.display = shouldShow ? 'flex' : 'none';
  }

  function startSampling(stream) {
    active = true;
    asciiSupported = true;
    btn.classList.add('active');
    syncAsciiButtonVisibility();
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
    if (document.visibilityState === 'visible' && videoEl.readyState >= 2) {
      if (asciiActive) {
        applyAsciiFrame();
      } else {
        applyAverageColour();
      }
    }

    lastSampleAt = now;
    sampleTimer = setTimeout(() => requestAnimationFrame(sampleLoop), 1000 / targetFps);
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
    syncAsciiButtonVisibility();

    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    if (videoEl) videoEl.remove();
    videoStream = null;
    videoEl = null;
    averageCanvas = null;
    averageCtx = null;
    asciiCanvas = null;
    asciiCtx = null;
    clearTimeout(sampleTimer);
    sampleTimer = null;

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
    syncAsciiButtonVisibility();
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

function syncCardActionAvailability() {
  const visibleCount = document.querySelectorAll('.projects-grid .project-card:not([hidden])').length;
  document.querySelectorAll('.stack-cards-btn, .shuffle-cards-btn').forEach(button => {
    const disabled = cardActionInProgress || visibleCount < 2;
    button.disabled = disabled;
    button.classList.toggle('disabled', disabled);
    button.style.pointerEvents = disabled ? 'none' : '';
    button.style.opacity = disabled ? '0.5' : '';
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
  if (!grid) {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
    syncCardActionAvailability();
    return;
  }
  const cards = Array.from(grid.querySelectorAll('.project-card:not([hidden])'));
  if (!cards.length) {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
    syncCardActionAvailability();
    return;
  }

  const gridRect = grid.getBoundingClientRect();
  const centerX = gridRect.left + gridRect.width / 2;
  const tallestCard = Math.max(...cards.map(card => card.offsetHeight));
  const stackClearance = Math.max(18, Math.min(40, gridRect.width * 0.025));
  const centerY = gridRect.top + (tallestCard / 2) + stackClearance;
  const stackSpread = Math.min(10, 3 + (cards.length * 0.35));

  // Create satisfying stacking animation with momentum
  const tl = gsap.timeline({
    onComplete: () => {
      cardActionInProgress = false;
      setCardActionButtonsDisabled(false);
      syncCardActionAvailability();
    }
  });

  const eased = gsap.parseEase('steps(6)');
  cards.forEach((card, idx) => {
    // Reset any drag offsets gradually
    const currentX = Number(gsap.getProperty(card, 'x')) || 0;
    const currentY = Number(gsap.getProperty(card, 'y')) || 0;

    const rect = card.getBoundingClientRect();
    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;

    const deltaX = centerX - cardCenterX;
    const deltaY = centerY - cardCenterY;
    const stackPosition = cards.length > 1 ? (idx / (cards.length - 1)) - 0.5 : 0;
    const restingRotation = (stackPosition * stackSpread)
      + ((Math.random() - 0.5) * (PERF.isLowEnd ? 0.4 : 0.7));

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
      rotation: restingRotation,
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
  if (!grid) {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
    syncCardActionAvailability();
    return;
  }
  const cards = Array.from(grid.querySelectorAll('.project-card:not([hidden])'));
  if (!cards.length) {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
    syncCardActionAvailability();
    return;
  }

  // Reset any transforms so layout is authoritative
  cards.forEach(card => {
    const tilt = Number.parseFloat(
      window.getComputedStyle(card).getPropertyValue('--card-tilt')
    ) || 0;
    gsap.set(card, { x: 0, y: 0, rotation: tilt, scale: 1 });
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
          syncCardActionAvailability();
        }
      });
    }
  });
}

/* ------------------- Filter Functionality ------------------- */
let catalogControlsBound = false;

function initCatalogControls() {
  if (catalogControlsBound) return;
  catalogControlsBound = true;

  document.querySelectorAll('.work-lens').forEach(button => {
    button.addEventListener('click', () => {
      const track = button.dataset.track || 'all';
      if (track === catalogState.track) return;

      catalogState.track = track;
      catalogState.medium = 'all';
      document.querySelectorAll('.work-lens').forEach(lens => {
        const active = lens.dataset.track === track;
        lens.classList.toggle('active', active);
        lens.setAttribute('aria-pressed', String(active));
      });
      renderMediumFilters();
      applyProjectFilters({ announce: true, animate: true });
    });
  });

  document.querySelector('.stack-cards-btn')?.addEventListener('click', stackProjectCards);
  document.querySelector('.shuffle-cards-btn')?.addEventListener('click', shuffleProjectCards);
  document.querySelector('.filter-cards-btn')?.addEventListener('click', toggleFilterDropdown);

  const dropdown = document.getElementById('filter-dropdown');
  dropdown?.addEventListener('click', event => {
    const option = event.target.closest('[data-medium]');
    if (!option) return;
    filterProjects(option.dataset.medium || 'all');
  });
  dropdown?.addEventListener('keydown', event => {
    const options = [...dropdown.querySelectorAll('[data-medium]')];
    const currentIndex = options.indexOf(document.activeElement);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + options.length) % options.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = options.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFilterDropdown();
      document.querySelector('.filter-cards-btn')?.focus({ preventScroll: true });
      return;
    } else return;

    event.preventDefault();
    options[nextIndex]?.focus({ preventScroll: true });
  });
}

function availableProjectsForTrack() {
  return catalogState.projects.filter(project => (
    catalogState.track === 'all' || project.tracks.includes(catalogState.track)
  ));
}

function renderMediumFilters() {
  const dropdown = document.getElementById('filter-dropdown');
  if (!dropdown) return;

  const availableIds = new Set(availableProjectsForTrack().map(project => project.medium));
  const taxonomy = catalogState.manifest?.catalog?.mediums || [];
  const mediums = taxonomy.filter(item => availableIds.has(item.id));

  dropdown.innerHTML = [
    { id: 'all', label: 'all media', accent: '#A8FF51' },
    ...mediums
  ].map(item => `
    <button class="filter-option${catalogState.medium === item.id ? ' active' : ''}" type="button" role="menuitemradio" aria-checked="${catalogState.medium === item.id}" data-medium="${escapeHtml(item.id)}">
      <span class="filter-dot" style="--filter-accent: ${escapeHtml(item.accent || '#A8FF51')}"></span>
      ${escapeHtml(item.label)}
    </button>
  `).join('');
}

function toggleFilterDropdown() {
  const dropdown = document.getElementById('filter-dropdown');
  const button = document.querySelector('.filter-cards-btn');
  
  if (!dropdown || !button) return;
  
  const willOpen = dropdown.hidden;
  dropdown.hidden = !willOpen;
  dropdown.classList.toggle('show', willOpen);
  button.classList.toggle('active', willOpen);
  button.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    requestAnimationFrame(() => {
      (dropdown.querySelector('[aria-checked="true"]') || dropdown.querySelector('[data-medium]'))?.focus({ preventScroll: true });
    });
  }
}

function closeFilterDropdown() {
  const dropdown = document.getElementById('filter-dropdown');
  const button = document.querySelector('.filter-cards-btn');
  if (!dropdown || !button) return;
  dropdown.hidden = true;
  dropdown.classList.remove('show');
  button.classList.remove('active');
  button.setAttribute('aria-expanded', 'false');
}

function filterProjects(medium) {
  catalogState.medium = medium || 'all';
  renderMediumFilters();
  closeFilterDropdown();
  applyProjectFilters({ announce: true, animate: true });
  requestAnimationFrame(() => document.querySelector('.filter-cards-btn')?.focus({ preventScroll: true }));
}

function applyProjectFilters({ announce = false, animate = false } = {}) {
  const grid = document.querySelector('.projects-grid');
  const results = document.getElementById('project-results');
  const empty = document.getElementById('projects-empty');
  const filterButton = document.querySelector('.filter-cards-btn');
  if (!grid) return;

  let visibleCount = 0;
  grid.querySelectorAll('.project-card').forEach(card => {
    const project = catalogState.projectMap.get(card.dataset.project);
    const trackMatches = catalogState.track === 'all' || project?.tracks.includes(catalogState.track);
    const mediumMatches = catalogState.medium === 'all' || project?.medium === catalogState.medium;
    const matches = Boolean(trackMatches && mediumMatches);
    card.hidden = !matches;
    card.setAttribute('aria-hidden', String(!matches));

    if (matches) {
      visibleCount++;
      if (animate && !PERF.prefersReducedMotion) {
        card.classList.remove('filter-arrival');
        requestAnimationFrame(() => {
          const clearArrival = event => {
            if (event.animationName !== 'filterArrival') return;
            card.classList.remove('filter-arrival');
            card.removeEventListener('animationend', clearArrival);
          };
          card.addEventListener('animationend', clearArrival);
          card.classList.add('filter-arrival');
        });
      }
    }
  });

  if (empty) {
    empty.hidden = visibleCount > 0;
    const title = empty.querySelector('h2');
    const copy = empty.querySelector('p');
    if (catalogState.track === 'arts') {
      if (title) title.textContent = 'the darkroom is still developing';
      if (copy) copy.textContent = 'film and art projects will surface here through their own publishing path.';
    } else {
      if (title) title.textContent = 'no card answered that call';
      if (copy) copy.textContent = 'choose another medium to return a signal.';
    }
  }

  if (filterButton) {
    const label = catalogState.medium === 'all' ? 'all' : getMediumLabel(catalogState.medium);
    filterButton.childNodes[0].nodeValue = `medium: ${label} `;
  }

  document.querySelectorAll('.work-lens').forEach(lens => {
    const track = lens.dataset.track;
    const count = catalogState.projects.filter(project => track === 'all' || project.tracks.includes(track)).length;
    lens.style.setProperty('--lens-count', `"${count}"`);
  });

  syncCardActionAvailability();

  if (results) {
    const trackLabel = catalogState.track === 'all'
      ? 'all signals'
      : (taxonomyItem('tracks', catalogState.track)?.label || catalogState.track);
    const degraded = catalogState.sourceErrors.length ? ' // one feed is quiet' : '';
    results.textContent = `${visibleCount} ${visibleCount === 1 ? 'artifact' : 'artifacts'} // ${trackLabel}${degraded}`;
    if (!announce) results.setAttribute('aria-live', 'off');
    else results.setAttribute('aria-live', 'polite');
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const dropdown = document.getElementById('filter-dropdown');
  const container = document.querySelector('.filter-dropdown-container');
  
  if (dropdown && container && !container.contains(event.target)) {
    closeFilterDropdown();
  }
});
/* ----------------- End Card Stack & Shuffle Controls ----------------- */ 

