// Projects Reveal Functions
function revealProjects() {
  console.log('Revealing projects behind dots...');
  
  const dotsContainer = document.querySelector('.dots-container');
  const projectsContent = document.getElementById('projects-content');
  const centerIcon = document.querySelector('.osmo-icon__link');
  const tldrButton = document.querySelector('.website-link.is--alt');
  
  if (dotsContainer && projectsContent && centerIcon) {
    // Hide center icon first
    centerIcon.classList.add('hidden');

    tldrButton.style.display = 'none';
    // Animate dots to disperse
    setTimeout(() => {
      animateDotsDisperse();
    }, 200);
    
    // Show projects content as dots start dispersing
    setTimeout(() => {
      projectsContent.classList.add('revealed');
    }, 500);
  }
}

function returnToDots() {
  console.log('Returning to dots view...');
  
  const dotsContainer = document.querySelector('.dots-container');
  const projectsContent = document.getElementById('projects-content');
  const centerIcon = document.querySelector('.osmo-icon__link');
  const tldrButton = document.querySelector('.website-link.is--alt');
  
  if (dotsContainer && projectsContent && centerIcon) {
    // Hide projects content
    projectsContent.classList.remove('revealed');
    tldrButton.style.display = 'flex';
    
    // Animate dots back to normal
    setTimeout(() => {
      animateDotsReturn();
    }, 300);
    
    // Show center icon after dots are back
    setTimeout(() => {
      centerIcon.classList.remove('hidden');
    }, 800);
  }
}

function animateDotsDisperse() {
  const field = getPrimaryDotField();
  if (!field) return;

  if (typeof gsap !== 'undefined') {
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

  if (typeof gsap !== 'undefined') {
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

// TLDR Modal Functions
function openTldrModal() {
  console.log('Opening TLDR modal...');
  const modal = document.getElementById('tldr-modal');
  if (modal) {
    modal.classList.add('show');
    setBodyOverlayState('modal-open', true);
    
    // Add smooth animation using GSAP if available
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(modal.querySelector('.tldr-modal-content'), 
        { y: -50, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "power2.out" }
      );
    }
  }
}

function closeTldrModal() {
  console.log('Closing TLDR modal...');
  const modal = document.getElementById('tldr-modal');
  if (modal && modal.classList.contains('show')) {
    setBodyOverlayState('modal-open', false);
    
    // Add smooth animation using GSAP if available
    if (typeof gsap !== 'undefined') {
      gsap.to(modal.querySelector('.tldr-modal-content'), {
        y: -30,
        opacity: 0,
        scale: 0.95,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          modal.classList.remove('show');
        }
      });
    } else {
      modal.classList.remove('show');
    }
  }
}

// Sites Modal Functions
function openSitesModal() {
  const modal = document.getElementById('sites-modal');
  if (modal) {
    modal.classList.add('show');
    setBodyOverlayState('modal-open', true);
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(modal.querySelector('.sites-modal-content'), { y: -40, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
    }
  }
}

function closeSitesModal() {
  const modal = document.getElementById('sites-modal');
  if (modal && modal.classList.contains('show')) {
    setBodyOverlayState('modal-open', false);
    if (typeof gsap !== 'undefined') {
      gsap.to(modal.querySelector('.sites-modal-content'), { y: -20, opacity: 0, scale: 0.97, duration: 0.2, ease: 'power2.in', onComplete: () => { modal.classList.remove('show'); } });
    } else {
      modal.classList.remove('show');
    }
  }
}

// ---------------- Project Modal (dynamic) ----------------
function openProjectModal(button) {
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

  // Build gallery
  const images = (project.gallery && project.gallery.length) ? project.gallery : (project.image ? [project.image] : []);
  
  // Enhanced modal content with better layout and interactive elements
  body.innerHTML = `
    <div class="project-modal-layout">
      <div class="project-modal-header-section">
        <div class="project-modal-category">${project.category || 'project'}</div>
        <h2 class="project-modal-title">${project.title || ''}</h2>
        <div class="project-modal-divider"></div>
      </div>
      
      <div class="project-modal-content-grid">
        <div class="project-modal-main-content">
          <div class="project-modal-description-section">
            <h3 class="project-modal-section-title">overview</h3>
            <p class="project-modal-description">${project.long || project.short || ''}</p>
          </div>
          
          ${project.links && project.links.length ? `
          <div class="project-modal-links-section">
            <h3 class="project-modal-section-title">explore</h3>
            <div class="project-modal-links">
              ${project.links.map(l => `
                <a href="${l.href}" target="_blank" class="project-modal-link">
                  <div class="project-modal-link-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 0L10.5 5.5L16 8L10.5 10.5L8 16L5.5 10.5L0 8L5.5 5.5L8 0Z" fill="currentColor"/>
                    </svg>
                  </div>
                  <span class="project-modal-link-text">${l.label || 'View Project'}</span>
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
        
        <div class="project-modal-gallery-section">
          <h3 class="project-modal-section-title">visuals</h3>
          <div class="project-modal-gallery">
            ${images.map((src, index) => `
              <div class="project-modal-img-container" data-src="${src}" data-index="${index}">
                <img src="${src}" alt="${project.title}" class="project-modal-img"/>
                <div class="project-modal-img-overlay">
                  <div class="project-modal-img-expand">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15 3H21V9M14 10L21 3M9 21H3V15M10 14L3 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="project-modal-footer">
        <div class="project-modal-metadata">
          <div class="metadata-item">
            <span class="metadata-label">category</span>
            <span class="metadata-value">${project.category || 'project'}</span>
          </div>
          ${images.length > 1 ? `
          <div class="metadata-item">
            <span class="metadata-label">gallery</span>
            <span class="metadata-value">${images.length} images</span>
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

  // Add click handlers for image containers
  const imageContainers = modal.querySelectorAll('.project-modal-img-container');
  imageContainers.forEach(container => {
    container.addEventListener('click', function() {
      const src = this.dataset.src;
      const index = parseInt(this.dataset.index);
      openImageLightbox(src, index, JSON.stringify(images));
    });
  });

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(modal.querySelector('.project-modal-content'), { y: -40, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
  }
}

// Image Lightbox functionality
function openImageLightbox(src, currentIndex, imagesJson) {
  const images = JSON.parse(imagesJson.replace(/&quot;/g, '"'));
  
  // Create lightbox if it doesn't exist
  let lightbox = document.getElementById('image-lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'image-lightbox';
    lightbox.className = 'image-lightbox';
    document.body.appendChild(lightbox);
  }
  
  lightbox.innerHTML = `
    <div class="lightbox-backdrop" onclick="closeImageLightbox()"></div>
    <div class="lightbox-content">
      <button class="lightbox-close" onclick="closeImageLightbox()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      
      ${images.length > 1 ? `
        <button class="lightbox-nav lightbox-prev" onclick="navigateLightbox(${currentIndex - 1})">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="lightbox-nav lightbox-next" onclick="navigateLightbox(${currentIndex + 1})">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      ` : ''}
      
      <div class="lightbox-image-container">
        <img src="${src}" alt="Project Image" class="lightbox-image"/>
      </div>
      
      ${images.length > 1 ? `
        <div class="lightbox-counter">
          <span>${currentIndex + 1} / ${images.length}</span>
        </div>
        <div class="lightbox-thumbnails">
          ${images.map((imgSrc, index) => `
            <div class="lightbox-thumbnail ${index === currentIndex ? 'active' : ''}" onclick="navigateLightbox(${index})">
              <img src="${imgSrc}" alt="Thumbnail ${index + 1}"/>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  // Store current images globally for navigation
  window.currentLightboxImages = images;
  
  lightbox.classList.add('show');
  setBodyOverlayState('lightbox-open', true);
  
  // Add keyboard navigation
  document.addEventListener('keydown', lightboxKeyHandler);
}

function navigateLightbox(newIndex) {
  const images = window.currentLightboxImages;
  if (!images || !images.length) return;
  
  const clampedIndex = Math.max(0, Math.min(newIndex, images.length - 1));
  
  if (clampedIndex !== newIndex) return; // Out of bounds
  
  openImageLightbox(images[clampedIndex], clampedIndex, JSON.stringify(images));
}

function closeImageLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  if (lightbox) {
    lightbox.classList.remove('show');
    setBodyOverlayState('lightbox-open', false);
    document.removeEventListener('keydown', lightboxKeyHandler);
    window.currentLightboxImages = null;
  }
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') {
    closeImageLightbox();
  } else if (e.key === 'ArrowLeft') {
    const images = window.currentLightboxImages;
    if (images && images.length > 1) {
      const currentIndex = parseInt(document.querySelector('.lightbox-counter span')?.textContent?.split(' / ')[0] || '1') - 1;
      navigateLightbox(currentIndex - 1);
    }
  } else if (e.key === 'ArrowRight') {
    const images = window.currentLightboxImages;
    if (images && images.length > 1) {
      const currentIndex = parseInt(document.querySelector('.lightbox-counter span')?.textContent?.split(' / ')[0] || '1') - 1;
      navigateLightbox(currentIndex + 1);
    }
  }
}

function closeProjectModal() {
  const modal = document.getElementById('project-modal');
  if (!modal || !modal.classList.contains('show')) return;

  // Close any open lightbox first
  closeImageLightbox();

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(modal.querySelector('.project-modal-content'));
    gsap.to(modal.querySelector('.project-modal-content'), {
      y: -30,
      opacity: 0,
      scale: 0.95,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => {
        modal.classList.remove('show');
        setBodyOverlayState('modal-open', false);
      }
    });
  } else {
    modal.classList.remove('show');
    setBodyOverlayState('modal-open', false);
  }
}
// ---------------- End Project Modal ----------------

// Initialize modal and interaction functionality
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing interactions...');
  
  // Close TLDR modal when pressing Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const tldrModal = document.getElementById('tldr-modal');
      const projectModal = document.getElementById('project-modal');
      const sitesModal = document.getElementById('sites-modal');
      const projectsContent = document.getElementById('projects-content');
      
      if (projectModal && projectModal.classList.contains('show')) {
        closeProjectModal();
      } else if (sitesModal && sitesModal.classList.contains('show')) {
        closeSitesModal();
      } else if (tldrModal && tldrModal.classList.contains('show')) {
        closeTldrModal();
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
  if (projectsContent) {
    projectsContent.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
}); 

