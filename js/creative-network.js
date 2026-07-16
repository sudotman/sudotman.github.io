(() => {
  "use strict";

  const app = document.getElementById("creative-app");
  const mode = document.body.dataset.creativeMode || "master";
  const depths = [28, 62, 20, 68, 42, 16, 72, 34];
  const doorSlots = ["west", "needle", "center", "north", "east"];

  if (!app) return;

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const safeColor = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(value || "") ? value : fallback;
  const safeHref = (value, fallback = "#") => {
    const href = String(value || "").trim();
    if (/^(https?:\/\/|mailto:|\/|#|\.\.\/|\.\/)/i.test(href)) return href;
    return fallback;
  };
  const pad = (value) => String(value).padStart(2, "0");
  const projectHref = (project) => safeHref(project.link, `#${project.slug}`);
  const linkExtras = (href) => /^https?:\/\//i.test(href) ? ' target="_blank" rel="noreferrer"' : "";

  function experienceHeader(content, currentMode) {
    return `
      <header class="experience-header experience-header--${currentMode}">
        <a href="/" class="experience-home">← crossing</a>
        <p>${escapeHtml(content.profile.name)}</p>
        <p>${currentMode}</p>
        <p>${pad(content.projects.length)} works</p>
      </header>`;
  }

  function renderMaster(content) {
    const branches = [
      ["living", "Living", "/living/", ""],
      ["river", "River", "/river/", ""],
      ["doors", "Doors", "/doors/", ""],
    ];
    const creativeLinks = branches.map(([key, label, href, note], index) => `
      <a href="${href}" class="master-branch master-branch--${key}" data-master-branch="${key}">
        <span class="master-branch-number">01${String.fromCharCode(97 + index)}</span>
        <span class="master-branch-name">${label}<sup class="master-branch-arrow" aria-hidden="true">↗</sup></span>
        <span class="master-branch-note">${note}</span>
      </a>`).join("");
    const techHref = safeHref(content.profile.coreTechUrl, "/tech.html");

    app.innerHTML = `
      <main class="master master--rest">
        <div class="master-scene" aria-hidden="true">
          <span class="master-living-shape master-living-shape--one"></span>
          <span class="master-living-shape master-living-shape--two"></span>
          <span class="master-living-shape master-living-shape--three"></span>
          <span class="master-current master-current--one"></span>
          <span class="master-current master-current--two"></span>
          <span class="master-door master-door--one"></span>
          <span class="master-door master-door--two"></span>
          <span class="master-tech-line master-tech-line--one"></span>
          <span class="master-tech-line master-tech-line--two"></span>
        </div>
        <header class="master-header">
          <p>${escapeHtml(content.profile.name)}</p>
          <p>${escapeHtml(content.profile.role)}</p>
          <p>human</p>
          <!-- <p>${pad(content.projects.length)} existing / project number</p> -->
        </header>
        <p class="master-instruction">choose a path.</p>
        <nav class="master-branches" aria-label="Portfolio entrances">
          <section class="master-creative-system" aria-labelledby="creative-archive-label">
            <div class="master-creative-key" id="creative-archive-label">
              <span>01 / creative archive</span>
              <span>one body of work / three states</span>
            </div>
            <span class="master-source-node" aria-hidden="true"><b>${pad(content.projects.length)}</b><small>works</small></span>
            ${creativeLinks}
          </section>
          <div class="master-severance" aria-hidden="true"><span></span></div>
          <section class="master-tech-system" aria-labelledby="tech-practice-label">
            <div class="master-tech-key" id="tech-practice-label">
              <span>02 / stem</span>
              <span>another room in this house ↗</span>
            </div>
            <a href="${escapeHtml(techHref)}" class="master-branch master-branch--tech" data-master-branch="tech">
              <span class="master-branch-number">02 ↗</span>
              <span class="master-branch-name">Core<sup class="master-branch-arrow" aria-hidden="true">↗</sup><br>Tech</span>
              <span class="master-branch-note"></span>
            </a>
          </section>
        </nav>
        <footer class="master-footer">
          <p>${escapeHtml(content.profile.statement)}</p>
          <a href="mailto:${escapeHtml(content.profile.email)}">${escapeHtml(content.profile.email)}</a>
          <p>${escapeHtml(content.profile.location)}</p>
        </footer>
      </main>`;

    const master = app.querySelector(".master");
    const setActive = (state) => {
      master.className = `master master--${state}`;
    };
    app.querySelectorAll("[data-master-branch]").forEach((branch) => {
      const state = branch.dataset.masterBranch;
      branch.addEventListener("pointerenter", () => setActive(state));
      branch.addEventListener("focus", () => setActive(state));
      branch.addEventListener("blur", () => setActive("rest"));
    });
    master.addEventListener("pointerleave", () => setActive("rest"));
  }

  function projectArt(project) {
    const image = safeHref(project.image, "");
    if (image) {
      const source = escapeHtml(image);
      return `
        <span class="living-image-stack">
          <span class="living-shape living-shape--one"></span>
          <span class="living-shape living-shape--two"></span>
          <span class="living-shape living-shape--three"></span>
          <img class="living-image-plate living-image-plate--under" src="${source}" alt="" loading="lazy" decoding="async">
          <img class="living-image-plate living-image-plate--upper" src="${source}" alt="" loading="lazy" decoding="async">
          <img class="living-image-plate living-image-plate--lower" src="${source}" alt="" loading="lazy" decoding="async">
          <img class="living-image-plate living-image-plate--exposure" src="${source}" alt="" loading="lazy" decoding="async">
          <span class="living-image-rift living-image-rift--one"></span>
          <span class="living-image-grain"></span>
        </span>`;
    }
    return `
      <span class="living-shape living-shape--one"></span>
      <span class="living-shape living-shape--two"></span>
      <span class="living-shape living-shape--three"></span>`;
  }

  function renderLiving(content) {
    const projects = content.projects.map((project, index) => {
      const href = projectHref(project);
      const hasImage = Boolean(safeHref(project.image, ""));
      return `
        <a id="${escapeHtml(project.slug)}" href="${escapeHtml(href)}"${linkExtras(href)}
          class="living-tile living-tile--${index % 8} ${hasImage ? "living-tile--image" : "living-tile--shapes"}"
          style="--project-color:${safeColor(project.color, "#ef5a47")};--project-accent:${safeColor(project.accent, "#b7d73b")};"
          aria-label="${escapeHtml(`${project.title}, ${project.year}, ${project.discipline}`)}">
          <span class="living-art" aria-hidden="true">${projectArt(project)}</span>
          <span class="living-index">${pad(index + 1)}</span>
          <span class="living-caption">
            <strong>${escapeHtml(project.title)}</strong>
            <span>${escapeHtml(project.discipline)}, ${escapeHtml(project.year)}</span>
            <em>${escapeHtml(project.note)}</em>
          </span>
        </a>`;
    }).join("");

    app.innerHTML = `
      <main class="living-page">
        ${experienceHeader(content, "living")}
        <section class="living-grid" aria-label="Creative projects">${projects}</section>
        <footer class="living-footer">
          <p>${escapeHtml(content.profile.statement)}</p>
          <a href="mailto:${escapeHtml(content.profile.email)}">${escapeHtml(content.profile.email)}</a>
          <p>Content lives in content/creative.json.</p>
        </footer>
      </main>`;

    app.querySelectorAll(".living-tile--image").forEach((tile) => {
      const activateImageRegistration = () => tile.classList.add("is-image-alive");
      const resetImageRegistration = () => {
        tile.classList.remove("is-image-alive");
        tile.style.setProperty("--living-pointer-x", "50%");
        tile.style.setProperty("--living-pointer-y", "50%");
        tile.style.setProperty("--living-drift-x", "0px");
        tile.style.setProperty("--living-drift-y", "0px");
      };
      tile.addEventListener("pointermove", (event) => {
        if (event.pointerType && !["mouse", "pen"].includes(event.pointerType)) return;
        activateImageRegistration();
        const bounds = tile.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
        const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
        tile.style.setProperty("--living-pointer-x", `${(x * 100).toFixed(2)}%`);
        tile.style.setProperty("--living-pointer-y", `${(y * 100).toFixed(2)}%`);
        tile.style.setProperty("--living-drift-x", `${((x - 0.5) * 15).toFixed(2)}px`);
        tile.style.setProperty("--living-drift-y", `${((y - 0.5) * 11).toFixed(2)}px`);
      }, { passive: true });
      tile.addEventListener("pointerleave", resetImageRegistration);
      tile.addEventListener("focus", activateImageRegistration);
      tile.addEventListener("blur", resetImageRegistration);
    });
  }

  function renderRiver(content) {
    const projects = content.projects.map((project, index) => {
      const href = projectHref(project);
      return `
        <a id="${escapeHtml(project.slug)}" href="${escapeHtml(href)}"${linkExtras(href)} class="river-project"
          style="--river-index:${index};top:${depths[index % depths.length]}%;--river-accent:${safeColor(project.accent, "#d7fb34")};">
          <small>${escapeHtml(project.year)}</small>
          <strong>${escapeHtml(project.title)}</strong>
          <span>${escapeHtml(project.discipline)}</span>
          <em>— ${escapeHtml(project.note)}</em>
        </a>`;
    }).join("");

    app.innerHTML = `
      <main class="river-page">
        ${experienceHeader(content, "river")}
        <div class="river-viewport" tabindex="0" aria-label="Horizontally scrolling project river. Use arrow keys or drag the background.">
          <div class="river-track" style="--project-count:${content.projects.length}">
            <span class="river-line river-line--one" aria-hidden="true"></span>
            <span class="river-line river-line--two" aria-hidden="true"></span>
            ${projects}
            <aside class="river-coda" style="--river-coda-index:${content.projects.length}">
              <p>${escapeHtml(content.profile.statement)}</p>
              <a href="mailto:${escapeHtml(content.profile.email)}">${escapeHtml(content.profile.email)}</a>
              <p>${escapeHtml(content.profile.location)}</p>
            </aside>
          </div>
        </div>
        <p class="river-mobile-note">This entrance runs sideways — swipe the current.</p>
        <p class="river-help">drag / scroll / arrow keys →</p>
        <p class="river-position" aria-live="polite">01 / ${pad(content.projects.length)} · current continues →</p>
      </main>`;

    const river = app.querySelector(".river-viewport");
    const position = app.querySelector(".river-position");
    const drag = { active: false, x: 0, left: 0 };
    const updatePosition = () => {
      const ratio = matchMedia("(max-width: 800px)").matches ? 0.72 : 0.34;
      const current = Math.min(content.projects.length - 1, Math.max(0, Math.round(river.scrollLeft / Math.max(innerWidth * ratio, 1))));
      position.textContent = `${pad(current + 1)} / ${pad(content.projects.length)} · current continues →`;
    };
    river.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        river.scrollLeft += event.deltaY;
      }
    }, { passive: false });
    river.addEventListener("scroll", updatePosition, { passive: true });
    river.addEventListener("pointerdown", (event) => {
      if (event.target.closest("a")) return;
      drag.active = true;
      drag.x = event.clientX;
      drag.left = river.scrollLeft;
      river.setPointerCapture(event.pointerId);
    });
    river.addEventListener("pointermove", (event) => {
      if (drag.active) river.scrollLeft = drag.left - (event.clientX - drag.x);
    });
    ["pointerup", "pointercancel"].forEach((name) => river.addEventListener(name, () => { drag.active = false; }));
    river.addEventListener("keydown", (event) => {
      if (["ArrowRight", "PageDown"].includes(event.key)) {
        event.preventDefault();
        river.scrollBy({ left: innerWidth * 0.72, behavior: "smooth" });
      } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        river.scrollBy({ left: -innerWidth * 0.72, behavior: "smooth" });
      } else if (event.key === "Home") river.scrollTo({ left: 0, behavior: "smooth" });
      else if (event.key === "End") river.scrollTo({ left: river.scrollWidth, behavior: "smooth" });
    });
  }

  function renderDoors(content) {
    const rooms = [];
    for (let index = 0; index < content.projects.length; index += 5) rooms.push(content.projects.slice(index, index + 5));
    const roomMarkup = rooms.map((projects, roomIndex) => {
      const doors = projects.map((project, slotIndex) => {
        const href = projectHref(project);
        const projectIndex = roomIndex * 5 + slotIndex;
        return `
          <a id="${escapeHtml(project.slug)}" href="${escapeHtml(href)}"${linkExtras(href)} class="door door--${doorSlots[slotIndex]}"
            style="--door-color:${safeColor(project.color, "#222")};--door-accent:${safeColor(project.accent, "#dfd8c9")};">
            <span class="door-frame" aria-hidden="true"></span>
            <span class="door-label">${pad(projectIndex + 1)} / ${escapeHtml(project.title)} · ${escapeHtml(project.year)}</span>
            <span class="door-whisper">${escapeHtml(project.note)}</span>
          </a>`;
      }).join("");
      const note = roomIndex < rooms.length - 1
        ? `room ${pad(roomIndex + 2)} below · projects ${pad((roomIndex + 1) * 5 + 1)}—${pad(Math.min((roomIndex + 2) * 5, content.projects.length))} ↓`
        : "no hallway / only a way back ↑";
      return `
        <section id="room-${roomIndex + 1}" class="door-room door-room--${roomIndex % 2 === 0 ? "odd" : "even"}" data-room="${roomIndex}" aria-label="Room ${roomIndex + 1}">
          ${doors}<p class="door-room-note">${note}</p>
        </section>`;
    }).join("");
    const jumps = rooms.map((_, index) => `<a href="#room-${index + 1}" aria-label="Go to room ${index + 1}">${pad(index + 1)}</a>`).join("");

    app.innerHTML = `
      <main class="doors-page">
        ${experienceHeader(content, "doors")}
        <p class="doors-mobile-note">On this screen, the rooms fold into a vertical passage.</p>
        <p class="doors-room-count" aria-live="polite">room 01 / ${pad(rooms.length)}</p>
        <nav class="doors-jumps" aria-label="Jump between rooms">${jumps}</nav>
        ${roomMarkup}
        <footer class="doors-footer">
          <a href="mailto:${escapeHtml(content.profile.email)}">${escapeHtml(content.profile.email)}</a>
          <p>${escapeHtml(content.profile.location)}</p>
          <p>source: content/creative.json</p>
        </footer>
      </main>`;

    const count = app.querySelector(".doors-room-count");
    const nodes = [...app.querySelectorAll(".door-room")];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (visible) count.textContent = `room ${pad(Number(visible.target.dataset.room) + 1)} / ${pad(rooms.length)}`;
    }, { threshold: 0.55 });
    nodes.forEach((node) => observer.observe(node));
  }

  fetch("/content/creative.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Creative archive returned ${response.status}`);
      return response.json();
    })
    .then((content) => {
      if (mode === "living") renderLiving(content);
      else if (mode === "river") renderRiver(content);
      else if (mode === "doors") renderDoors(content);
      else renderMaster(content);
    })
    .catch((error) => {
      console.error(error);
      app.innerHTML = `<main class="creative-error"><p>The crossing could not assemble itself.</p><a href="/tech.html">Enter Core Tech instead →</a></main>`;
    });
})();
