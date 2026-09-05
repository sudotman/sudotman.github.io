// Projects Reveal Functions
function revealProjects() {
  const dotsContainer = document.querySelector('.dots-container');
  const projectsContent = document.getElementById('projects-content');
  const centerIcon = document.querySelector('.osmo-icon__link');
  const tldrButton = document.querySelector('.website-link.is--alt');
  
  if (dotsContainer && projectsContent && centerIcon) {
    // Hide center icon first
    centerIcon.classList.add('hidden');
    centerIcon.disabled = true;
    centerIcon.setAttribute('aria-hidden', 'true');
    document.body.classList.add('deck-open');
    document.querySelector('.station-intro')?.setAttribute('inert', '');
    if (tldrButton) tldrButton.hidden = true;
    projectsContent.setAttribute('aria-hidden', 'false');
    // Animate dots to disperse
    setTimeout(() => {
      animateDotsDisperse();
    }, PERF.prefersReducedMotion ? 0 : 120);
    
    // Show projects content as dots start dispersing
    setTimeout(() => {
      projectsContent.classList.add('revealed');
      projectsContent.focus({ preventScroll: true });
    }, PERF.prefersReducedMotion ? 0 : 280);
  }
}

function returnToDots() {
  const dotsContainer = document.querySelector('.dots-container');
  const projectsContent = document.getElementById('projects-content');
  const centerIcon = document.querySelector('.osmo-icon__link');
  const tldrButton = document.querySelector('.website-link.is--alt');

  if (typeof closeFilterDropdown === 'function') closeFilterDropdown();
  
  if (dotsContainer && projectsContent && centerIcon) {
    // Leaving with a stacked or dragged deck used to mean returning to a pile
    // of cards parked wherever the last animation left them.
    if (typeof resetCardTransforms === 'function') resetCardTransforms();

    // Hide projects content
    projectsContent.classList.remove('revealed');
    projectsContent.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('deck-open');
    document.querySelector('.station-intro')?.removeAttribute('inert');
    if (tldrButton) tldrButton.hidden = false;
    
    // Animate dots back to normal
    setTimeout(() => {
      animateDotsReturn();
    }, PERF.prefersReducedMotion ? 0 : 180);
    
    // Show center icon after dots are back
    setTimeout(() => {
      centerIcon.classList.remove('hidden');
      centerIcon.disabled = false;
      centerIcon.setAttribute('aria-hidden', 'false');
      centerIcon.focus({ preventScroll: true });
    }, PERF.prefersReducedMotion ? 0 : 520);
  }
}

function animateDotsDisperse() {
  const field = getPrimaryDotField();
  if (!field) return;

  if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
    gsap.to(field, {
      disperse: 1,
      duration: 0.75,
      ease: 'power2.inOut',
      onUpdate: () => field.requestRender()
    });
  } else {
    field.setDisperse(1);
  }
}

function animateDotsReturn() {
  const field = getPrimaryDotField();
  if (!field) return;

  if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
    gsap.to(field, {
      disperse: 0,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => field.requestRender()
    });
  } else {
    field.setDisperse(0);
  }
}

function toggleProjectDetails(button) {
  // Repurposed: open the project modal instead of expanding inline details
  openProjectModal(button);
}

let bodyScrollLockDepth = 0;
let bodyScrollLockY = 0;

function syncBodyScrollLock() {
  const shouldLock = document.body.classList.contains('modal-open') || document.body.classList.contains('lightbox-open');

  if (shouldLock) {
    if (bodyScrollLockDepth === 0) {
      bodyScrollLockY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${bodyScrollLockY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
    }
    bodyScrollLockDepth = 1;
    return;
  }

  if (bodyScrollLockDepth > 0) {
    const restoreY = Math.abs(parseInt(document.body.style.top || '0', 10)) || bodyScrollLockY;
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    bodyScrollLockDepth = 0;
    bodyScrollLockY = 0;
    window.scrollTo(0, restoreY);
  }
}

function setBodyOverlayState(className, enabled) {
  document.body.classList.toggle(className, enabled);
  syncBodyScrollLock();
}

const dialogStack = [];

function focusableElements(container) {
  return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, video[controls], audio[controls], [contenteditable="true"], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getClientRects().length > 0);
}

function activateDialog(modal, trigger = document.activeElement) {
  if (!modal) return;
  const existingIndex = dialogStack.findIndex(entry => entry.modal === modal);
  if (existingIndex >= 0) dialogStack.splice(existingIndex, 1);
  dialogStack.push({ modal, trigger });
  modal.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    const preferred = modal.querySelector('[data-dialog-initial-focus], .project-modal-close, .tldr-modal-close, .sites-modal-close, .lightbox-close');
    (preferred || modal.querySelector('[tabindex="-1"]') || modal).focus({ preventScroll: true });
  });
}

function deactivateDialog(modal, { restoreFocus = true } = {}) {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  const index = dialogStack.findIndex(entry => entry.modal === modal);
  const [entry] = index >= 0 ? dialogStack.splice(index, 1) : [];

  if (restoreFocus && entry?.trigger?.isConnected) {
    requestAnimationFrame(() => entry.trigger.focus({ preventScroll: true }));
  }
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || !dialogStack.length) return;
  const modal = dialogStack[dialogStack.length - 1].modal;
  const focusables = focusableElements(modal);
  if (!focusables.length) {
    event.preventDefault();
    modal.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// TLDR Modal Functions
function openTldrModal() {
  const modal = document.getElementById('tldr-modal');
  if (modal) {
    modal.classList.add('show');
    setBodyOverlayState('modal-open', true);
    activateDialog(modal, document.getElementById('tldr-btn'));
    
    // Add smooth animation using GSAP if available
    if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
      gsap.fromTo(modal.querySelector('.tldr-modal-content'), 
        { y: -50, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "power2.out" }
      );
    }
  }
}

function closeTldrModal() {
  const modal = document.getElementById('tldr-modal');
  if (modal && modal.classList.contains('show')) {
    // Add smooth animation using GSAP if available
    if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
      gsap.to(modal.querySelector('.tldr-modal-content'), {
        y: -30,
        opacity: 0,
        scale: 0.95,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          modal.classList.remove('show');
          deactivateDialog(modal);
          setBodyOverlayState('modal-open', false);
        }
      });
    } else {
      modal.classList.remove('show');
      deactivateDialog(modal);
      setBodyOverlayState('modal-open', false);
    }
  }
}

// Sites Modal Functions
function openSitesModal() {
  const modal = document.getElementById('sites-modal');
  if (modal) {
    modal.classList.add('show');
    setBodyOverlayState('modal-open', true);
    activateDialog(modal, document.getElementById('sites-btn'));
    if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
      gsap.fromTo(modal.querySelector('.sites-modal-content'), { y: -40, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
    }
  }
}

function closeSitesModal() {
  const modal = document.getElementById('sites-modal');
  if (modal && modal.classList.contains('show')) {
    if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
      gsap.to(modal.querySelector('.sites-modal-content'), { y: -20, opacity: 0, scale: 0.97, duration: 0.2, ease: 'power2.in', onComplete: () => {
        modal.classList.remove('show');
        deactivateDialog(modal);
        setBodyOverlayState('modal-open', false);
      } });
    } else {
      modal.classList.remove('show');
      deactivateDialog(modal);
      setBodyOverlayState('modal-open', false);
    }
  }
}

// ---------------- Project Modal (dynamic) ----------------
let projectModalPreviousHash = '';
let projectMediaObserver = null;

function renderMetadataList(items = []) {
  if (!items.length) return '';
  return `<dl class="project-modal-facts">${items.map(item => `
    <div class="project-modal-fact">
      <dt>${escapeHtml(item.label)}</dt>
      <dd>${escapeHtml(Array.isArray(item.value) ? item.value.join(', ') : item.value)}</dd>
    </div>`).join('')}</dl>`;
}

function getMediaEmbedUrl(item) {
  const provider = String(item?.provider || '').toLowerCase();
  const id = String(item?.id || '').trim();
  if (provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  }
  if (provider === 'vimeo' && /^\d{1,12}$/.test(id)) {
    return `https://player.vimeo.com/video/${encodeURIComponent(id)}?dnt=1`;
  }
  return '';
}

function renderPlayableMedia(item, index) {
  const title = item.title || `Project ${item.type} ${index + 1}`;
  const caption = item.caption ? `<span class="project-modal-media-caption">${escapeHtml(item.caption)}</span>` : '';
  const captionHtml = `<figcaption><span class="project-modal-media-title">${escapeHtml(title)}</span>${caption}</figcaption>`;

  if (item.type === 'video') {
    const embedUrl = getMediaEmbedUrl(item);
    if (embedUrl) {
      return `<figure class="project-modal-media-item project-modal-media-item--video">
        <div class="project-modal-media-frame project-modal-embed" data-project-media-kind="embed" data-project-media-src="${escapeHtml(embedUrl)}" data-project-media-title="${escapeHtml(title)}">
          <div class="project-modal-media-placeholder" aria-hidden="true">
            <span class="project-modal-media-sigil">◉</span>
            <span>${escapeHtml(item.provider)} transmission // awaiting viewport</span>
          </div>
          <span class="sr-only">${escapeHtml(title)} video player loads when visible.</span>
        </div>
        ${captionHtml}
      </figure>`;
    }

    if (item.src) {
      return `<figure class="project-modal-media-item project-modal-media-item--video">
        <video class="project-modal-media-frame project-modal-video" controls playsinline preload="none" aria-label="${escapeHtml(title)}" data-project-media-kind="video" data-project-media-src="${escapeHtml(item.src)}"${item.poster ? ` data-project-media-poster="${escapeHtml(item.poster)}"` : ''}></video>
        ${captionHtml}
      </figure>`;
    }
  }

  if (item.type === 'audio' && item.src) {
    return `<figure class="project-modal-media-item project-modal-media-item--audio">
      <div class="project-modal-audio-shell">
        <span class="project-modal-audio-mark" aria-hidden="true">∿</span>
        <audio class="project-modal-audio" controls preload="none" aria-label="${escapeHtml(title)}" data-project-media-kind="audio" data-project-media-src="${escapeHtml(item.src)}"></audio>
      </div>
      ${captionHtml}
    </figure>`;
  }

  return '';
}

function hydrateModalAsset(target) {
  if (!target) return;

  if (target.matches('.project-modal-img[data-src]')) {
    target.src = target.dataset.src;
    target.removeAttribute('data-src');
    return;
  }

  const src = target.dataset.projectMediaSrc;
  if (!src) return;

  if (target.dataset.projectMediaKind === 'embed') {
    const frame = document.createElement('iframe');
    frame.className = 'project-modal-embed-frame';
    frame.src = src;
    frame.title = target.dataset.projectMediaTitle || 'Project video';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    target.replaceChildren(frame);
    target.classList.add('is-hydrated');
  } else if (target instanceof HTMLMediaElement) {
    if (target.dataset.projectMediaPoster && target instanceof HTMLVideoElement) {
      target.poster = target.dataset.projectMediaPoster;
      target.removeAttribute('data-project-media-poster');
    }
    target.src = src;
    target.load();
  }

  target.removeAttribute('data-project-media-src');
}

function hydrateModalMedia(modal) {
  projectMediaObserver?.disconnect();
  const pending = [...modal.querySelectorAll('.project-modal-img[data-src], [data-project-media-src]')];
  if (!pending.length) return;

  if (!('IntersectionObserver' in window)) {
    pending.forEach(hydrateModalAsset);
    return;
  }

  projectMediaObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      hydrateModalAsset(entry.target);
      projectMediaObserver.unobserve(entry.target);
    });
  }, { root: modal.querySelector('.project-modal-body'), rootMargin: '80px 0px' });

  pending.forEach(target => projectMediaObserver.observe(target));
}

function teardownProjectModalMedia(modal) {
  projectMediaObserver?.disconnect();
  projectMediaObserver = null;

  modal.querySelectorAll('video, audio').forEach(media => {
    media.pause();
    media.removeAttribute('src');
    media.load();
  });
  modal.querySelectorAll('.project-modal-embed-frame').forEach(frame => {
    frame.src = 'about:blank';
    frame.remove();
  });
}

function openProjectModal(button, options = {}) {
  const projectId = button?.dataset?.projectId || button?.closest('.project-card')?.dataset?.project;
  if (!projectId || !window.projectMap) return;

  const project = window.projectMap[projectId];
  if (!project) return;

  const modal = document.getElementById('project-modal');
  if (!modal) return;

  // Cancel any in-progress GSAP tweens from a previous close
  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(modal.querySelector('.project-modal-content'));
  }
  modal.classList.add('show'); // Ensure visible before populating
  setBodyOverlayState('modal-open', true);

  const body = modal.querySelector('.project-modal-body');
  if (!body) return;

  const images = (project.media || []).filter(item => item.type === 'image' && item.src);
  const playableMedia = (project.media || []).filter(item => ['video', 'audio'].includes(item.type));
  const playableMediaHtml = playableMedia.map(renderPlayableMedia).filter(Boolean).join('');
  const trackLabels = (project.tracks || []).map(track => (
    window.projectCatalog?.manifest?.catalog?.tracks?.find(item => item.id === track)?.label || track
  ));
  const technicalFacts = project.technical ? [
    project.technical.stack?.length ? { label: 'stack', value: project.technical.stack } : null,
    project.technical.platforms?.length ? { label: 'platforms', value: project.technical.platforms } : null,
    project.technical.status ? { label: 'status', value: project.technical.status } : null
  ].filter(Boolean) : [];
  const productionFacts = project.production ? [
    project.production.runtimeMinutes ? { label: 'runtime', value: `${project.production.runtimeMinutes} min` } : null,
    project.production.format ? { label: 'format', value: project.production.format } : null,
    project.production.languages?.length ? { label: 'languages', value: project.production.languages } : null
  ].filter(Boolean) : [];

  body.innerHTML = `
    <div class="project-modal-layout">
      <div class="project-modal-header-section">
        <div class="project-modal-category">${escapeHtml(trackLabels.join(' + ') || 'archive')} // ${escapeHtml(getMediumLabel(project.medium))}</div>
        <h2 class="project-modal-title" id="project-modal-title">${escapeHtml(project.title || '')}</h2>
        <div class="project-modal-divider"></div>
      </div>
      
      <div class="project-modal-content-grid">
        <div class="project-modal-main-content">
          <div class="project-modal-description-section">
            <h3 class="project-modal-section-title">the dossier</h3>
            <div class="project-modal-description">${renderProjectBody(project)}</div>
          </div>

          ${technicalFacts.length ? `
          <div class="project-modal-facts-section">
            <h3 class="project-modal-section-title">system notes</h3>
            ${renderMetadataList(technicalFacts)}
          </div>` : ''}

          ${productionFacts.length ? `
          <div class="project-modal-facts-section">
            <h3 class="project-modal-section-title">production notes</h3>
            ${renderMetadataList(productionFacts)}
          </div>` : ''}
          
          ${project.links && project.links.length ? `
          <div class="project-modal-links-section">
            <h3 class="project-modal-section-title">portals</h3>
            <div class="project-modal-links">
              ${project.links.map(l => `
                <a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer" class="project-modal-link">
                  <div class="project-modal-link-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 0L10.5 5.5L16 8L10.5 10.5L8 16L5.5 10.5L0 8L5.5 5.5L8 0Z" fill="currentColor"/>
                    </svg>
                  </div>
                  <span class="project-modal-link-text">${escapeHtml(l.label || 'open project')}</span>
                  <div class="project-modal-link-arrow">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 11L11 1M11 1H1M11 1V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
          ` : ''}
        </div>
        
        ${playableMediaHtml || images.length ? `<div class="project-modal-evidence">
          ${playableMediaHtml ? `<div class="project-modal-media-section">
            <h3 class="project-modal-section-title">screenings + sound</h3>
            <div class="project-modal-media-list">${playableMediaHtml}</div>
          </div>` : ''}
          ${images.length ? `<div class="project-modal-gallery-section">
            <h3 class="project-modal-section-title">${project.tracks?.includes('arts') ? 'frames' : 'visual evidence'}</h3>
            <div class="project-modal-gallery">
              ${images.map((item, index) => `
                <button class="project-modal-img-container" type="button" data-index="${index}" aria-label="Open visual ${index + 1} of ${images.length}">
                  <img ${index === 0 ? `src="${escapeHtml(item.thumbnail || item.src)}"` : `src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="${escapeHtml(item.thumbnail || item.src)}"`} alt="${escapeHtml(item.alt || `${project.title} — visual ${index + 1}`)}" class="project-modal-img" loading="lazy" decoding="async"/>
                  <div class="project-modal-img-overlay">
                    <div class="project-modal-img-expand">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 3H21V9M14 10L21 3M9 21H3V15M10 14L3 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </button>
              `).join('')}
            </div>
          </div>` : ''}
        </div>` : ''}
      </div>
      
      <div class="project-modal-footer">
        <div class="project-modal-metadata">
          <div class="metadata-item">
            <span class="metadata-label">category</span>
            <span class="metadata-value">${escapeHtml(getMediumLabel(project.medium))}</span>
          </div>
          ${images.length > 1 ? `
          <div class="metadata-item">
            <span class="metadata-label">gallery</span>
            <span class="metadata-value">${images.length} ${project.tracks?.includes('arts') ? 'frames' : 'images'}</span>
          </div>
          ` : ''}
          ${playableMedia.length ? `
          <div class="metadata-item">
            <span class="metadata-label">playback</span>
            <span class="metadata-value">${playableMedia.length} ${playableMedia.length === 1 ? 'piece' : 'pieces'}</span>
          </div>
          ` : ''}
          ${project.links && project.links.length ? `
          <div class="metadata-item">
            <span class="metadata-label">links</span>
            <span class="metadata-value">${project.links.length} available</span>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  body.onclick = event => {
    const container = event.target.closest('.project-modal-img-container');
    if (!container) return;
    openImageLightbox(images, Number.parseInt(container.dataset.index, 10) || 0, container);
  };
  const hydrateInteractiveMedia = event => hydrateModalAsset(event.target.closest('[data-project-media-src]'));
  body.onpointerdown = hydrateInteractiveMedia;
  body.onfocusin = hydrateInteractiveMedia;
  hydrateModalMedia(modal);

  if (options.updateHash !== false) {
    projectModalPreviousHash = window.location.hash.startsWith('#work/') ? '' : window.location.hash;
    history.replaceState(null, '', `#work/${encodeURIComponent(project.id)}`);
  }

  activateDialog(modal, button instanceof Element ? button : document.activeElement);

  if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
    gsap.fromTo(modal.querySelector('.project-modal-content'), { y: -40, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
  }
}

function openProjectFromHash() {
  if (!window.location.hash.startsWith('#work/')) return;
  let projectId;
  try {
    projectId = decodeURIComponent(window.location.hash.slice(6));
  } catch (_) {
    return;
  }
  const button = [...document.querySelectorAll('.project-expand-btn')]
    .find(candidate => candidate.dataset.projectId === projectId);
  if (!button) return;
  if (!document.body.classList.contains('deck-open')) revealProjects();
  setTimeout(() => openProjectModal(button, { updateHash: false }), PERF.prefersReducedMotion ? 0 : 320);
}

// Image Lightbox functionality
function openImageLightbox(media, currentIndex = 0, trigger = document.activeElement) {
  if (!Array.isArray(media) || !media.length) return;

  let lightbox = document.getElementById('image-lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'image-lightbox';
    lightbox.className = 'image-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Project image viewer');
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.tabIndex = -1;
    lightbox.innerHTML = '<div class="lightbox-backdrop" aria-hidden="true"></div><div class="lightbox-content" tabindex="-1"></div>';
    document.body.appendChild(lightbox);

    lightbox.addEventListener('click', event => {
      const action = event.target.closest('[data-lightbox-action]')?.dataset.lightboxAction;
      if (action === 'close' || event.target.classList.contains('lightbox-backdrop')) closeImageLightbox();
      else if (action === 'previous') navigateLightbox(window.currentLightboxIndex - 1);
      else if (action === 'next') navigateLightbox(window.currentLightboxIndex + 1);

      const indexButton = event.target.closest('[data-lightbox-index]');
      if (indexButton) navigateLightbox(Number.parseInt(indexButton.dataset.lightboxIndex, 10));
    });
  }

  window.currentLightboxMedia = media;
  window.currentLightboxIndex = Math.max(0, Math.min(currentIndex, media.length - 1));
  renderLightbox(lightbox);
  lightbox.classList.add('show');
  setBodyOverlayState('lightbox-open', true);
  activateDialog(lightbox, trigger);
  document.removeEventListener('keydown', lightboxKeyHandler);
  document.addEventListener('keydown', lightboxKeyHandler);
}

function renderLightbox(lightbox) {
  const media = window.currentLightboxMedia;
  const currentIndex = window.currentLightboxIndex || 0;
  const current = media?.[currentIndex];
  const host = lightbox?.querySelector('.lightbox-content');
  if (!host || !current) return;

  host.innerHTML = `
    <button class="lightbox-close" type="button" data-lightbox-action="close" aria-label="Close image viewer">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    ${media.length > 1 ? `
      <button class="lightbox-nav lightbox-prev" type="button" data-lightbox-action="previous" aria-label="Previous image" ${currentIndex === 0 ? 'disabled' : ''}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="lightbox-nav lightbox-next" type="button" data-lightbox-action="next" aria-label="Next image" ${currentIndex === media.length - 1 ? 'disabled' : ''}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>` : ''}
    <div class="lightbox-image-container">
      <img src="${escapeHtml(current.src)}" alt="${escapeHtml(current.alt || `Project visual ${currentIndex + 1}`)}" class="lightbox-image" decoding="async"/>
    </div>
    ${current.caption ? `<p class="lightbox-caption">${escapeHtml(current.caption)}</p>` : ''}
    ${media.length > 1 ? `
      <div class="lightbox-counter"><span>${currentIndex + 1} / ${media.length}</span></div>
      <div class="lightbox-thumbnails" aria-label="Choose an image">
        ${media.map((item, index) => `
          <button class="lightbox-thumbnail ${index === currentIndex ? 'active' : ''}" type="button" data-lightbox-index="${index}" aria-label="Show image ${index + 1}" aria-current="${index === currentIndex ? 'true' : 'false'}">
            <span>${String(index + 1).padStart(2, '0')}</span>
          </button>`).join('')}
      </div>` : ''}`;
}

function navigateLightbox(newIndex) {
  const media = window.currentLightboxMedia;
  if (!media || !media.length || newIndex < 0 || newIndex >= media.length) return;
  window.currentLightboxIndex = newIndex;
  const lightbox = document.getElementById('image-lightbox');
  renderLightbox(lightbox);
  requestAnimationFrame(() => {
    const currentChoice = lightbox?.querySelector(`[data-lightbox-index="${newIndex}"]`);
    (currentChoice || lightbox?.querySelector('.lightbox-close') || lightbox)?.focus({ preventScroll: true });
  });
}

function closeImageLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  if (!lightbox || !lightbox.classList.contains('show')) return;
  lightbox.classList.remove('show');
  deactivateDialog(lightbox);
  setBodyOverlayState('lightbox-open', false);
  document.removeEventListener('keydown', lightboxKeyHandler);
  lightbox.querySelector('.lightbox-content')?.replaceChildren();
  window.currentLightboxMedia = null;
  window.currentLightboxIndex = 0;
}

function lightboxKeyHandler(event) {
  if (event.key === 'Escape') closeImageLightbox();
  else if (event.key === 'ArrowLeft') navigateLightbox(window.currentLightboxIndex - 1);
  else if (event.key === 'ArrowRight') navigateLightbox(window.currentLightboxIndex + 1);
}

function closeProjectModal() {
  const modal = document.getElementById('project-modal');
  if (!modal || !modal.classList.contains('show')) return;

  // Close any open lightbox first
  closeImageLightbox();
  teardownProjectModalMedia(modal);

  const finishClose = () => {
    modal.classList.remove('show');
    deactivateDialog(modal);
    setBodyOverlayState('modal-open', false);
    modal.querySelector('.project-modal-body')?.replaceChildren();
    if (window.location.hash.startsWith('#work/')) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${projectModalPreviousHash}`);
    }
  };

  if (typeof gsap !== 'undefined' && !PERF.prefersReducedMotion) {
    gsap.killTweensOf(modal.querySelector('.project-modal-content'));
    gsap.to(modal.querySelector('.project-modal-content'), {
      y: -30,
      opacity: 0,
      scale: 0.95,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: finishClose
    });
  } else {
    finishClose();
  }
}
// ---------------- End Project Modal ----------------

// Initialize modal and interaction functionality
document.addEventListener('DOMContentLoaded', function() {
  // Close TLDR modal when pressing Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const lightbox = document.getElementById('image-lightbox');
      const tldrModal = document.getElementById('tldr-modal');
      const projectModal = document.getElementById('project-modal');
      const sitesModal = document.getElementById('sites-modal');
      const projectsContent = document.getElementById('projects-content');
      const filterDropdown = document.getElementById('filter-dropdown');
      
      if (lightbox && lightbox.classList.contains('show')) {
        closeImageLightbox();
      } else if (projectModal && projectModal.classList.contains('show')) {
        closeProjectModal();
      } else if (sitesModal && sitesModal.classList.contains('show')) {
        closeSitesModal();
      } else if (tldrModal && tldrModal.classList.contains('show')) {
        closeTldrModal();
      } else if (filterDropdown && !filterDropdown.hidden && document.body.classList.contains('deck-open')) {
        if (typeof closeFilterDropdown === 'function') {
          closeFilterDropdown();
          requestAnimationFrame(() => document.querySelector('.filter-cards-btn')?.focus({ preventScroll: true }));
        }
      } else if (projectsContent && projectsContent.classList.contains('revealed')) {
        returnToDots();
      }
    }
  });

  // Handle TLDR modal clicks
  const tldrModal = document.getElementById('tldr-modal');
  if (tldrModal) {
    tldrModal.addEventListener('click', function(e) {
      if (e.target === tldrModal) {
        closeTldrModal();
      }
    });
  }

  // Prevent modal content clicks from closing the modal
  const tldrModalContent = document.querySelector('.tldr-modal-content');
  if (tldrModalContent) {
    tldrModalContent.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // Handle TLDR modal backdrop clicks
  const tldrModalBackdrop = document.querySelector('.tldr-modal-backdrop');
  if (tldrModalBackdrop) {
    tldrModalBackdrop.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeTldrModal();
    });
  }

  // Handle TLDR modal close button clicks
  const tldrCloseButton = document.querySelector('.tldr-modal-close');
  if (tldrCloseButton) {
    tldrCloseButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeTldrModal();
    });
  }

  // Handle TLDR button clicks
  const tldrButton = document.getElementById('tldr-btn');
  if (tldrButton) {
    tldrButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openTldrModal();
    });
  }

  // Handle Sites modal clicks
  const sitesModal = document.getElementById('sites-modal');
  if (sitesModal) {
    sitesModal.addEventListener('click', function(e) {
      if (e.target === sitesModal) {
        closeSitesModal();
      }
    });
  }

  // Sites modal backdrop
  const sitesModalBackdrop = document.querySelector('.sites-modal-backdrop');
  if (sitesModalBackdrop) {
    sitesModalBackdrop.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeSitesModal();
    });
  }

  // Sites modal close button
  const sitesCloseButton = document.querySelector('.sites-modal-close');
  if (sitesCloseButton) {
    sitesCloseButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeSitesModal();
    });
  }

  // Top-left master sites button
  const sitesButton = document.getElementById('sites-btn');
  if (sitesButton) {
    sitesButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openSitesModal();
    });
  }

  const projectModal = document.getElementById('project-modal');
  const projectModalBackdrop = projectModal?.querySelector('.project-modal-backdrop');
  const projectModalClose = projectModal?.querySelector('.project-modal-close');
  projectModalBackdrop?.addEventListener('click', closeProjectModal);
  projectModalClose?.addEventListener('click', closeProjectModal);

  // Handle center button clicks for projects reveal
  const centerButton = document.querySelector('.osmo-icon__link');
  if (centerButton) {
    centerButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      revealProjects();
    });
  }

  // Handle projects return button clicks
  const returnButton = document.querySelector('.projects-return-btn');
  if (returnButton) {
    returnButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      returnToDots();
    });
  }

  // Prevent projects content from interfering with dots interaction
  const projectsContent = document.getElementById('projects-content');
  const skipLink = document.querySelector('.skip-link');
  skipLink?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (projectsContent?.classList.contains('revealed')) projectsContent.focus({ preventScroll: true });
    else centerButton?.focus({ preventScroll: true });
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#work/')) openProjectFromHash();
  });
}); 

