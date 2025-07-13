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
      const dotPx = parseFloat(style.fontSize);
      const gapPx = dotPx * 2;
      const contW = container.clientWidth;
      const contH = container.clientHeight;

      const cols  = Math.floor((contW + gapPx) / (dotPx + gapPx));
      const rows  = Math.floor((contH + gapPx) / (dotPx + gapPx));
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

    window.addEventListener("resize", buildGrid);
    buildGrid();

    let lastTime = 0, lastX = 0, lastY = 0;

    window.addEventListener("mousemove", e => {
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
  btn.innerHTML = '🎥';
  document.body.appendChild(btn);

  let active = false;
  let videoStream = null;
  let videoEl, canvasEl, ctx;
  let lastColour = '#245E51';
  let asciiActive = false;
  let asciiBtn;

  const asciiChars = ' .:-=+*#%@';

  btn.addEventListener('click', async () => {
    if (active) {
      stopSampling();
      return;
    }

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

  function startSampling(stream) {
    active = true;
    btn.classList.add('active');
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

    // Create secret ASCII toggle button if it doesn't exist
    if (!asciiBtn) {
      asciiBtn = document.createElement('button');
      asciiBtn.className = 'ascii-toggle-btn';
      asciiBtn.textContent = 'ASCII';
      document.body.appendChild(asciiBtn);
      setTimeout(() => asciiBtn.classList.add('show'), 100); // Fade in

      asciiBtn.addEventListener('click', () => {
        asciiActive = !asciiActive;
        asciiBtn.classList.toggle('active', asciiActive);
        if (asciiActive) {
          document.body.classList.add('ascii-mode');
          asciiLoop();
        } else {
          document.body.classList.remove('ascii-mode');
          resetDotsAppearance();
        }
      });
    }
  }

  function sampleLoop() {
    if (!active) return;
    if (videoEl.readyState >= 2) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
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
    requestAnimationFrame(sampleLoop);
  }

  function applyColour(colour) {
    if (asciiActive) return; // Don't change background during ASCII mode
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
    btn.classList.remove('active');
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    if (videoEl) videoEl.remove();
    if (asciiActive) {
      asciiActive = false;
      document.body.classList.remove('ascii-mode');
      if (asciiBtn) asciiBtn.classList.remove('active');
      resetDotsAppearance();
    }
    applyColour('#245E51');
  }

  function fallbackSample() {
    btn.classList.add('active');
    const computed = getComputedStyle(document.body).backgroundColor || '#245E51';
    applyColour(computed);
  }

  function asciiLoop() {
    if (!asciiActive) return;
    if (videoEl.readyState >= 2) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const frame = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
      const dots = document.querySelectorAll('.dots-container .dot');
      dots.forEach(dot => {
        if (dot._isHole) return;
        const parent = dot.parentElement;
        const cols = parent? parent._cols || 1 : 1;
        const rows = parent? parent._rows || 1 : 1;
        const col = dot._col || 0;
        const row = dot._row || 0;
        const x = Math.floor(col / cols * canvasEl.width);
        const y = Math.floor(row / rows * canvasEl.height);
        const idx = (y * canvasEl.width + x) * 4;
        const r = frame[idx];
        const g = frame[idx + 1];
        const b = frame[idx + 2];
        const brightness = (r + g + b) / 3 / 255;
        const charIndex = Math.min(asciiChars.length - 1, Math.floor(brightness * (asciiChars.length - 1)));
        const char = asciiChars[charIndex];
        dot.textContent = char;
        dot.style.color = `rgb(${r},${g},${b})`;
      });
    }
    requestAnimationFrame(asciiLoop);
  }

  function resetDotsAppearance() {
    const dots = document.querySelectorAll('.dots-container .dot');
    dots.forEach(dot => {
      dot.textContent = '';
      dot.style.color = '';
      dot.style.backgroundColor = lastColour;
    });
  }
}
/* ----------------- End Real-Time Colour Sampler ----------------- */ 