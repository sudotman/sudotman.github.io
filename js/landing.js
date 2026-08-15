(() => {
  "use strict";

  const app = document.getElementById("landing-app");
  const dialog = document.getElementById("project-dialog");
  const detail = dialog?.querySelector("[data-project-detail]");
  const closeButton = dialog?.querySelector("[data-dialog-close]");
  if (!app || !dialog || !detail || !closeButton) return;

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const safeHref = (value, fallback = "#") => {
    const href = String(value || "").trim();
    return /^(https?:\/\/|mailto:|\/|#|\.\.\/|\.\/)/i.test(href) ? href : fallback;
  };

  const safeAsset = (value, fallback = "") => {
    const src = String(value || "").trim();
    if (/^(https?:\/\/|\/|\.\.\/|\.\/)/i.test(src)) return src;
    if (/^(images|icons)\//i.test(src)) return `/${src}`;
    return fallback;
  };

  const externalAttributes = (href) => /^https?:\/\//i.test(href)
    ? ' target="_blank" rel="noreferrer"'
    : "";

  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  };

  const plainText = (html = "") => {
    const template = document.createElement("template");
    template.innerHTML = String(html)
      .replaceAll(/<br\s*\/?>/gi, "\n")
      .replaceAll(/<\/p>/gi, "\n\n")
      .replaceAll(/<\/li>/gi, "\n");
    return (template.content.textContent || "").replaceAll(/\n{3,}/g, "\n\n").trim();
  };

  const yearFor = (work) => work.sortDate
    ? String(work.sortDate).slice(0, 4)
    : String(work.year || "ongoing");

  const linkName = (kind) => ({
    live: "open site",
    source: "source code",
    record: "film record",
    read: "read",
    contact: "contact",
    docs: "documentation"
  })[kind] || String(kind || "open link").replaceAll("_", " ");

  function linksFor(work) {
    if (Array.isArray(work.links)) {
      return work.links
        .map((link) => ({
          name: String(link?.label || linkName(link?.kind)),
          href: safeHref(link?.href, "")
        }))
        .filter((link) => link.href);
    }

    return Object.entries(work.links || {})
      .map(([kind, href]) => ({ name: linkName(kind), href: safeHref(href, "") }))
      .filter((link) => link.href);
  }

  function imagesFor(work) {
    const candidates = [
      ...(Array.isArray(work.images) ? work.images : []),
      ...(Array.isArray(work.gallery) ? work.gallery : []),
      typeof work.cover === "string" ? work.cover : work.cover?.src,
      work.image
    ];
    return [...new Set(candidates.map((src) => safeAsset(src, "")).filter(Boolean))];
  }

  function bodyFor(work) {
    if (typeof work.body === "string" && work.body.trim()) return work.body.trim();
    if (Array.isArray(work.body)) {
      const parts = work.body.map((block) => {
        if (!block || typeof block !== "object") return "";
        if (block.type === "list" && Array.isArray(block.items)) return block.items.join("\n");
        return block.text || plainText(block.html || "");
      }).filter(Boolean);
      if (parts.length) return parts.join("\n\n");
    }
    return plainText(work.long || "") || work.summary || work.short || "";
  }

  function normalizeWork(work, source) {
    return {
      ...work,
      id: String(work.id || ""),
      title: String(work.title || "Untitled"),
      mediumResolved: String(work.medium || work.category || "work").replaceAll("_", " "),
      yearResolved: yearFor(work),
      summaryResolved: String(work.summary || work.short || ""),
      bodyResolved: bodyFor(work),
      imagesResolved: imagesFor(work),
      linksResolved: linksFor(work),
      source
    };
  }

  async function loadPortfolio() {
    const home = await fetchJson("/content/home.json");
    const feeds = await Promise.all((home.sources || []).map((source) => fetchJson(`/${String(source).replace(/^\/+/, "")}`)));
    const works = [
      ...(home.works || []).map((work) => normalizeWork(work, "home")),
      ...feeds.flatMap((feed) => (feed.works || []).map((work) => normalizeWork(work, feed.source?.id || "archive")))
    ];
    const unique = [...new Map(works.map((work) => [work.id, work])).values()];
    const map = new Map(unique.map((work) => [work.id, work]));
    return {
      home,
      works: unique,
      workMap: map,
      featured: (home.featured || []).map((id) => map.get(id)).filter(Boolean)
    };
  }

  const projectHref = (work) => `#project=${encodeURIComponent(work.id)}`;

  function branchLinks(branches, className = "") {
    return Object.entries(branches || {}).map(([name, branch]) => {
      const href = safeHref(branch.href);
      return `<a class="${className}" href="${escapeHtml(href)}">[${escapeHtml(name)}]</a>`;
    }).join(" ");
  }

  function selectedProjects(works) {
    return works.map((work, index) => `
      <li>
        <span>${String(index + 1).padStart(2, "0")}.</span>
        <h3><a class="project-link" href="${escapeHtml(projectHref(work))}" data-project-id="${escapeHtml(work.id)}" aria-haspopup="dialog">${escapeHtml(work.title)}</a></h3>
        <p><small>${escapeHtml(work.mediumResolved)}, ${escapeHtml(work.yearResolved)}</small><br>${escapeHtml(work.summaryResolved)}</p>
      </li>`).join("");
  }

  function completeIndex(works) {
    return works.map((work) => `
      <div class="project-index__entry">
        <dt><a class="project-link" href="${escapeHtml(projectHref(work))}" data-project-id="${escapeHtml(work.id)}" aria-haspopup="dialog">${escapeHtml(work.title)}</a> <small>[${escapeHtml(work.mediumResolved)} / ${escapeHtml(work.yearResolved)}]</small></dt>
        <dd>${escapeHtml(work.summaryResolved)}</dd>
      </div>`).join("");
  }

  function writingList(writing) {
    return (writing || []).map((item) => {
      const href = safeHref(item.href);
      return `<li><a href="${escapeHtml(href)}"${externalAttributes(href)}>${escapeHtml(item.title)}</a> (${escapeHtml(item.year)})</li>`;
    }).join("");
  }

  function branchRegister(branches) {
    return Object.entries(branches || {}).map(([name, branch]) => `
      <article>
        <h3><a href="${escapeHtml(safeHref(branch.href))}">${escapeHtml(name)} →</a></h3>
        <p>${escapeHtml(branch.description)}</p>
      </article>`).join("");
  }

  function socialLinks(identity) {
    return Object.entries(identity.links || {}).map(([name, href]) => {
      const safe = safeHref(href);
      return `<a href="${escapeHtml(safe)}"${externalAttributes(safe)}>${escapeHtml(name)}</a>`;
    }).join(" · ");
  }

  function heroImages(simulation, film) {
    const simulationImage = simulation?.imagesResolved[0] || "/images/isro1.jpg";
    const filmImage = film?.imagesResolved[0] || "";
    return `
      <section class="hyper-images" aria-label="Two kinds of world-building">
        <figure>
          <img src="${escapeHtml(simulationImage)}" alt="${escapeHtml(simulation?.title || "XR simulation")}" fetchpriority="high" decoding="async">
          <figcaption>simulation / ${escapeHtml(simulation?.title || "ISRO Gaganyaan VR Simulator")}</figcaption>
        </figure>
        ${filmImage ? `<figure><img src="${escapeHtml(filmImage)}" alt="${escapeHtml(film?.title || "Film")}" loading="lazy" decoding="async"><figcaption>cinema / ${escapeHtml(film?.title || "Chhoti Gold")}</figcaption></figure>` : ""}
      </section>`;
  }

  function render({ home, works, workMap, featured }) {
    const identity = home.identity || {};
    const simulation = workMap.get("p_isro");
    const film = workMap.get("film_chhoti_gold");
    const viewing = home.viewing || {};
    app.innerHTML = `
      <main class="hyper-page" id="landing-main">
        <nav class="hyper-entry-nav" aria-label="More portfolio visualizations">
          ${branchLinks(home.branches)} <a href="mailto:${escapeHtml(identity.email)}">[email]</a>
        </nav>

        <header class="hyper-intro">
          <h1>${escapeHtml(identity.name)}</h1>
          <p class="hyper-subtitle"><strong>${escapeHtml(identity.role)}</strong> — ${escapeHtml(identity.location)}</p>
          <p>${escapeHtml(identity.intro)}</p>
        </header>

        <section class="hyper-now">
          <h2>Right now</h2>
          <ul>${(home.now || []).map((item) => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.text)}</li>`).join("")}</ul>
        </section>

        <section id="selected-work">
          <h2>Selected projects</h2>
          <p class="section-note">Everything essential is here. Open any title for images, longer notes and outward links.</p>
          <ol class="hyper-selected">${selectedProjects(featured)}</ol>
        </section>

        <hr>
          <p>The left is from a simulator we made for ISRO and the right is the poster from my 2025 film.</p>
        ${heroImages(simulation, film)}
        <hr>

        <section id="all-projects">
          <h2>Complete project index (${works.length})</h2>
          <dl class="project-index">${completeIndex(works)}</dl>
        </section>

        <section>
          <h2>Writing</h2>
          <ul>${writingList(home.writing)}</ul>
          <blockquote>“${escapeHtml(viewing.quote)}” — a note on <cite><a href="${escapeHtml(safeHref(viewing.href))}"${externalAttributes(viewing.href)}>${escapeHtml(viewing.film)}</a></cite></blockquote>
        </section>

        <section class="hyper-more" id="more">
          <h2>More ways through</h2>
          <p class="section-note">The front page is the direct account. These branches are alternate visualizations for going further.</p>
          <div>${branchRegister(home.branches)}</div>
        </section>

        <hr>
        <footer>
          <p>${escapeHtml(identity.statement)}</p>
          <p>${socialLinks(identity)} · <a href="mailto:${escapeHtml(identity.email)}">${escapeHtml(identity.email)}</a></p>
        </footer>
      </main>`;

    app.querySelectorAll(".hyper-images img").forEach((image) => {
      image.addEventListener("error", () => image.closest("figure")?.remove(), { once: true });
    });
  }

  function detailLinks(work) {
    if (!work.linksResolved.length) return "";
    return `<nav class="project-dialog__links" aria-label="Project links">${work.linksResolved.map((link) => `
      <a href="${escapeHtml(link.href)}"${externalAttributes(link.href)}>[${escapeHtml(link.name)}] ↗</a>`).join("")}</nav>`;
  }

  function detailImages(work) {
    if (!work.imagesResolved.length) return "";
    return `<div class="project-dialog__images">${work.imagesResolved.slice(0, 6).map((src, index) => `
      <figure>
        <img src="${escapeHtml(src)}" alt="${escapeHtml(`${work.title}, project image ${index + 1}`)}" loading="lazy" decoding="async">
        <figcaption>image ${String(index + 1).padStart(2, "0")}</figcaption>
      </figure>`).join("")}</div>`;
  }

  let projectMap = new Map();
  let historyIsClosing = false;

  function openProject(id) {
    const work = projectMap.get(id);
    if (!work) return;
    detail.innerHTML = `
      <p class="project-dialog__meta">${escapeHtml(work.mediumResolved)} / ${escapeHtml(work.yearResolved)}</p>
      <h2 id="project-dialog-title">${escapeHtml(work.title)}</h2>
      <p class="project-dialog__summary">${escapeHtml(work.summaryResolved)}</p>
      <div class="project-dialog__text">${work.bodyResolved.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")}</div>
      ${detailLinks(work)}
      ${detailImages(work)}`;

    detail.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => image.closest("figure")?.remove(), { once: true });
    });
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("dialog-open");
    closeButton.focus({ preventScroll: true });
  }

  function hashProject() {
    return new URLSearchParams(location.hash.slice(1)).get("project");
  }

  function syncDialogFromUrl() {
    const id = hashProject();
    if (id && projectMap.has(id)) {
      openProject(id);
    } else if (dialog.open) {
      historyIsClosing = true;
      dialog.close();
    }
  }

  function bindInteractions() {
    app.addEventListener("click", (event) => {
      const link = event.target.closest(".project-link");
      if (!link) return;
      event.preventDefault();
      const id = link.dataset.projectId;
      if (!projectMap.has(id)) return;
      history.pushState(null, "", projectHref(projectMap.get(id)));
      openProject(id);
    });

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      detail.replaceChildren();
      if (historyIsClosing) {
        historyIsClosing = false;
      } else if (hashProject()) {
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      }
    });
    window.addEventListener("popstate", syncDialogFromUrl);
  }

  loadPortfolio()
    .then((portfolio) => {
      projectMap = portfolio.workMap;
      render(portfolio);
      bindInteractions();
      syncDialogFromUrl();
    })
    .catch((error) => {
      console.error(error);
      app.innerHTML = `
        <main class="landing-error" id="landing-main">
          <h1>Satyam Kashyap</h1>
          <p>The project index did not load.</p>
          <p><a href="/living/">Living</a> · <a href="/river/">River</a> · <a href="/doors/">Doors</a> · <a href="/tech.html">Core Tech</a></p>
        </main>`;
    });
})();
