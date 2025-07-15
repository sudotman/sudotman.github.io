gsap.registerPlugin(InertiaPlugin);

function initGlowingInteractiveDotsGrid() {
  document.querySelectorAll('[data-dots-container-init]').forEach(container => {
    const colors         = { base: "#245E51", active: "#A8FF51" };
    window.__DOT_GRIDS = window.__DOT_GRIDS || [];
    window.__DOT_GRIDS.push(colors);
    const threshold      = 200;
    const speedThreshold = 100;
    const shockRadius    = 325;
    const shockPower     = 5;
    const maxSpeed       = 5000;
    const centerHole     = true;

    let dots       = [];
    let dotCenters = [];

    function buildGrid() {
      container.innerHTML = "";
      dots = [];
      dotCenters = [];

      const style = getComputedStyle(container);
      let dotPx = parseFloat(style.fontSize);
      const isAsciiActive = container.classList.contains('ascii-active');
      
      // Fallback for font size if it's 0 or invalid
      if (!dotPx || dotPx <= 0) {
        dotPx = 16; // Default to 16px
      }
      
      // Make spacing tighter when ASCII mode is active on this container
      const gapPx = dotPx * (isAsciiActive ? 0.6 : 2);
      let contW = container.clientWidth;
      let contH = container.clientHeight;

      // Safety check: ensure container has valid dimensions
      if (contW <= 0 || contH <= 0) {
        // Force minimum dimensions if container is not sized
        contW = Math.max(contW, window.innerWidth);
        contH = Math.max(contH, window.innerHeight);
      }

      // In ASCII mode, constrain grid to viewport to prevent off-screen dots
      if (isAsciiActive) {
        const viewportW = Math.min(window.innerWidth * 0.8, contW);
        const viewportH = Math.min(window.innerHeight * 0.8, contH);
        contW = viewportW;
        contH = viewportH;
      }

      let cols = Math.floor((contW + gapPx) / (dotPx + gapPx));
      let rows = Math.floor((contH + gapPx) / (dotPx + gapPx));
      
      // Further limit ASCII grid size for better performance and visibility
      if (isAsciiActive) {
        cols = Math.min(cols, 120); // Max 120 columns
        rows = Math.min(rows, 60);  // Max 60 rows
      }
      
      // Safety check: ensure we have valid grid dimensions
      if (cols <= 0 || rows <= 0) {
        return;
      }
      
      const total = cols * rows;

      const holeCols = centerHole ? (cols % 2 === 0 ? 4 : 5) : 0;
      const holeRows = centerHole ? (rows % 2 === 0 ? 4 : 5) : 0;
      const startCol = (cols - holeCols) / 2;
      const startRow = (rows - holeRows) / 2;

      for (let i = 0; i < total; i++) {
        const row    = Math.floor(i / cols);
        const col    = i % cols;
        const isHole = centerHole &&
          row >= startRow && row < startRow + holeRows &&
          col >= startCol && col < startCol + holeCols;

        const d = document.createElement("div");
        d.classList.add("dot");
        d._row = row;
        d._col = col;
        container._cols = cols;
        container._rows = rows;

        if (isHole) {
          d.style.visibility = "hidden";
          d._isHole = true;
        } else {
          gsap.set(d, { x: 0, y: 0, backgroundColor: colors.base });
          d._inertiaApplied = false;
        }

        container.appendChild(d);
        dots.push(d);
      }

      requestAnimationFrame(() => {
        dotCenters = dots
          .filter(d => !d._isHole)
          .map(d => {
            const r = d.getBoundingClientRect();
            return {
              el: d,
              x:  r.left + window.scrollX + r.width  / 2,
              y:  r.top  + window.scrollY + r.height / 2
            };
          });
      });
    }

    // expose control helpers
    container._rebuildGrid = buildGrid;
    container._origFs = parseFloat(getComputedStyle(container).fontSize);

    window.addEventListener("resize", buildGrid);
    buildGrid();

    let lastTime = 0, lastX = 0, lastY = 0;

    window.addEventListener("mousemove", e => {
      // Skip mouse interactions if ASCII mode is active
      if (container.classList.contains('ascii-active')) return;
      
      const now   = performance.now();
      const dt    = now - lastTime || 16;
      let   dx    = e.pageX - lastX;
      let   dy    = e.pageY - lastY;
      let   vx    = dx / dt * 1000;
      let   vy    = dy / dt * 1000;
      let   speed = Math.hypot(vx, vy);

      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        vx *= scale; vy *= scale; speed = maxSpeed;
      }

      lastTime = now;
      lastX    = e.pageX;
      lastY    = e.pageY;

      requestAnimationFrame(() => {
        dotCenters.forEach(({ el, x, y }) => {
          const dist = Math.hypot(x - e.pageX, y - e.pageY);
          const t    = Math.max(0, 1 - dist / threshold);
          
          // Preserve heatmap colors - only apply hover if no heatmap data
          if (el._heatmapCount && el._heatmapCount > 0) {
            return; // Skip hover effect for heatmap dots
          }
          
          const col  = gsap.utils.interpolate(colors.base, colors.active, t);
          gsap.set(el, { backgroundColor: col });

          if (speed > speedThreshold && dist < threshold && !el._inertiaApplied) {
            el._inertiaApplied = true;
            const pushX = (x - e.pageX) + vx * 0.005;
            const pushY = (y - e.pageY) + vy * 0.005;

            gsap.to(el, {
              inertia: { x: pushX, y: pushY, resistance: 750 },
              onComplete() {
                gsap.to(el, {
                  x: 0,
                  y: 0,
                  duration: 1.5,
                  ease: "elastic.out(1,0.75)"
                });
                el._inertiaApplied = false;
              }
            });
          }
        });
      });
    });

    window.addEventListener("click", e => {
      // Skip click interactions if ASCII mode is active
      if (container.classList.contains('ascii-active')) return;
      
      dotCenters.forEach(({ el, x, y }) => {
        const dist = Math.hypot(x - e.pageX, y - e.pageY);
        if (dist < shockRadius && !el._inertiaApplied) {
          el._inertiaApplied = true;
          const falloff = Math.max(0, 1 - dist / shockRadius);
          const pushX   = (x - e.pageX) * shockPower * falloff;
          const pushY   = (y - e.pageY) * shockPower * falloff;

          gsap.to(el, {
            inertia: { x: pushX, y: pushY, resistance: 750 },
            onComplete() {
              gsap.to(el, {
                x: 0,
                y: 0,
                duration: 1.5,
                ease: "elastic.out(1,0.75)"
              });
              el._inertiaApplied = false;
            }
          });
        }
      });
    });
  });
}

// Initialize Glowing Interactive Dots Grid
document.addEventListener('DOMContentLoaded', function() {
  initGlowingInteractiveDotsGrid();
  loadProjects().then(() => {
    // Once projects are loaded, set up drag events
    initCardDragSystem();
  });
  loadProfileData();
  initTabSwitching();
  initScrollBasedDotAnimation();
  initColorSampler();
});

// Tab Switching Functionality
function initTabSwitching() {
  const navNodes = document.querySelectorAll('.nav-node');
  const tabContents = document.querySelectorAll('.tab-content');
  
  navNodes.forEach(node => {
    node.addEventListener('click', () => {
      const targetTab = node.dataset.tab;
      
      // Remove active class from all nodes and contents
      navNodes.forEach(n => n.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked node and corresponding content
      node.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
      
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

// Constellation morphing animation
function morphConstellation(activeTab) {
  const constellation = document.querySelector('.constellation-nav');
  const connections = document.querySelectorAll('.connection-line');
  const center = document.querySelector('.constellation-center');
  
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
  
  experienceCards.innerHTML = workExperience.map(job => `
    <div class="experience-card">
      <div class="experience-org">${job.organization}</div>
      <div class="experience-period">${job.period}</div>
      <div class="experience-roles">
        ${job.roles.map(role => `
          <div class="experience-role">
            <span class="experience-role-title">${role.title}</span>
            <span class="experience-role-period">${role.period}</span>
          </div>
        `).join('')}
      </div>
      <div class="experience-summary">${job.summary}</div>
    </div>
  `).join('');
}

// Load Skills Data into constellation
function loadSkillsData(techStack) {
  const skillsOrbits = document.querySelector('.skills-orbits');
  if (!skillsOrbits) return;
  
  // Create skill orbits and nodes
  const skillCategories = [
    { name: 'engines', items: techStack.gameEngines.slice(0, 4), label: 'game engines' },
    { name: 'languages', items: techStack.languages.slice(0, 6), label: 'languages' },
    { name: 'tools', items: techStack.tools.slice(0, 5), label: 'tools' }
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
    <div class="skill-category-label engines">game engines</div>
    <div class="skill-category-label languages">languages</div>
    <div class="skill-category-label tools">tools</div>
  `;
  
  skillsOrbits.innerHTML = orbitsHtml + labelsHtml;
}

// Load Interests Data
function loadInterestsData(interests) {
  const interestsConstellation = document.querySelector('.interests-constellation');
  if (!interestsConstellation) return;
  
  const interestNodes = [
    {
      title: 'Cinema',
      essence: 'visual storytelling',
      description: interests.cinema.description,
      icon: `
        <svg class="interest-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="cinemaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ff4c24;stop-opacity:0.8" />
              <stop offset="100%" style="stop-color:#ff6b47;stop-opacity:0.3" />
            </linearGradient>
          </defs>
          <rect class="cinema-frame" x="10" y="20" width="80" height="50" fill="none" stroke="url(#cinemaGrad)" stroke-width="2" rx="5"/>
          <rect class="cinema-screen" x="15" y="25" width="70" height="40" fill="url(#cinemaGrad)" opacity="0.3" rx="3"/>
          <circle class="cinema-dot" cx="20" cy="15" r="3" fill="#ff4c24"/>
          <circle class="cinema-dot" cx="30" cy="15" r="3" fill="#ff4c24"/>
          <circle class="cinema-dot" cx="40" cy="15" r="3" fill="#ff4c24"/>
          <path class="cinema-beam" d="M50 15 L25 25 L25 65 L50 75 Z" fill="url(#cinemaGrad)" opacity="0.4"/>
        </svg>
      `,
      links: [{ label: 'letterboxd', url: interests.cinema.letterboxd }]
    },
    {
      title: 'Music',
      essence: 'sonic landscapes',
      description: interests.music.description,
      icon: `
        <svg class="interest-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="musicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ff4c24;stop-opacity:0.9" />
              <stop offset="50%" style="stop-color:#ff6b47;stop-opacity:0.6" />
              <stop offset="100%" style="stop-color:#ff4c24;stop-opacity:0.3" />
            </linearGradient>
          </defs>
          <path class="music-wave" d="M10 50 Q25 30 40 50 T70 50 T100 50" stroke="url(#musicGrad)" stroke-width="3" fill="none"/>
          <path class="music-wave" d="M10 60 Q25 40 40 60 T70 60 T100 60" stroke="url(#musicGrad)" stroke-width="2" fill="none" opacity="0.7"/>
          <circle class="music-node" cx="25" cy="35" r="4" fill="#ff4c24"/>
          <circle class="music-node" cx="55" cy="45" r="4" fill="#ff4c24"/>
          <circle class="music-node" cx="85" cy="55" r="4" fill="#ff4c24"/>
          <rect class="music-bar" x="20" y="70" width="4" height="20" fill="url(#musicGrad)"/>
          <rect class="music-bar" x="30" y="65" width="4" height="25" fill="url(#musicGrad)"/>
          <rect class="music-bar" x="40" y="75" width="4" height="15" fill="url(#musicGrad)"/>
        </svg>
      `,
      links: [
        { label: 'last.fm', url: interests.music.lastfm },
        { label: 'topster', url: interests.music.topster }
      ]
    },
    {
      title: 'Books',
      essence: 'written worlds',
      description: interests.books.description,
      icon: `
        <svg class="interest-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="booksGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ff4c24;stop-opacity:0.8" />
              <stop offset="100%" style="stop-color:#ff6b47;stop-opacity:0.4" />
            </linearGradient>
          </defs>
          <rect class="book-spine" x="20" y="20" width="15" height="60" fill="url(#booksGrad)" rx="2"/>
          <rect class="book-spine" x="40" y="25" width="15" height="55" fill="url(#booksGrad)" rx="2" opacity="0.8"/>
          <rect class="book-spine" x="60" y="30" width="15" height="50" fill="url(#booksGrad)" rx="2" opacity="0.6"/>
          <path class="book-text" d="M25 35 L30 35 M25 40 L32 40 M25 45 L28 45" stroke="#ff4c24" stroke-width="1"/>
          <path class="book-text" d="M45 40 L50 40 M45 45 L52 45" stroke="#ff4c24" stroke-width="1" opacity="0.8"/>
          <circle class="book-dot" cx="67" cy="40" r="2" fill="#ff4c24"/>
        </svg>
      `,
      links: []
    },
    {
      title: 'Games',
      essence: 'interactive art',
      description: interests.games.description,
      icon: `
        <svg class="interest-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gamesGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ff4c24;stop-opacity:0.9" />
              <stop offset="100%" style="stop-color:#ff6b47;stop-opacity:0.5" />
            </linearGradient>
          </defs>
          <polygon class="game-hex" points="50,15 70,30 70,60 50,75 30,60 30,30" fill="none" stroke="url(#gamesGrad)" stroke-width="2"/>
          <polygon class="game-hex" points="50,25 60,35 60,55 50,65 40,55 40,35" fill="url(#gamesGrad)" opacity="0.3"/>
          <circle class="game-node" cx="45" cy="40" r="3" fill="#ff4c24"/>
          <circle class="game-node" cx="55" cy="40" r="3" fill="#ff4c24"/>
          <circle class="game-node" cx="50" cy="50" r="3" fill="#ff4c24"/>
          <path class="game-connect" d="M45 40 L55 40 M50 40 L50 50" stroke="#ff4c24" stroke-width="1" opacity="0.6"/>
        </svg>
      `,
      links: [{ label: 'games page', url: interests.games.gamesPage }]
    }
  ];
  
  // Insert nodes before the constellation-web div
  const constellationWeb = interestsConstellation.querySelector('.constellation-web');
  const nodesHtml = interestNodes.map(node => `
    <div class="interest-node">
      <div class="interest-orb">
        <div class="interest-core">
          <div class="interest-icon">${node.icon}</div>
          <div class="interest-title">${node.title}</div>
          <div class="interest-essence">${node.essence}</div>
        </div>
      </div>
      <div class="interest-description">${node.description}</div>
      ${node.links.length > 0 ? `
        <div class="interest-links">
          ${node.links.map(link => `
            <a href="${link.url}" target="_blank" class="interest-link">${link.label}</a>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
  
  constellationWeb.insertAdjacentHTML('beforebegin', nodesHtml);
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
  const interestCards = document.querySelectorAll('.interest-card');
  interestCards.forEach((card, index) => {
    card.style.animation = 'none';
    card.offsetHeight; // Trigger reflow
    card.style.animation = `floatInInterest 1s ease forwards`;
    card.style.animationDelay = `${(index + 1) * 0.2}s`;
  });
}

// Card Drag System
function initCardDragSystem() {
  let isDragging = false;
  let currentCard = null;
  let startX, startY;
  let highestZIndex = 100;
  let cardData = new Map();

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
    
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    
    const data = cardData.get(currentCard);
    const newX = data.startX + deltaX;
    const newY = data.startY + deltaY;
    
    // Use GSAP to move the card
    gsap.set(currentCard, {
      x: newX,
      y: newY
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

// Projects Reveal Functions
function revealProjects() {
  console.log('Revealing projects behind dots...');
  
  const dotsContainer = document.querySelector('.dots-container');
  const projectsContent = document.getElementById('projects-content');
  const centerIcon = document.querySelector('.osmo-icon__link');
  
  if (dotsContainer && projectsContent && centerIcon) {
    // Hide center icon first
    centerIcon.classList.add('hidden');
    
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
  
  if (dotsContainer && projectsContent && centerIcon) {
    // Hide projects content
    projectsContent.classList.remove('revealed');
    
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
  const dots = document.querySelectorAll('.dots-container .dot');
  
  dots.forEach((dot, index) => {
    if (dot._isHole) return; // Skip center hole dots
    
    // Only disperse 60% of dots, keep 40% for cohesion
    const shouldDisperse = Math.random() < 0.6;
    
    if (shouldDisperse) {
      const delay = Math.random() * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const distance = 150 + Math.random() * 250;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      
      if (typeof gsap !== 'undefined') {
        gsap.to(dot, {
          x: x,
          y: y,
          opacity: 0,
          scale: 0.1,
          duration: 0.8,
          delay: delay,
          ease: "power2.in"
        });
      } else {
        setTimeout(() => {
          dot.style.opacity = '0';
          dot.style.transform = `translate(${x}px, ${y}px) scale(0.1)`;
        }, delay * 1000);
      }
    } else {
      // Keep remaining dots but make them more subtle
      if (typeof gsap !== 'undefined') {
        gsap.to(dot, {
          opacity: 0.15,
          scale: 0.8,
          duration: 0.8,
          delay: Math.random() * 0.3,
          ease: "power2.out"
        });
      } else {
        setTimeout(() => {
          dot.style.opacity = '0.15';
          dot.style.transform = 'scale(0.8)';
        }, Math.random() * 300);
      }
    }
  });
}

function animateDotsReturn() {
  const dots = document.querySelectorAll('.dots-container .dot');
  
  dots.forEach((dot, index) => {
    if (dot._isHole) return; // Skip center hole dots
    
    const delay = Math.random() * 0.4;
    
    if (typeof gsap !== 'undefined') {
      gsap.to(dot, {
        x: 0,
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.7,
        delay: delay,
        ease: "power2.out"
      });
    } else {
      setTimeout(() => {
        dot.style.opacity = '1';
        dot.style.transform = 'translate(0px, 0px) scale(1)';
      }, delay * 1000);
    }
  });
}

function toggleProjectDetails(button) {
  // Repurposed: open the project modal instead of expanding inline details
  openProjectModal(button);
}

// TLDR Modal Functions
function openTldrModal() {
  console.log('Opening TLDR modal...');
  const modal = document.getElementById('tldr-modal');
  if (modal) {
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    
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
    document.body.classList.remove('modal-open');
    
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
  document.body.classList.add('modal-open');

  const body = modal.querySelector('.project-modal-body');
  if (!body) return;

  // Build gallery
  const images = (project.gallery && project.gallery.length) ? project.gallery : (project.image ? [project.image] : []);

  body.innerHTML = `
    <h2 class="project-modal-title">${project.title || ''}</h2>
    <p class="project-modal-description">${project.long || ''}</p>
    <div class="project-modal-gallery">
      ${images.map(src => `<img src="${src}" alt="${project.title}" class="project-modal-img"/>`).join('')}
    </div>
    ${project.links && project.links.length ? `<div class="project-modal-links">${project.links.map(l => `
      <a href="${l.href}" target="_blank">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 0L10.5 5.5L16 8L10.5 10.5L8 16L5.5 10.5L0 8L5.5 5.5L8 0Z" fill="currentColor"/>
        </svg>
        ${l.label || 'View Project'}
      </a>`).join('')}</div>` : ''}
  `;

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(modal.querySelector('.project-modal-content'), { y: -40, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
  }
}

function closeProjectModal() {
  const modal = document.getElementById('project-modal');
  if (!modal || !modal.classList.contains('show')) return;

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
        document.body.classList.remove('modal-open');
      }
    });
  } else {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
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
      const projectsContent = document.getElementById('projects-content');
      
      if (projectModal && projectModal.classList.contains('show')) {
        closeProjectModal();
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

// Scroll-based Dot Animation
function initScrollBasedDotAnimation() {
  let scrollTimeout;
  let isScrolling = false;

  function animateDotsOnScroll() {
    const projectsContent = document.getElementById('projects-content');
    const dots = document.querySelectorAll('.dots-container .dot');
    
    if (!projectsContent || !dots.length) return;
    
    projectsContent.addEventListener('scroll', (e) => {
      clearTimeout(scrollTimeout);
      isScrolling = true;
      
      const scrollTop = e.target.scrollTop;
      const scrollHeight = e.target.scrollHeight - e.target.clientHeight;
      const scrollProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
      
      // Animate dots based on scroll progress
      dots.forEach((dot, index) => {
        if (dot._isHole) return; // Skip center hole dots
        
        // Skip scroll animations if ASCII mode is active
        const container = dot.closest('[data-dots-container-init]');
        if (container && container.classList.contains('ascii-active')) return;
        
        // Create wave-like movement based on scroll position
        const waveOffset = (index * 0.1) + (scrollProgress * Math.PI * 2);
        const waveX = Math.sin(waveOffset) * 15;
        const waveY = Math.cos(waveOffset * 0.7) * 10;
        
        // Add some random drift
        const driftX = (Math.sin(scrollProgress * Math.PI * 3 + index * 0.5) * 8);
        const driftY = (Math.cos(scrollProgress * Math.PI * 2 + index * 0.3) * 12);
        
        const finalX = waveX + driftX;
        const finalY = waveY + driftY;
        
        // Apply smooth animation
        if (typeof gsap !== 'undefined') {
          gsap.to(dot, {
            x: finalX,
            y: finalY,
            duration: 0.3,
            ease: "power2.out",
            overwrite: "auto"
          });
        } else {
          dot.style.transform = `translate(${finalX}px, ${finalY}px)`;
        }
      });
      
      // Reset dots to original position after scrolling stops
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        dots.forEach((dot) => {
          if (dot._isHole) return;
          
          // Skip scroll reset animations if ASCII mode is active
          const container = dot.closest('[data-dots-container-init]');
          if (container && container.classList.contains('ascii-active')) return;
          
          if (typeof gsap !== 'undefined') {
            gsap.to(dot, {
              x: 0,
              y: 0,
              duration: 0.8,
              ease: "elastic.out(1, 0.5)",
              overwrite: "auto"
            });
          } else {
            dot.style.transform = 'translate(0px, 0px)';
          }
        });
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

    const accentMap = {
      game: '#FFB74C',
      programming: '#A8FF51',
      art: '#F05CEB',
      design: '#5CB3FF'
    };

    window.projectMap = {};
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

      grid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

// ------------------- End Dynamic Projects Loader --------------- 

// Color Sampler for Interactive Dots
function legacyColorSampler() {
  const dots = document.querySelectorAll('.dots-container .dot');
  const colors = window.__DOT_GRIDS[window.__DOT_GRIDS.length - 1]; // Get the last added colors

  dots.forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      const rect = dot.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const color = getColorAtPixel(x, y);
      if (color) {
        dot.style.backgroundColor = color;
      }
    });

    dot.addEventListener('mouseleave', () => {
      dot.style.backgroundColor = colors.base;
    });
  });
}

function getColorAtPixel(x, y) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, 1, 1);

  const imageData = ctx.getImageData(0, 0, 1, 1);
  const data = imageData.data;

  // Assuming the dot is on a transparent background, we need to get the pixel from the parent container
  // This is a simplified approach and might need adjustment based on actual container structure
  const parent = dot.parentElement;
  if (!parent) return null;

  const rect = parent.getBoundingClientRect();
  const containerX = rect.left + window.scrollX;
  const containerY = rect.top + window.scrollY;

  const pixelX = x - containerX;
  const pixelY = y - containerY;

  // This is a very basic implementation. For a more robust solution,
  // you'd need to draw the dots onto a canvas and then read pixel data.
  // For now, we'll just return a placeholder or null.
  // A proper implementation would involve a canvas overlay or a different approach.
  // For this example, we'll just return a placeholder.
  return null; // Placeholder for actual pixel reading
} 

/* ------------------- Real-Time Colour Sampler ------------------- */
function initColorSampler() {
  const supportsMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
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
  let videoEl, canvasEl, ctx;
  let lastColour = '#245E51';


  // helper to measure monospace character metrics at given font size
  function measureChar(px=6) {
    if (measureChar.cache && measureChar.cache[px]) return measureChar.cache[px];
    const span = document.createElement('span');
    span.textContent = 'M';
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.fontFamily = 'Courier, monospace';
    span.style.fontSize = px + 'px';
    document.body.appendChild(span);
    const rect = span.getBoundingClientRect();
    document.body.removeChild(span);
    measureChar.cache = measureChar.cache || {};
    measureChar.cache[px] = { w: rect.width, h: rect.height };
    return measureChar.cache[px];
  }

  btn.addEventListener('click', async () => {
    if (active) {
      stopSampling();
      return;
    }

    // Show oracle overlay before starting mood sampling
    showMoodOracleOverlay(async () => {
      if (supportsMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          startSampling(stream);
        } catch (err) {
          console.warn('Webcam permission denied or unavailable, using fallback colour', err);
          fallbackSample();
        }
      } else {
        fallbackSample();
      }
    });
  });

  asciiBtn.addEventListener('click', () => {
    if (!active) return; // Only works when mood is active
    
    asciiActive = !asciiActive;
    asciiBtn.classList.toggle('active', asciiActive);
    
    const container = document.querySelector('[data-dots-container-init]');
    if (container) {
      if (asciiActive) {
        // Kill all GSAP animations on dots when entering ASCII mode
        const dots = container.querySelectorAll('.dot');
        if (typeof gsap !== 'undefined') {
          gsap.killTweensOf(dots);
          // Reset transforms
          gsap.set(dots, { x: 0, y: 0, clearProps: "transform" });
        }
      }
      
      container.classList.toggle('ascii-active', asciiActive);
      // Rebuild grid with new spacing
      if (container._rebuildGrid) {
        container._rebuildGrid();
      }
    }
    
    if (!asciiActive) {
      resetDotsAppearance();
    }
  });

  function startSampling(stream) {
    active = true;
    btn.classList.add('active');
    asciiBtn.style.display = 'block'; // Show ASCII button
    videoStream = stream;

    videoEl = document.createElement('video');
    videoEl.style.display = 'none';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.srcObject = stream;
    videoEl.play();
    document.body.appendChild(videoEl);

    canvasEl = document.createElement('canvas');
    ctx = canvasEl.getContext('2d');

    sampleLoop();

  }

  // ASCII character map for different brightness levels
  const asciiChars = '@%#*+=-:. ';

  function sampleLoop() {
    if (!active) return;
    if (videoEl.readyState >= 2) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      
      if (asciiActive) {
        applyAsciiToDots();
      } else {
        const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 40) { // sample subset for performance
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        const rgb = `rgb(${r}, ${g}, ${b})`;
        applyColour(rgb);
      }
    }
    requestAnimationFrame(sampleLoop);
  }

  function applyAsciiToDots() {
    const container = document.querySelector('[data-dots-container-init]');
    if (!container || !container.classList.contains('ascii-active')) return;
    
    const dots = Array.from(container.querySelectorAll('.dot')).filter(d => !d._isHole);
    if (!dots.length) return;

    const cols = container._cols || Math.sqrt(dots.length);
    const rows = container._rows || Math.ceil(dots.length / cols);
    
    // Create a smaller canvas for ASCII sampling that matches dot grid dimensions
    const asciiCanvas = document.createElement('canvas');
    const asciiCtx = asciiCanvas.getContext('2d');
    asciiCanvas.width = cols;
    asciiCanvas.height = rows;
    
    // Draw the video frame scaled to match the dot grid
    asciiCtx.drawImage(videoEl, 0, 0, cols, rows);
    const imageData = asciiCtx.getImageData(0, 0, cols, rows);
    const data = imageData.data;
    
    // Convert each pixel to ASCII character
    dots.forEach((dot, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const pixelIndex = (row * cols + col) * 4;
      
      if (pixelIndex < data.length && row < rows && col < cols) {
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        // Calculate brightness (invert so darker areas get denser characters)
        const brightness = (r + g + b) / 3;
        const charIndex = Math.floor(((255 - brightness) / 255) * (asciiChars.length - 1));
        const char = asciiChars[charIndex];
        
        // Apply ASCII character to dot
        dot.textContent = char;
        dot.style.backgroundColor = 'transparent';
        dot.style.color = lastColour;
        dot.style.fontFamily = 'Courier New, Courier, monospace';
        dot.style.fontSize = 'inherit';
        dot.style.display = 'flex';
        dot.style.alignItems = 'center';
        dot.style.justifyContent = 'center';
        dot.style.lineHeight = '1';
        dot.style.transform = 'none'; // Ensure no transforms interfere
      }
    });
  }

  function applyColour(colour) {
    if (colour === lastColour) return;
    lastColour = colour;
    if (typeof gsap !== 'undefined') {
      gsap.to('.dot', { backgroundColor: colour, duration: 0.6 });
    } else {
      document.querySelectorAll('.dot').forEach(d => d.style.backgroundColor = colour);
    }
    if (window.__DOT_GRIDS) {
      window.__DOT_GRIDS.forEach(c => c.base = colour);
    }
  }

  function stopSampling() {
    active = false;
    asciiActive = false;
    btn.classList.remove('active');
    asciiBtn.classList.remove('active');
    asciiBtn.style.display = 'none'; // Hide ASCII button
    
    const container = document.querySelector('[data-dots-container-init]');
    if (container) {
      container.classList.remove('ascii-active');
      // Rebuild grid with normal spacing
      if (container._rebuildGrid) {
        container._rebuildGrid();
      }
    }
    
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    if (videoEl) videoEl.remove();
    
    resetDotsAppearance();
    applyColour('#245E51');
  }

  function fallbackSample() {
    btn.classList.add('active');
    const computed = getComputedStyle(document.body).backgroundColor || '#245E51';
    applyColour(computed);
  }


  function resetDotsAppearance() {
    const dots = document.querySelectorAll('.dots-container .dot');
    dots.forEach(dot => {
      dot.textContent = '';
      dot.style.color = '';
      dot.style.backgroundColor = lastColour;
      dot.style.fontFamily = '';
      dot.style.fontSize = '';
      dot.style.display = '';
      dot.style.alignItems = '';
      dot.style.justifyContent = '';
      dot.style.lineHeight = '';
    });
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

  cards.forEach((card, idx) => {
    // Reset any drag offsets gradually
    // We'll grab current gsap properties for continuity
    const currentX = gsap.getProperty(card, 'x');
    const currentY = gsap.getProperty(card, 'y');

    const rect = card.getBoundingClientRect();
    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;

    const deltaX = centerX - cardCenterX;
    const deltaY = centerY - cardCenterY;

    gsap.to(card, {
      x: currentX + deltaX,
      y: currentY + deltaY,
      rotation: -4 + idx * 2,
      duration: 0.6,
      ease: 'power3.out',
      delay: idx * 0.05
    });

    card.style.zIndex = 100 + idx;
  });
  // when animation ends, re-enable controls
  const totalDuration = 0.6 + ((cards.length - 1) * 0.05);
  gsap.delayedCall(totalDuration, () => {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
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
  if (!cards.length) return;

  // Ensure all cards start from grid-aligned position
  cards.forEach(card => {
    gsap.set(card, { x: 0, y: 0, rotation: 0 });
  });

  // Capture initial positions
  const firstRects = cards.map(c => c.getBoundingClientRect());

  // Shuffle array (Fisher–Yates)
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  // Re-append in new order to change layout flow
  cards.forEach(card => grid.appendChild(card));

  // Capture new positions
  const lastRects = cards.map(c => c.getBoundingClientRect());

  // FLIP animation
  cards.forEach((card, idx) => {
    const dx = firstRects[idx].left - lastRects[idx].left;
    const dy = firstRects[idx].top - lastRects[idx].top;

    gsap.fromTo(card, { x: dx, y: dy }, {
      x: 0,
      y: 0,
      rotation: (Math.random() * 8) - 4,
      duration: 0.6,
      ease: 'power3.out'
    });

    card.style.zIndex = 1 + idx;
  });
  // fixed length shuffle animation (~0.6s)
  gsap.delayedCall(0.6, () => {
    cardActionInProgress = false;
    setCardActionButtonsDisabled(false);
  });
}
/* ----------------- End Card Stack & Shuffle Controls ----------------- */ 

/* ================= Visitor Heatmap ================= */
// Replace CountAPI with KVDB.io key-value bucket (create one at https://kvdb.io)
const KVDB_BUCKET = 'GpuEbRgGPvKxLPDh5ktKRc'; // <-- replace with your bucket id
const HEATMAP_ENDPOINT = `https://kvdb.io/${KVDB_BUCKET}`;

// KVDB service state tracking
let kvdbAvailable = true;
let kvdbRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1000; // 1 second base delay

// Enhanced error handling with retry logic and exponential backoff
async function kvdbRequest(url, options = {}, retryAttempt = 0) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`KVDB request failed: ${response.status} ${response.statusText}`);
    }
    
    // Reset retry count on successful request
    kvdbRetryCount = 0;
    kvdbAvailable = true;
    
    return response;
  } catch (error) {
    console.warn(`KVDB request failed (attempt ${retryAttempt + 1}):`, error.message);
    
    // Check if we should retry
    if (retryAttempt < MAX_RETRY_ATTEMPTS && !error.name === 'AbortError') {
      const delay = RETRY_BASE_DELAY * Math.pow(2, retryAttempt); // Exponential backoff
      console.log(`Retrying KVDB request in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return kvdbRequest(url, options, retryAttempt + 1);
    }
    
    // Mark KVDB as potentially unavailable after max retries
    if (retryAttempt >= MAX_RETRY_ATTEMPTS) {
      kvdbRetryCount++;
      if (kvdbRetryCount >= 3) {
        kvdbAvailable = false;
        console.warn('KVDB service marked as unavailable after multiple failures');
      }
    }
    
    throw error;
  }
}

async function fetchCount(key) {
  if (!kvdbAvailable) {
    console.log('KVDB unavailable, skipping fetch for key:', key);
    return null;
  }
  
  try {
    const response = await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`);
    const text = await response.text();
    
    // Handle both old format (plain number) and new format (JSON)
    try {
      const parsed = JSON.parse(text);
      return parsed.count || 0;
    } catch {
      return parseInt(text, 10) || 0;
    }
  } catch (error) {
    console.warn(`Failed to fetch count for key ${key}:`, error.message);
    return null;
  }
}

async function hitCount(key) {
  let current = await fetchCount(key);
  if (current === null) current = 0;
  const next = current + 1;
  
  if (!kvdbAvailable) {
    console.log('KVDB unavailable, returning local count only');
    return next;
  }
  
  try {
    await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`, { 
      method: 'PUT', 
      body: String(next),
      headers: {
        'Content-Type': 'text/plain'
      }
    });
    return next;
  } catch (error) {
    console.warn(`Failed to update count for key ${key}:`, error.message);
    return next; // Return the incremented count even if remote update failed
  }
}

// Local cache for click counts to minimise network calls
const dotClickCounts = {};
let oracleShownThisSession = false;
let heatmapDataLoaded = false; // Track if we've loaded data this session
let globalClickSequence = 0; // Global counter for click ordering

// Batch operations to reduce API calls
const pendingWrites = new Map();
let writeTimeout = null;
const MAX_STORED_CLICKS = 60; // Only store last 60 clicks

// Load all heatmap data once per session from localStorage + selective KVDB sync
async function loadHeatmapData(container) {
  if (heatmapDataLoaded) return;
  heatmapDataLoaded = true;

  const dots = Array.from(container.querySelectorAll('.dot')).filter(d => !d._isHole);
  
  // First, load everything from localStorage (instant)
  dots.forEach(dot => {
    const key = getDotKey(dot);
    const lsKey = `heat_${key}`;
    
    try {
      const data = localStorage.getItem(lsKey);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed.count > 0) {
            dotClickCounts[key] = parsed.count;
            globalClickSequence = Math.max(globalClickSequence, parsed.sequence || 0);
            applyHeatToDot(dot, parsed.count, false);
          }
        } catch (parseError) {
          console.warn(`Failed to parse localStorage data for key ${lsKey}:`, parseError);
          // Handle old format
          const count = parseInt(data, 10) || 0;
          if (count > 0) {
            dotClickCounts[key] = count;
            applyHeatToDot(dot, count, false);
            // Convert to new format
            const newEntry = { count, sequence: globalClickSequence++, timestamp: Date.now() };
            localStorage.setItem(lsKey, JSON.stringify(newEntry));
          }
        }
      }
    } catch (storageError) {
      console.warn(`Failed to access localStorage for key ${lsKey}:`, storageError);
    }
  });

  // Then sync with KVDB only for dots that have local data (much fewer calls)
  const keysToSync = Object.keys(dotClickCounts);
  if (keysToSync.length === 0 || !kvdbAvailable) {
    if (!kvdbAvailable) {
      console.log('KVDB unavailable, skipping remote sync');
    }
    return;
  }

  console.log(`Syncing ${keysToSync.length} keys with KVDB...`);

  // Batch sync in chunks of 5 to avoid overwhelming the API (reduced from 10)
  for (let i = 0; i < keysToSync.length; i += 5) {
    const chunk = keysToSync.slice(i, i + 5);
    
    try {
      await Promise.allSettled(chunk.map(async key => {
        try {
          const response = await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`);
          const remoteText = await response.text();
          let remoteCount = 0;
          
          try {
            const parsed = JSON.parse(remoteText);
            remoteCount = parsed.count || 0;
          } catch {
            remoteCount = parseInt(remoteText, 10) || 0;
          }
          
          if (remoteCount > dotClickCounts[key]) {
            // Remote has more clicks, update local
            dotClickCounts[key] = remoteCount;
            const newEntry = { count: remoteCount, sequence: globalClickSequence++, timestamp: Date.now() };
            
            try {
              localStorage.setItem(`heat_${key}`, JSON.stringify(newEntry));
            } catch (storageError) {
              console.warn(`Failed to update localStorage for key ${key}:`, storageError);
            }
            
            const dot = container.querySelector(`[data-key="${key}"]`) || 
                       Array.from(container.querySelectorAll('.dot')).find(d => getDotKey(d) === key);
            if (dot) applyHeatToDot(dot, remoteCount, false);
          }
        } catch (error) {
          console.warn(`Failed to sync key ${key} with KVDB:`, error.message);
        }
      }));
    } catch (error) {
      console.warn(`Batch sync failed for chunk starting at index ${i}:`, error.message);
    }
    
    // Small delay between chunks to prevent rate limiting
    if (i + 5 < keysToSync.length) {
      await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay
    }
  }
  
  console.log('KVDB sync completed');
}

// Batch write pending changes every 2 seconds
async function flushPendingWrites() {
  if (pendingWrites.size === 0) return;
  
  const writes = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  
  if (!kvdbAvailable) {
    console.log('KVDB unavailable, skipping batch write');
    return;
  }
  
  console.log(`Flushing ${writes.length} pending writes to KVDB...`);
  
  // Process writes with proper error handling and retry logic
  const writePromises = writes.map(async ([key, entry]) => {
    try {
      await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`, { 
        method: 'PUT', 
        body: JSON.stringify(entry),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log(`Successfully wrote key: ${key}`);
    } catch (error) {
      console.warn(`Failed to write key ${key} to KVDB:`, error.message);
      // Re-queue failed writes for next batch
      pendingWrites.set(key, entry);
    }
  });
  
  // Use Promise.allSettled to handle all writes regardless of individual failures
  const results = await Promise.allSettled(writePromises);
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  if (failed > 0) {
    console.warn(`Batch write completed: ${successful} successful, ${failed} failed`);
  } else {
    console.log(`Batch write completed successfully: ${successful} writes`);
  }
}

async function incrementHeat(dot) {
  try {
    const key = getDotKey(dot);
    
    // Validate dot coordinates before processing
    if (!key || key.includes('undefined') || key.includes('null')) {
      console.warn('Invalid dot key generated:', key);
      return;
    }
    
    globalClickSequence++;
    
    // Always increment locally first (instant feedback)
    const currentCount = dotClickCounts[key] || 0;
    const newCount = currentCount + 1;
    dotClickCounts[key] = newCount;
    
    // Store with sequence number for ordering
    const clickEntry = {
      count: newCount,
      sequence: globalClickSequence,
      timestamp: Date.now()
    };
    
    // Validate click entry data
    if (newCount <= 0 || globalClickSequence <= 0) {
      console.warn('Invalid click entry data:', clickEntry);
      return;
    }
    
    // Update localStorage immediately with error handling
    try {
      localStorage.setItem(`heat_${key}`, JSON.stringify(clickEntry));
    } catch (storageError) {
      console.warn(`Failed to update localStorage for key ${key}:`, storageError);
      // Continue execution even if localStorage fails
    }
    
    // Apply visual change immediately
    try {
      applyHeatToDot(dot, newCount, true);
    } catch (visualError) {
      console.warn(`Failed to apply visual feedback for dot:`, visualError);
    }
    
    // Queue for batch write to KVDB (only if KVDB is available)
    if (kvdbAvailable) {
      pendingWrites.set(key, clickEntry);
    } else {
      console.log('KVDB unavailable, click stored locally only');
    }
    
    // Clean up old entries if we exceed MAX_STORED_CLICKS
    try {
      cleanupOldEntries();
    } catch (cleanupError) {
      console.warn('Failed to cleanup old entries:', cleanupError);
    }
    
    // Debounce batch writes
    clearTimeout(writeTimeout);
    writeTimeout = setTimeout(() => {
      flushPendingWrites().catch(error => {
        console.warn('Batch write failed:', error);
      });
    }, 2000);
    
  } catch (error) {
    console.error('Critical error in incrementHeat:', error);
    // Ensure the system continues to function even if this fails
  }
}

function cleanupOldEntries() {
  try {
    // Get all stored entries with error handling
    const entries = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('heat_')) {
          try {
            const data = localStorage.getItem(key);
            if (data) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.sequence && parsed.count > 0) {
                  entries.push({ key, ...parsed });
                }
              } catch (parseError) {
                console.warn(`Failed to parse entry for key ${key}:`, parseError);
                // Handle old format - convert to new format
                const count = parseInt(data, 10) || 0;
                if (count > 0) {
                  const newEntry = { count, sequence: globalClickSequence++, timestamp: Date.now() };
                  try {
                    localStorage.setItem(key, JSON.stringify(newEntry));
                    entries.push({ key, ...newEntry });
                  } catch (storageError) {
                    console.warn(`Failed to convert old format for key ${key}:`, storageError);
                  }
                }
              }
            }
          } catch (itemError) {
            console.warn(`Failed to access localStorage item ${key}:`, itemError);
          }
        }
      }
    } catch (storageError) {
      console.warn('Failed to iterate localStorage:', storageError);
      return; // Exit early if we can't access localStorage
    }
    
    // Validate entries count
    if (entries.length <= MAX_STORED_CLICKS) {
      return; // No cleanup needed
    }
    
    console.log(`Cleaning up ${entries.length - MAX_STORED_CLICKS} old entries...`);
    
    // Sort entries by sequence (oldest first) with error handling
    try {
      entries.sort((a, b) => {
        const seqA = a.sequence || 0;
        const seqB = b.sequence || 0;
        return seqA - seqB;
      });
    } catch (sortError) {
      console.warn('Failed to sort entries for cleanup:', sortError);
      return;
    }
    
    const toRemove = entries.slice(0, entries.length - MAX_STORED_CLICKS);
    let removedCount = 0;
    let failedCount = 0;
    
    toRemove.forEach(entry => {
      try {
        // Remove from localStorage
        localStorage.removeItem(entry.key);
        
        // Remove from memory cache
        const dotKey = entry.key.replace('heat_', '');
        if (dotKey && dotClickCounts[dotKey]) {
          delete dotClickCounts[dotKey];
        }
        
        // Remove from KVDB (only if available)
        if (kvdbAvailable && dotKey) {
          kvdbRequest(`${HEATMAP_ENDPOINT}/${dotKey}`, { method: 'DELETE' })
            .catch(error => {
              console.warn(`Failed to delete key ${dotKey} from KVDB:`, error.message);
            });
        }
        
        removedCount++;
      } catch (removeError) {
        console.warn(`Failed to remove entry ${entry.key}:`, removeError);
        failedCount++;
      }
    });
    
    if (removedCount > 0) {
      console.log(`Cleanup completed: ${removedCount} entries removed${failedCount > 0 ? `, ${failedCount} failed` : ''}`);
    }
    
  } catch (error) {
    console.error('Critical error in cleanupOldEntries:', error);
  }
}

function applyHeatToDot(dot, count, animate=true) {
  const col = colourFromCount(count);
  dot._heatmapColor = col; // Store heatmap color
  dot._heatmapCount = count; // Store count for reference
  
  // For the reveal animation, we just store the color and count
  // The actual animation will be handled by animateHeatmapReveal
  if (!animate) {
    return; // Don't apply visual changes during data loading
  }
  
  if (typeof gsap !== 'undefined') {
    gsap.to(dot, { backgroundColor: col, duration: 0.6 });
  } else {
    dot.style.backgroundColor = col;
  }
}

function colourFromCount(count) {
  // Color progression from green to red
  if (count === 0) return '#245E51'; // Default dark green
  if (count === 1) return '#A8FF51'; // Solid green for first click
  if (count === 2) return '#FFFF51'; // Yellow for second click
  if (count === 3) return '#FF9F51'; // Orange for third click
  if (count <= 5) return '#FF6B47'; // Red-orange for 4-5 clicks
  return '#FF4C24'; // Deep red for 6+ clicks
}

// Beautiful avant-garde heatmap reveal animation
async function animateHeatmapReveal(container) {
  // Only play the reveal animation once per session
  if (window.heatmapRevealPlayed) {
    // Just show the dots without animation
    const dots = Array.from(container.querySelectorAll('.dot')).filter(d => !d._isHole);
    const heatmapDots = dots.filter(d => d._heatmapCount && d._heatmapCount > 0);
    heatmapDots.forEach(dot => {
      gsap.set(dot, { backgroundColor: dot._heatmapColor, scale: 1, opacity: 1 });
    });
    return;
  }
  
  window.heatmapRevealPlayed = true;
  
  const dots = Array.from(container.querySelectorAll('.dot')).filter(d => !d._isHole);
  const heatmapDots = dots.filter(d => d._heatmapCount && d._heatmapCount > 0);
  
  if (heatmapDots.length === 0) return;
  
  // Create ripple effect from center
  const centerX = container.clientWidth / 2;
  const centerY = container.clientHeight / 2;
  
  // Sort dots by distance from center for wave effect
  const sortedDots = heatmapDots.map(dot => {
    const rect = dot.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const x = rect.left - containerRect.left + rect.width / 2;
    const y = rect.top - containerRect.top + rect.height / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    return { dot, distance, x, y };
  }).sort((a, b) => a.distance - b.distance);
  
  // Create multiple ripple waves for better effect
  const maxDimension = Math.max(container.clientWidth, container.clientHeight);
  const rippleCount = 3;
  
  for (let i = 0; i < rippleCount; i++) {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 2px solid rgba(168,255,81,${0.8 - i * 0.2});
      pointer-events: none;
      z-index: 1000;
      transform: translate(-50%, -50%);
    `;
    container.appendChild(ripple);
    
    // Animate ripple expansion with staggered timing
    gsap.to(ripple, {
      width: maxDimension * 2.5,
      height: maxDimension * 2.5,
      duration: 1.8,
      delay: i * 0.15,
      ease: "power2.out"
    });
    
    // Animate ripple fade out
    gsap.to(ripple, {
      opacity: 0,
      duration: 0.8,
      delay: i * 0.15 + 1.0,
      ease: "power2.out",
      onComplete: () => {
        ripple.remove();
      }
    });
  }
  
  // Reset all heatmap dots to transparent initially
  heatmapDots.forEach(dot => {
    gsap.set(dot, { 
      backgroundColor: 'rgba(36, 94, 81, 0)',
      scale: 0.3,
      opacity: 0
    });
  });
  
  // Animate dots in waves with staggered timing
  for (let i = 0; i < sortedDots.length; i++) {
    const { dot, distance } = sortedDots[i];
    const delay = (distance / 200) * 0.1; // Stagger based on distance
    
    // Create individual particle effect for each dot
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: 2px;
      height: 2px;
      background: ${dot._heatmapColor};
      border-radius: 50%;
      pointer-events: none;
      z-index: 999;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 10px ${dot._heatmapColor};
    `;
    container.appendChild(particle);
    
    // Animate particle from center to dot position
    const rect = dot.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetX = rect.left - containerRect.left + rect.width / 2;
    const targetY = rect.top - containerRect.top + rect.height / 2;
    
    gsap.to(particle, {
      x: targetX - centerX,
      y: targetY - centerY,
      duration: 0.8,
      delay: delay,
      ease: "power2.out",
      onComplete: () => {
        particle.remove();
      }
    });
    
    // Animate the actual dot
    gsap.to(dot, {
      backgroundColor: dot._heatmapColor,
      scale: 1,
      opacity: 1,
      duration: 0.6,
      delay: delay + 0.4,
      ease: "elastic.out(1, 0.5)",
      onStart: () => {
        // Add glow effect
        gsap.to(dot, {
          boxShadow: `0 0 20px ${dot._heatmapColor}`,
          duration: 0.3,
          yoyo: true,
          repeat: 1
        });
      }
    });
  }
  
  // Create floating energy particles
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const floater = document.createElement('div');
      floater.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        background: rgba(168,255,81,0.6);
        border-radius: 50%;
        pointer-events: none;
        z-index: 998;
        top: ${Math.random() * 100}%;
        left: ${Math.random() * 100}%;
      `;
      container.appendChild(floater);
      
      gsap.to(floater, {
        y: -100,
        x: Math.random() * 100 - 50,
        opacity: 0,
        duration: 2 + Math.random() * 2,
        ease: "power1.out",
        onComplete: () => {
          floater.remove();
        }
      });
    }, Math.random() * 1000);
  }
}

async function revealHeatmap(container) {
  console.log('Starting heatmap reveal with progressive loading...');
  
  // Start with immediate fallback dots for instant feedback
  showFallbackHeatmap(container);
  
  // Load data with timeout and progressive updates
  const loadingPromise = loadHeatmapDataProgressive(container);
  
  // Set a maximum wait time for KVDB data
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      console.log('KVDB loading timeout reached, proceeding with available data');
      resolve('timeout');
    }, 3000); // 3 second timeout
  });
  
  // Race between data loading and timeout
  const result = await Promise.race([loadingPromise, timeoutPromise]);
  
  // Clean up loading animation
  cleanupLoadingAnimation();
  
  // Create beautiful reveal animation with whatever data we have
  await animateHeatmapReveal(container);
  
  console.log('Heatmap reveal completed:', result === 'timeout' ? 'with timeout' : 'successfully');
}

// Show immediate fallback heatmap for instant feedback
function showFallbackHeatmap(container) {
  const dots = Array.from(container.querySelectorAll('.dot')).filter(d => !d._isHole);
  
  // Create some random "warm" spots based on localStorage or generate random ones
  const fallbackSpots = generateFallbackHeatSpots(dots);
  
  fallbackSpots.forEach(({ dot, intensity }) => {
    const color = colourFromCount(intensity);
    dot._heatmapColor = color;
    dot._heatmapCount = intensity;
    dot._isFallback = true; // Mark as fallback data
    
    // Apply subtle initial styling
    gsap.set(dot, { 
      backgroundColor: color,
      opacity: 0.3,
      scale: 0.8
    });
  });
  
  console.log(`Applied ${fallbackSpots.length} fallback heat spots`);
}

// Generate fallback heat spots based on localStorage or random patterns
function generateFallbackHeatSpots(dots) {
  const spots = [];
  const maxSpots = Math.min(15, Math.floor(dots.length * 0.05)); // 5% of dots, max 15
  
  // First, try to use any existing localStorage data
  const existingKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('heat_')) {
      try {
        const data = localStorage.getItem(key);
        const parsed = JSON.parse(data);
        if (parsed.count > 0) {
          existingKeys.push({ key: key.replace('heat_', ''), count: parsed.count });
        }
      } catch (e) {
        // Handle old format
        const count = parseInt(data, 10) || 0;
        if (count > 0) {
          existingKeys.push({ key: key.replace('heat_', ''), count });
        }
      }
    }
  }
  
  // Use existing data if available
  existingKeys.slice(0, maxSpots).forEach(({ key, count }) => {
    const dot = dots.find(d => getDotKey(d) === key);
    if (dot) {
      spots.push({ dot, intensity: Math.min(count, 10) });
    }
  });
  
  // Fill remaining spots with attractive random patterns
  const remainingSpots = maxSpots - spots.length;
  if (remainingSpots > 0) {
    // Create clusters around interesting areas (corners, center, golden ratio points)
    const interestingPoints = [
      { x: 0.2, y: 0.2 }, // Top-left
      { x: 0.8, y: 0.2 }, // Top-right
      { x: 0.2, y: 0.8 }, // Bottom-left
      { x: 0.8, y: 0.8 }, // Bottom-right
      { x: 0.618, y: 0.382 }, // Golden ratio point
      { x: 0.382, y: 0.618 }, // Golden ratio point
    ];
    
    const container = dots[0].parentElement;
    const containerRect = container.getBoundingClientRect();
    
    for (let i = 0; i < remainingSpots; i++) {
      const point = interestingPoints[i % interestingPoints.length];
      const targetX = containerRect.width * point.x;
      const targetY = containerRect.height * point.y;
      
      // Find closest dot to this interesting point
      let closestDot = null;
      let minDistance = Infinity;
      
      dots.forEach(dot => {
        if (spots.some(s => s.dot === dot)) return; // Skip already used dots
        
        const rect = dot.getBoundingClientRect();
        const dotX = rect.left - containerRect.left + rect.width / 2;
        const dotY = rect.top - containerRect.top + rect.height / 2;
        const distance = Math.hypot(dotX - targetX, dotY - targetY);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestDot = dot;
        }
      });
      
      if (closestDot) {
        const intensity = Math.floor(Math.random() * 5) + 1; // 1-5 intensity
        spots.push({ dot: closestDot, intensity });
      }
    }
  }
  
  return spots;
}

// Progressive loading with immediate updates
async function loadHeatmapDataProgressive(container) {
  if (heatmapDataLoaded) return 'already-loaded';
  heatmapDataLoaded = true;

  const dots = Array.from(container.querySelectorAll('.dot')).filter(d => !d._isHole);
  
  // First, load everything from localStorage (instant)
  dots.forEach(dot => {
    const key = getDotKey(dot);
    const lsKey = `heat_${key}`;
    
    try {
      const data = localStorage.getItem(lsKey);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed.count > 0) {
            dotClickCounts[key] = parsed.count;
            globalClickSequence = Math.max(globalClickSequence, parsed.sequence || 0);
            
            // Update fallback data immediately if this is better
            if (dot._isFallback && parsed.count > dot._heatmapCount) {
              const color = colourFromCount(parsed.count);
              dot._heatmapColor = color;
              dot._heatmapCount = parsed.count;
              dot._isFallback = false;
              
              // Smooth transition to new color
              gsap.to(dot, {
                backgroundColor: color,
                opacity: 0.6,
                scale: 0.9,
                duration: 0.3
              });
            }
          }
        } catch (parseError) {
          console.warn(`Failed to parse localStorage data for key ${lsKey}:`, parseError);
        }
      }
    } catch (storageError) {
      console.warn(`Failed to access localStorage for key ${lsKey}:`, storageError);
    }
  });

  // Then sync with KVDB only if available and we have keys to sync
  const keysToSync = Object.keys(dotClickCounts);
  if (keysToSync.length === 0 || !kvdbAvailable) {
    console.log('No KVDB sync needed or KVDB unavailable');
    return 'local-only';
  }

  console.log(`Progressive sync of ${keysToSync.length} keys with KVDB...`);

  // Batch sync in smaller chunks with immediate updates
  for (let i = 0; i < keysToSync.length; i += 3) { // Smaller chunks for faster updates
    const chunk = keysToSync.slice(i, i + 3);
    
    try {
      await Promise.allSettled(chunk.map(async key => {
        try {
          const response = await kvdbRequest(`${HEATMAP_ENDPOINT}/${key}`);
          const remoteText = await response.text();
          let remoteCount = 0;
          
          try {
            const parsed = JSON.parse(remoteText);
            remoteCount = parsed.count || 0;
          } catch {
            remoteCount = parseInt(remoteText, 10) || 0;
          }
          
          if (remoteCount > dotClickCounts[key]) {
            // Remote has more clicks, update immediately
            dotClickCounts[key] = remoteCount;
            const newEntry = { count: remoteCount, sequence: globalClickSequence++, timestamp: Date.now() };
            
            try {
              localStorage.setItem(`heat_${key}`, JSON.stringify(newEntry));
            } catch (storageError) {
              console.warn(`Failed to update localStorage for key ${key}:`, storageError);
            }
            
            // Find and update the dot immediately
            const dot = container.querySelector(`[data-key="${key}"]`) || 
                       Array.from(container.querySelectorAll('.dot')).find(d => getDotKey(d) === key);
            if (dot) {
              const color = colourFromCount(remoteCount);
              dot._heatmapColor = color;
              dot._heatmapCount = remoteCount;
              dot._isFallback = false;
              
              // Smooth progressive update
              gsap.to(dot, {
                backgroundColor: color,
                opacity: 0.8,
                scale: 1,
                duration: 0.4,
                ease: "power2.out"
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to sync key ${key} with KVDB:`, error.message);
        }
      }));
    } catch (error) {
      console.warn(`Batch sync failed for chunk starting at index ${i}:`, error.message);
    }
    
    // Small delay between chunks but don't block the UI
    if (i + 3 < keysToSync.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return 'completed';
}

// Attach click handler once DOM is ready
function initHeatmapClickHandler() {
  const container = document.querySelector('[data-dots-container-init]');
  if (!container) return;
  
  // Ensure container accepts clicks
  container.style.pointerEvents = 'auto';
  
  container.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.classList || !target.classList.contains('dot') || target._isHole) return;
    showOracleOverlay(() => revealHeatmap(container));
    incrementHeat(target);
  });
  
  // Enhanced page unload handler to ensure data persistence
  const handlePageUnload = async (e) => {
    if (pendingWrites.size > 0) {
      console.log(`Flushing ${pendingWrites.size} pending writes before page unload...`);
      
      // For beforeunload, we need to use sendBeacon or synchronous requests
      // as async operations may not complete
      const writes = Array.from(pendingWrites.entries());
      
      // Try to use sendBeacon for better reliability
      if (navigator.sendBeacon && kvdbAvailable) {
        writes.forEach(([key, entry]) => {
          const url = `${HEATMAP_ENDPOINT}/${key}`;
          const data = JSON.stringify(entry);
          
          try {
            const success = navigator.sendBeacon(url, data);
            if (!success) {
              console.warn(`Failed to send beacon for key: ${key}`);
            }
          } catch (error) {
            console.warn(`Beacon failed for key ${key}:`, error);
          }
        });
      } else {
        // Fallback to synchronous flush
        try {
          await flushPendingWrites();
        } catch (error) {
          console.warn('Failed to flush pending writes on unload:', error);
        }
      }
    }
  };
  
  // Add both beforeunload and unload handlers for better coverage
  window.addEventListener('beforeunload', handlePageUnload);
  window.addEventListener('unload', handlePageUnload);
  
  // Add visibility change handler to flush writes when tab becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pendingWrites.size > 0) {
      console.log('Tab hidden, flushing pending writes...');
      flushPendingWrites().catch(error => {
        console.warn('Failed to flush writes on visibility change:', error);
      });
    }
  });
  
  // Add debugging capabilities (can be toggled via console)
  window.heatmapDebug = {
    // Toggle debug logging
    enableDebug: () => {
      window.heatmapDebugEnabled = true;
      console.log('Heatmap debug logging enabled');
    },
    disableDebug: () => {
      window.heatmapDebugEnabled = false;
      console.log('Heatmap debug logging disabled');
    },
    
    // Get current state
    getState: () => ({
      kvdbAvailable,
      kvdbRetryCount,
      pendingWrites: pendingWrites.size,
      dotClickCounts: Object.keys(dotClickCounts).length,
      globalClickSequence,
      heatmapDataLoaded
    }),
    
    // Force flush pending writes
    flushNow: () => {
      console.log('Manually flushing pending writes...');
      return flushPendingWrites();
    },
    
    // Test KVDB connectivity
    testKvdb: async () => {
      console.log('Testing KVDB connectivity...');
      try {
        const response = await kvdbRequest(`${HEATMAP_ENDPOINT}/test`, {
          method: 'PUT',
          body: 'test'
        });
        console.log('KVDB test successful');
        return true;
      } catch (error) {
        console.error('KVDB test failed:', error);
        return false;
      }
    },
    
    // Get diagnostic info
    getDiagnostics: () => {
      const localStorageKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('heat_')) {
          localStorageKeys.push(key);
        }
      }
      
      return {
        state: window.heatmapDebug.getState(),
        localStorageEntries: localStorageKeys.length,
        endpoint: HEATMAP_ENDPOINT,
        maxStoredClicks: MAX_STORED_CLICKS,
        retrySettings: {
          maxRetries: MAX_RETRY_ATTEMPTS,
          baseDelay: RETRY_BASE_DELAY
        }
      };
    }
  };
  
  console.log('Heatmap click handler initialized. Use window.heatmapDebug for debugging.');
}

document.addEventListener('DOMContentLoaded', initHeatmapClickHandler);
/* =============== End Visitor Heatmap =============== */ 

// ---------- Oracle Overlay (mysterious message) ----------
function ensureOracleOverlay() {
  if (document.getElementById('oracle-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'oracle-overlay';
  Object.assign(ov.style, {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10000, opacity: 0, background: 'transparent'
  });
  ov.innerHTML = `<div style="font-family: 'Cinzel', serif; color:#A8FF51; font-size:clamp(1.5rem,4vw,3rem); text-align:center; text-shadow:0 0 15px rgba(168,255,81,0.6); transform: translateY(-25vh);">
      the oracle will remember you...<br/>as it has everyone prior
    </div>`;
  document.body.appendChild(ov);
}

function ensureMoodOracleOverlay() {
  if (document.getElementById('mood-oracle-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'mood-oracle-overlay';
  Object.assign(ov.style, {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10000, opacity: 0, background: 'transparent'
  });
  ov.innerHTML = `<div style="font-family: 'Cinzel', serif; color:#A8FF51; font-size:clamp(1.5rem,4vw,3rem); text-align:center; text-shadow:0 0 15px rgba(168,255,81,0.6); transform: translateY(-25vh);">
      the oracle perceives you...<br/>colors singing through the dots
    </div>`;
  document.body.appendChild(ov);
}

function showOracleOverlay(onFinish) {
  // Only show once per session
  if (oracleShownThisSession) {
    if (onFinish) onFinish();
    return;
  }
  oracleShownThisSession = true;
  
  ensureOracleOverlay();
  const ov = document.getElementById('oracle-overlay');
  if (!ov) { if (onFinish) onFinish(); return; }

  // Play mystical sound effect if available
  playOracleSound();

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(ov);
    gsap.set(ov, { opacity: 0, pointerEvents: 'auto' });
    gsap.to(ov, { opacity: 1, duration: 0.4, ease: 'power2.out', onComplete: () => {
      // Start loading animation immediately after oracle text appears
      setTimeout(() => {
        startLoadingAnimation();
        if (onFinish) onFinish();
      }, 600); // Reduced from 800ms
      
      // Continue fading out the oracle text
      gsap.to(ov, { opacity: 0, duration: 0.8, delay: 0.8, ease: 'power2.in', onComplete: () => {
        ov.style.pointerEvents = 'none';
      }});
    }});
  } else {
    ov.style.opacity = 1;
    setTimeout(() => {
      startLoadingAnimation();
      if (onFinish) onFinish();
    }, 1000); // Reduced from 1200ms
    setTimeout(() => {
      ov.style.opacity = 0;
    }, 2000);
  }
}

// Play mystical sound effect during oracle overlay
function playOracleSound() {
  try {
    // Create a subtle mystical sound using Web Audio API
    if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
      const audioContext = new (AudioContext || webkitAudioContext)();
      
      // Create a gentle mystical tone
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Set up mystical frequency sweep
      oscillator.frequency.setValueAtTime(150, audioContext.currentTime); // A3

      
      oscillator.type = 'sine';
      
      // Gentle fade in and out
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.3);
      gainNode.gain.linearRampToValueAtTime(0.05, audioContext.currentTime + 2.0);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 2.5);
    }
  } catch (error) {
    console.log('Audio not available:', error);
  }
}

// Start beautiful loading animation while data loads
function startLoadingAnimation() {
  const container = document.querySelector('[data-dots-container-init]');
  if (!container) return;
  
  // Create loading overlay with mystical particles
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'heatmap-loading-overlay';
  loadingOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 100%;
    pointer-events: none;
    z-index: 1000;
    background: radial-gradient(circle at center, rgba(168,255,81,0.05) 50%, transparent 99%);
  `;
  container.appendChild(loadingOverlay);
  
  // Create mystical loading particles
  createLoadingParticles(loadingOverlay);
  
  // Create pulsing energy waves
  createEnergyWaves(loadingOverlay);
  
  // Store reference for cleanup
  window.heatmapLoadingOverlay = loadingOverlay;
}

// Create mystical floating particles during loading
function createLoadingParticles(container) {
  const particleCount = 20;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'loading-particle';
    particle.style.cssText = `
      position: absolute;
      width: 3px;
      height: 3px;
      background: rgba(168,255,81,0.8);
      border-radius: 50%;
      pointer-events: none;
      box-shadow: 0 0 8px rgba(168,255,81,0.6);
    `;
    
    // Random starting position
    const startX = Math.random() * container.clientWidth;
    const startY = Math.random() * container.clientHeight;
    
    gsap.set(particle, { x: startX, y: startY, opacity: 0 });
    container.appendChild(particle);
    
    // Animate particle with floating motion
    const tl = gsap.timeline({ repeat: -1 });
    tl.to(particle, {
      opacity: 1,
      duration: 0.5,
      ease: "power2.out"
    })
    .to(particle, {
      x: startX + (Math.random() - 0.5) * 200,
      y: startY + (Math.random() - 0.5) * 200,
      duration: 3 + Math.random() * 2,
      ease: "sine.inOut"
    }, 0)
    .to(particle, {
      opacity: 0,
      duration: 0.5,
      ease: "power2.in"
    }, "-=0.5");
    
    // Stagger particle animations
    tl.delay(Math.random() * 2);
  }
}

// Create pulsing energy waves during loading
function createEnergyWaves(container) {
  const centerX = container.clientWidth / 2;
  const centerY = container.clientHeight / 2;
  const maxDimension = Math.max(container.clientWidth, container.clientHeight);
  
  // Create multiple energy waves
  for (let i = 0; i < 3; i++) {
    const wave = document.createElement('div');
    wave.className = 'energy-wave';
    wave.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      border: 1px solid rgba(168,255,81,0.3);
      border-radius: 50%;
      pointer-events: none;
      transform: translate(-50%, -50%);
    `;
    container.appendChild(wave);
    
    // Animate wave expansion
    const tl = gsap.timeline({ repeat: -1 });
    tl.fromTo(wave, {
      width: 20,
      height: 20,
      opacity: 0.6
    }, {
      width: maxDimension * 1.5,
      height: maxDimension * 1.5,
      opacity: 0,
      duration: 8,
      ease: "power2.out"
    });
    
    // Stagger wave animations
    tl.delay(i * 5);
  }
}

// Clean up loading animation
function cleanupLoadingAnimation() {
  const loadingOverlay = window.heatmapLoadingOverlay;
  if (loadingOverlay) {
    gsap.to(loadingOverlay, {
      opacity: 0,
      duration: 0.5,
      ease: "power2.out",
      onComplete: () => {
        loadingOverlay.remove();
        window.heatmapLoadingOverlay = null;
      }
    });
  }
}

let moodOracleShownThisSession = false;

function showMoodOracleOverlay(onFinish) {
  // Only show once per session
  if (moodOracleShownThisSession) {
    if (onFinish) onFinish();
    return;
  }
  moodOracleShownThisSession = true;
  
  ensureMoodOracleOverlay();
  const ov = document.getElementById('mood-oracle-overlay');
  if (!ov) { if (onFinish) onFinish(); return; }

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(ov);
    gsap.set(ov, { opacity: 0, pointerEvents: 'auto' });
    gsap.to(ov, { opacity: 1, duration: 0.4, ease: 'power2.out', onComplete: () => {
      // Execute the mood functionality after a brief moment
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 800);
      
      // Continue fading out the oracle text
      gsap.to(ov, { opacity: 0, duration: 1.0, delay: 1.2, ease: 'power2.in', onComplete: () => {
        ov.style.pointerEvents = 'none';
      }});
    }});
  } else {
    ov.style.opacity = 1;
    setTimeout(() => {
      if (onFinish) onFinish();
    }, 1200);
    setTimeout(() => {
      ov.style.opacity = 0;
    }, 2500);
  }
}
// ---------- End Oracle Overlay ----------

// Helper to derive unique key from dot position
function getDotKey(dot) {
  return `${dot._row}_${dot._col}`;
}