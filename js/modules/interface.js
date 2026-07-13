(() => {
  "use strict";

  const Site = window.ImpossibleRooms;
  if (!Site) return;

  const {
    escapeHTML,
    safeLink,
    externalAttrs
  } = Site;

  let activeWork = null;
  let opener = null;
  let previousHash = "";
  let historySync = false;

  const sanitiseLegacyHTML = html => {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<div id="legacy-root">${String(html || "")}</div>`, "text/html");
    const root = parsed.querySelector("#legacy-root");
    if (!root) return "";

    const allowed = new Set(["P", "BR", "STRONG", "EM", "B", "I", "UL", "OL", "LI", "A", "H3", "H4"]);
    [...root.querySelectorAll("*")].forEach(element => {
      const rawHref = element.tagName === "A" ? element.getAttribute("href") || "" : "";
      if (!allowed.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
      if (element.tagName === "A") {
        const href = safeLink(rawHref);
        if (href === "#") {
          element.replaceWith(...element.childNodes);
        } else {
          element.href = href;
          if (/^https?:/i.test(href)) {
            element.target = "_blank";
            element.rel = "noopener noreferrer";
          }
        }
      }
    });
    return root.innerHTML;
  };

  const renderBodyBlocks = blocks => (blocks || []).map(block => {
    if (!block || typeof block !== "object") return "";
    switch (block.type) {
      case "paragraph":
        return `<p>${escapeHTML(block.text || "")}</p>`;
      case "heading":
        return `<h3>${escapeHTML(block.text || "")}</h3>`;
      case "quote":
        return `<blockquote>${escapeHTML(block.text || "")}</blockquote>`;
      case "list":
        return `<ul>${(block.items || []).map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
      case "legacyHtml":
        return sanitiseLegacyHTML(block.html || "");
      default:
        return "";
    }
  }).join("");

  const mediaImage = (item, index) => {
    const alt = item.alt || `Project plate ${index + 1}`;
    const caption = item.caption || `Plate ${String(index + 1).padStart(2, "0")}`;
    return `
      <button class="folio-media" type="button" data-lightbox-src="${escapeHTML(item.src)}" data-lightbox-alt="${escapeHTML(alt)}" data-lightbox-caption="${escapeHTML(caption)}">
        <img src="${escapeHTML(item.thumbnail || item.src)}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async">
        <span>${escapeHTML(caption)} / expand</span>
      </button>`;
  };

  const mediaVideo = item => {
    if (item.provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(item.id || "")) {
      return `<div class="folio-video"><iframe src="https://www.youtube-nocookie.com/embed/${escapeHTML(item.id)}?rel=0" title="${escapeHTML(item.title || "Project video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
    }
    if (item.provider === "vimeo" && /^\d+$/.test(item.id || "")) {
      return `<div class="folio-video"><iframe src="https://player.vimeo.com/video/${escapeHTML(item.id)}" title="${escapeHTML(item.title || "Project video")}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (item.src) {
      return `<div class="folio-video"><video src="${escapeHTML(item.src)}"${item.poster ? ` poster="${escapeHTML(item.poster)}"` : ""} controls preload="metadata"></video></div>`;
    }
    return "";
  };

  const renderMedia = media => (media || []).map((item, index) => {
    if (item.type === "image") return mediaImage(item, index);
    if (item.type === "video") return mediaVideo(item);
    if (item.type === "audio" && item.src) {
      return `<div class="folio-media folio-audio"><span>${escapeHTML(item.title || "Project audio")}</span><audio src="${escapeHTML(item.src)}" controls preload="none"></audio></div>`;
    }
    return "";
  }).join("");

  const renderLinks = links => {
    if (!links?.length) return "";
    return `
      <section class="folio-links">
        <p>Open channels</p>
        <div class="folio-links__list">
          ${links.map(link => {
            const href = safeLink(link.href);
            return `<a class="folio-link" href="${escapeHTML(href)}"${externalAttrs(href)}><span>${escapeHTML(link.label || "visit project")}</span><span>↗</span></a>`;
          }).join("")}
        </div>
      </section>`;
  };

  const projectMarkup = work => {
    const code = Site.specimenCode(work);
    const medium = Site.mediumLabel(work.medium);
    const media = work.media || [];
    const linkCount = work.links?.length || 0;
    return `
      <article class="folio-project" data-work-id="${escapeHTML(work.id)}">
        <section class="folio-lead">
          <div class="folio-lead__image">
            <img src="${escapeHTML(work.cover.src)}" alt="${escapeHTML(work.cover.alt || `${work.title} project cover`)}">
            <span>${escapeHTML(code)} / principal plate</span>
          </div>
          <div class="folio-lead__copy">
            <div>
              <div class="folio-lead__meta">
                <span class="folio-glyph-label"><i class="specimen-glyph specimen-glyph--${escapeHTML(work.medium)}" aria-hidden="true"></i>${escapeHTML(medium)}</span>
                <span>${escapeHTML(code)}</span>
              </div>
              <h2 id="project-dialog-title">${escapeHTML(work.title)}</h2>
              <p class="folio-lead__summary">${escapeHTML(work.summary)}</p>
            </div>
            <div class="folio-lead__signal" aria-label="Project metadata">
              <span>${String(media.length).padStart(2, "0")} media plates</span>
              <span>${String(linkCount).padStart(2, "0")} open links</span>
              <span>${escapeHTML(work.tracks?.join(" + ") || "practice")}</span>
            </div>
          </div>
        </section>
        <section class="folio-description">
          <p class="folio-description__label">Field notes</p>
          <div class="folio-description__text">${renderBodyBlocks(work.body)}</div>
        </section>
        ${renderLinks(work.links)}
        <section class="folio-gallery">
          <header><div><p>Contact sheet</p><h3>Evidence of the machine.</h3></div><p>${String(media.length).padStart(2, "0")} plates / ${escapeHTML(code)}</p></header>
          <div class="folio-gallery__grid">${renderMedia(media) || '<p class="folio-empty-media">No exposed plates in this folio.</p>'}</div>
        </section>
      </article>`;
  };

  const openProject = (work, { updateHistory = true } = {}) => {
    const dialog = document.querySelector("#project-dialog");
    const body = document.querySelector("#project-dialog-body");
    if (!dialog || !body || !work) return;

    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeWork = work;
    body.innerHTML = projectMarkup(work);
    body.scrollTop = 0;
    dialog.querySelector(".folio-code").textContent = Site.specimenCode(work);

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    document.body.classList.add("has-dialog");

    if (updateHistory) {
      previousHash = window.location.hash.startsWith("#work/") ? "" : window.location.hash;
      const nextHash = `#work/${encodeURIComponent(work.id)}`;
      if (window.location.hash !== nextHash) history.pushState({ work: work.id }, "", nextHash);
    }
  };

  const closeProject = ({ restoreHistory = true, restoreFocus = true } = {}) => {
    const dialog = document.querySelector("#project-dialog");
    if (!dialog?.open) return;
    activeWork = null;
    const body = document.querySelector("#project-dialog-body");
    body?.querySelectorAll("video, audio").forEach(media => media.pause());
    body?.querySelectorAll("iframe").forEach(frame => frame.src = "about:blank");
    dialog.close();
    document.body.classList.remove("has-dialog");

    if (restoreHistory && window.location.hash.startsWith("#work/")) {
      const destination = previousHash || `${window.location.pathname}${window.location.search}`;
      history.replaceState(null, "", destination);
    }
    if (restoreFocus) opener?.focus({ preventScroll: true });
  };

  const workFromHash = () => {
    const match = window.location.hash.match(/^#work\/(.+)$/);
    if (!match) return null;
    try {
      return Site.getWork(decodeURIComponent(match[1]));
    } catch {
      return null;
    }
  };

  const syncHash = () => {
    const work = workFromHash();
    historySync = true;
    if (work && activeWork?.id !== work.id) openProject(work, { updateHistory: false });
    if (!work && activeWork) closeProject({ restoreHistory: false, restoreFocus: false });
    historySync = false;
  };

  const initProjectDialog = () => {
    const dialog = document.querySelector("#project-dialog");
    if (!dialog) return;

    document.addEventListener("click", event => {
      const openButton = event.target.closest("[data-open-work]");
      if (openButton) {
        const work = Site.getWork(openButton.dataset.openWork);
        if (work) openProject(work);
        return;
      }

      if (event.target === dialog || event.target.closest(".folio-close")) {
        closeProject({ restoreHistory: !historySync });
      }
    });

    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeProject({ restoreHistory: true });
    });
  };

  const initLightbox = () => {
    const dialog = document.querySelector("#image-lightbox");
    const image = dialog?.querySelector("img");
    const caption = dialog?.querySelector("figcaption");
    if (!dialog || !image || !caption) return;

    document.addEventListener("click", event => {
      const trigger = event.target.closest("[data-lightbox-src]");
      if (trigger) {
        image.src = trigger.dataset.lightboxSrc;
        image.alt = trigger.dataset.lightboxAlt || "Expanded project plate";
        caption.textContent = trigger.dataset.lightboxCaption || "";
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        return;
      }
      if (event.target === dialog || event.target.closest(".lightbox-close")) dialog.close();
    });

    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      dialog.close();
    });

    dialog.addEventListener("close", () => {
      image.src = "images/banner.jpg";
      image.alt = "";
      caption.textContent = "";
    });
  };

  const initMobileMenu = () => {
    const toggle = document.querySelector(".menu-toggle");
    const menu = document.querySelector("#mobile-menu");
    if (!toggle || !menu) return;

    const inertBackground = [
      document.querySelector("main"),
      document.querySelector(".site-rail"),
      document.querySelector(".topbar-name"),
      document.querySelector(".skip-link")
    ].filter(Boolean);

    const setOpen = (open, { restoreFocus = true } = {}) => {
      toggle.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      document.body.classList.toggle("is-menu-open", open);
      inertBackground.forEach(element => element.inert = open);
      if (open) menu.querySelector("a")?.focus();
      else if (restoreFocus) toggle.focus({ preventScroll: true });
    };

    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    menu.addEventListener("click", event => {
      if (event.target.closest("a")) setOpen(false, { restoreFocus: false });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") setOpen(false);
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
    initProjectDialog();
    initLightbox();
    Site.ready.then(syncHash).catch(() => {});
    window.addEventListener("popstate", syncHash);
    window.addEventListener("hashchange", syncHash);
  });
})();
