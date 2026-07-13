(() => {
  "use strict";

  const Site = window.ImpossibleRooms;
  if (!Site) return;

  const {
    state,
    escapeHTML,
    safeHex,
    safeLink,
    externalAttrs,
    observeReveals
  } = Site;

  const mediumCodes = {
    open_source: "OS",
    game: "GM",
    rnd: "RD",
    art: "CC",
    film: "FL",
    installation: "IN",
    visual_art: "VA"
  };

  const fetchJSON = async path => {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    return response.json();
  };

  const videoFromLegacyLink = link => {
    if (!link || typeof link.href !== "string") return null;
    const youtube = link.href.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i);
    if (youtube) {
      return { type: "video", provider: "youtube", id: youtube[1], title: link.label || "Project video" };
    }
    const vimeo = link.href.match(/player\.vimeo\.com\/video\/(\d+)/i);
    if (vimeo) {
      return { type: "video", provider: "vimeo", id: vimeo[1], title: link.label || "Project video" };
    }
    return null;
  };

  const normalizeBody = work => {
    if (Array.isArray(work.body) && work.body.length) return work.body;
    return [{ type: "legacyHtml", html: work.long || work.summary || work.short || "" }];
  };

  const normalizeMedia = work => {
    const media = Array.isArray(work.media) ? [...work.media] : [];
    const knownSources = new Set(media.map(item => item.src).filter(Boolean));

    if (Array.isArray(work.gallery)) {
      work.gallery.forEach((src, index) => {
        if (!src || knownSources.has(src)) return;
        knownSources.add(src);
        media.push({
          type: "image",
          src,
          alt: `${work.title} — project plate ${String(index + 1).padStart(2, "0")}`
        });
      });
    }

    return media;
  };

  const normalizeWork = (work, source, index) => {
    const legacyLinks = Array.isArray(work.links) ? work.links : [];
    const videos = legacyLinks.map(videoFromLegacyLink).filter(Boolean);
    const links = legacyLinks.filter(link => !videoFromLegacyLink(link));
    const media = [...normalizeMedia(work), ...videos];
    const cover = work.cover || {
      src: work.image || media.find(item => item.type === "image")?.src || "images/banner.jpg",
      alt: `${work.title} — project cover`
    };

    if (!media.some(item => item.type === "image" && item.src === cover.src)) {
      media.unshift({ type: "image", src: cover.src, alt: cover.alt });
    }

    return {
      ...work,
      sourceId: source.id,
      sourceIndex: index,
      tracks: Array.isArray(work.tracks) ? work.tracks : source.defaultTracks,
      medium: work.medium || work.category,
      summary: work.summary || work.short || "",
      body: normalizeBody(work),
      cover,
      media,
      links
    };
  };

  const mediumLabel = id => state.mediumById.get(id)?.label || String(id || "work").replaceAll("_", " ");
  const workIndex = work => Math.max(0, state.works.findIndex(item => item.id === work.id));
  const specimenCode = work => `SK/${mediumCodes[work.medium] || "WK"}/${String(workIndex(work) + 1).padStart(2, "0")}`;

  const workAccent = work => safeHex(state.mediumById.get(work.medium)?.accent, "#c74a32");

  const loadData = async () => {
    const [manifest, profile] = await Promise.all([
      fetchJSON("content.json"),
      fetchJSON("profile.json")
    ]);

    const feedResults = await Promise.allSettled(manifest.catalog.sources.map(async source => ({
      source,
      feed: await fetchJSON(source.src)
    })));
    const feeds = feedResults
      .filter(result => result.status === "fulfilled")
      .map(result => result.value);
    feedResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn(`Portfolio feed unavailable: ${manifest.catalog.sources[index].src}`, result.reason);
      }
    });

    const works = feeds.flatMap(({ source, feed }) => (
      (feed.works || []).map((work, index) => normalizeWork(work, source, index))
    ));

    state.manifest = manifest;
    state.profile = profile;
    state.works = works;
    state.worksById = new Map(works.map(work => [work.id, work]));
    state.mediumById = new Map((manifest.catalog.mediums || []).map(medium => [medium.id, medium]));

    return { manifest, profile, works };
  };

  const hydrateIdentity = manifest => {
    const header = manifest.siteHeader || {};
    const identity = manifest.identity || {};
    document.querySelectorAll("[data-site-kicker]").forEach(node => node.textContent = header.kicker || "An illuminated field manual");
    document.querySelectorAll("[data-site-thesis]").forEach(node => node.textContent = header.thesis || header.subtitle || "");
    document.querySelectorAll("[data-site-manifesto]").forEach(node => node.textContent = header.manifesto || header.subtitle || "");
    document.querySelectorAll("[data-profile-bio]").forEach(node => node.textContent = identity.bio || "");
    document.querySelectorAll("[data-contact-email]").forEach(node => {
      node.href = `mailto:${identity.email || "satyamsudo@gmail.com"}`;
      const arrow = node.querySelector("span")?.outerHTML || "";
      node.innerHTML = `${escapeHTML(identity.email || "satyamsudo@gmail.com")} ${arrow}`;
    });

    const banner = header.bannerImage;
    if (banner) {
      document.querySelector(".hero-lens img")?.setAttribute("src", banner);
    }
  };

  const renderFeaturedWorks = manifest => {
    const mount = document.querySelector("#featured-works");
    if (!mount) return;
    const ids = manifest.curation?.featuredWorkIds || [];
    const selected = ids.map(id => state.worksById.get(id)).filter(Boolean).slice(0, 6);
    const featured = selected.length ? selected : state.works.slice(0, 5);

    mount.innerHTML = featured.map((work, index) => {
      const accent = workAccent(work);
      const code = specimenCode(work);
      return `
        <article class="work-plate reveal" data-work-id="${escapeHTML(work.id)}" style="--plate-accent:${accent}">
          <div class="work-plate__visual">
            <img src="${escapeHTML(work.cover.src)}" alt="${escapeHTML(work.cover.alt || `${work.title} project image`)}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async">
            <div class="work-plate__measure"><i></i><span>${escapeHTML(code)} / ${String(work.media.length).padStart(2, "0")} plates</span></div>
          </div>
          <div class="work-plate__copy">
            <div class="work-plate__meta">
              <span>${escapeHTML(code)}</span>
              <span>${escapeHTML(mediumLabel(work.medium))}</span>
            </div>
            <h3>${escapeHTML(work.title)}</h3>
            <p class="work-plate__summary">${escapeHTML(work.summary)}</p>
            <button class="work-plate__open" type="button" data-open-work="${escapeHTML(work.id)}">Open project folio <span>↗</span></button>
          </div>
          <span class="work-plate__number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        </article>`;
    }).join("");

    observeReveals(mount);
  };

  const renderArchive = () => {
    const mount = document.querySelector("#archive-list");
    if (!mount) return;
    mount.innerHTML = state.works.map((work, index) => `
      <button class="archive-row" type="button" data-open-work="${escapeHTML(work.id)}" data-medium="${escapeHTML(work.medium)}" data-preview-work="${escapeHTML(work.id)}">
        <span class="archive-row__number">${String(index + 1).padStart(2, "0")}</span>
        <span class="archive-row__title">${escapeHTML(work.title)}</span>
        <span class="archive-row__meta"><span>${escapeHTML(mediumLabel(work.medium))}</span><span>${escapeHTML(specimenCode(work))}</span></span>
        <span class="archive-row__arrow" aria-hidden="true">↗</span>
      </button>`).join("");

    renderArchiveFilters();
    renderArtsState();
    const first = state.works[0];
    if (first) updateArchivePreview(first, true);
    bindArchivePreview();
    bindArchiveFilters();
  };

  const renderArchiveFilters = () => {
    const mount = document.querySelector("#catalogue-filters");
    if (!mount) return;
    const counts = state.works.reduce((result, work) => {
      result.set(work.medium, (result.get(work.medium) || 0) + 1);
      return result;
    }, new Map());
    const mediums = (state.manifest.catalog.mediums || []).filter(medium => counts.get(medium.id));
    mount.innerHTML = [
      `<button type="button" class="catalogue-filter is-active" data-filter="all" aria-pressed="true">All <span>${state.works.length}</span></button>`,
      ...mediums.map(medium => `<button type="button" class="catalogue-filter" data-filter="${escapeHTML(medium.id)}" aria-pressed="false">${escapeHTML(medium.label)} <span>${counts.get(medium.id)}</span></button>`)
    ].join("");
  };

  const renderArtsState = () => {
    const notice = document.querySelector("#undeveloped-track");
    if (!notice) return;
    const artsTrack = state.manifest.catalog.tracks?.find(track => track.id === "arts");
    const artsWorks = state.works.filter(work => work.tracks?.includes("arts"));
    notice.hidden = artsWorks.length > 0;
    if (artsWorks.length > 0) return;
    notice.querySelector("p").innerHTML = `<strong>${escapeHTML(artsTrack?.label || "Film & art")} / 00 exposed plates.</strong> The darkroom is active; this branch of the practice is still developing.`;
  };

  const updateArchivePreview = (work, immediate = false) => {
    const preview = document.querySelector("#archive-preview");
    const image = preview?.querySelector("img");
    const code = preview?.querySelector(".archive-preview__code");
    const captions = preview?.querySelectorAll(".archive-preview__caption span");
    if (!preview || !image || !work) return;

    const swap = () => {
      image.src = work.cover.src;
      image.alt = work.cover.alt || `${work.title} project image`;
      if (code) code.textContent = specimenCode(work);
      if (captions?.[0]) captions[0].textContent = work.title;
      if (captions?.[1]) captions[1].textContent = mediumLabel(work.medium);
      preview.classList.remove("is-changing");
    };

    if (immediate || Site.reduceMotion.matches) swap();
    else {
      preview.classList.add("is-changing");
      window.setTimeout(swap, 170);
    }

    document.querySelectorAll(".archive-row").forEach(row => {
      row.classList.toggle("is-previewing", row.dataset.previewWork === work.id && row.matches(":focus-visible"));
    });
  };

  const bindArchivePreview = () => {
    document.querySelectorAll("[data-preview-work]").forEach(row => {
      const show = () => updateArchivePreview(state.worksById.get(row.dataset.previewWork));
      row.addEventListener("mouseenter", show);
      row.addEventListener("focus", show);
    });
  };

  const bindArchiveFilters = () => {
    const buttons = [...document.querySelectorAll(".catalogue-filter")];
    const rows = [...document.querySelectorAll(".archive-row")];
    buttons.forEach(button => {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter || "all";
        state.activeFilter = filter;
        buttons.forEach(item => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        });

        let firstVisible = null;
        rows.forEach(row => {
          const visible = filter === "all" || row.dataset.medium === filter;
          row.hidden = !visible;
          if (visible && !firstVisible) firstVisible = state.worksById.get(row.dataset.previewWork);
        });
        if (firstVisible) updateArchivePreview(firstVisible);
      });
    });
  };

  const renderExperience = profile => {
    const mount = document.querySelector("#experience-list");
    if (!mount) return;
    mount.innerHTML = (profile.workExperience || []).map(item => {
      const href = safeLink(item.website);
      const roles = (item.roles || []).map(role => `<li><span>${escapeHTML(role.title)}</span><span>${escapeHTML(role.period)}</span></li>`).join("");
      const years = String(item.period || "").replace(/\s/g, "");
      return `
        <article class="chronology-item reveal">
          <p class="chronology-period" aria-label="${escapeHTML(item.period)}">${escapeHTML(years)}</p>
          <div class="chronology-org">
            <a href="${escapeHTML(href)}"${externalAttrs(href)}>${escapeHTML(item.organization)}</a>
            <p>${escapeHTML(item.period)}</p>
          </div>
          <div class="chronology-details">
            <p>${escapeHTML(item.summary)}</p>
            <ul class="role-list">${roles}</ul>
          </div>
        </article>`;
    }).join("");

    const engineMount = document.querySelector("#engine-skills");
    const languageMount = document.querySelector("#language-skills");
    if (engineMount) engineMount.innerHTML = (profile.techStack?.gameEngines || []).map(skill => `<span>${escapeHTML(skill)}</span>`).join("");
    if (languageMount) languageMount.innerHTML = (profile.techStack?.languages || []).map(skill => `<span>${escapeHTML(skill)}</span>`).join("");

    const educationMount = document.querySelector("#education-list");
    if (educationMount) {
      educationMount.innerHTML = (profile.education || []).map(item => `
        <article class="education-item">
          <div>
            <span class="microcopy">${escapeHTML(item.period)}</span>
            <h3>${escapeHTML(item.degree || item.qualification || "Education")}</h3>
          </div>
          <div>
            <span class="microcopy">${escapeHTML(item.institution)}</span>
            <p>${escapeHTML(item.summary || "")}</p>
          </div>
        </article>`).join("");
    }

    observeReveals(mount);
  };

  const interestLinks = item => {
    const labels = {
      letterboxd: "Open Letterboxd",
      lastfm: "Open Last.fm",
      topster: "Open Topster"
    };
    const links = Object.entries(labels).flatMap(([field, label]) => {
      if (!item[field]) return [];
      const href = safeLink(item[field]);
      return [`<a href="${escapeHTML(href)}"${externalAttrs(href)}>${escapeHTML(label)} ↗</a>`];
    });
    return links.length ? `<div class="interest-spread__links">${links.join("")}</div>` : "";
  };

  const renderInterests = profile => {
    const mount = document.querySelector("#interest-spreads");
    if (!mount) return;
    const entries = Object.entries(profile.interests || {});
    mount.innerHTML = entries.map(([key, item], index) => `
      <article class="interest-spread reveal" data-index="${String(index + 1).padStart(2, "0")}">
        <div class="interest-spread__meta"><span>Human appetite</span><span>H/${String(index + 1).padStart(2, "0")}</span></div>
        <h3>${escapeHTML(key)}</h3>
        <p>${escapeHTML(item.description || "")}</p>
        ${interestLinks(item)}
      </article>`).join("");
    observeReveals(mount);
  };

  const renderSatellites = manifest => {
    const mount = document.querySelector("#satellite-list");
    if (!mount) return;
    mount.innerHTML = (manifest.sites || []).map((site, index) => {
      const href = safeLink(site.href);
      return `
        <a class="satellite-link reveal" href="${escapeHTML(href)}"${externalAttrs(href)}>
          <span class="satellite-link__number">${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHTML(site.title)}</h3>
          <p>${escapeHTML(site.note || "")}</p>
          <span class="satellite-link__arrow" aria-hidden="true">↗</span>
        </a>`;
    }).join("");
    observeReveals(mount);
  };

  const renderSocials = manifest => {
    const mount = document.querySelector("#social-links");
    if (!mount) return;
    mount.innerHTML = (manifest.identity?.socials || []).map(link => {
      const href = safeLink(link.href);
      return `<a href="${escapeHTML(href)}"${externalAttrs(href)}>${escapeHTML(link.label)}</a>`;
    }).join("");
  };

  const renderAll = ({ manifest, profile, works }) => {
    hydrateIdentity(manifest);
    renderFeaturedWorks(manifest);
    renderArchive();
    renderExperience(profile);
    renderInterests(profile);
    renderSatellites(manifest);
    renderSocials(manifest);
    document.querySelector("#work-count")?.replaceChildren(document.createTextNode(String(works.length).padStart(2, "0")));
  };

  Site.mediumLabel = mediumLabel;
  Site.specimenCode = specimenCode;
  Site.workAccent = workAccent;
  Site.getWork = id => state.worksById.get(id);

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const data = await loadData();
      renderAll(data);
      Site.resolveReady(data);
      document.dispatchEvent(new CustomEvent("site:data-ready", { detail: data }));
    } catch (error) {
      console.error(error);
      document.querySelector("#site-error")?.removeAttribute("hidden");
      Site.rejectReady(error);
    }
  });
})();
