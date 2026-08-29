(() => {
  "use strict";

  const app = document.getElementById("landing-app");
  const dialog = document.getElementById("project-dialog");
  const detail = dialog?.querySelector("[data-project-detail]");
  const closeButton = dialog?.querySelector("[data-dialog-close]");
  const reviewDialog = document.getElementById("review-dialog");
  const reviewDetail = reviewDialog?.querySelector("[data-review-detail]");
  const reviewCloseButton = reviewDialog?.querySelector("[data-review-dialog-close]");
  if (!app || !dialog || !detail || !closeButton || !reviewDialog || !reviewDetail || !reviewCloseButton) return;

  const REVIEW_BATCH_SIZE = 12;

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

  const copyEmailMarkup = (email, label = email) => {
    const safeEmail = escapeHtml(email);
    return `<button type="button" class="copy-email" data-copy-email="${safeEmail}" aria-label="Copy ${safeEmail} to clipboard">${escapeHtml(label)}</button>`;
  };

  const emailFromHref = (href) => {
    if (!/^mailto:/i.test(href)) return "";
    const value = href.replace(/^mailto:/i, "").split("?", 1)[0];
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

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
    let externalContent = { reviews: [] };
    try {
      const cachePath = String(home.externalFeeds?.cache || "content/external-feeds.json").replace(/^\/+/, "");
      externalContent = await fetchJson(`/${cachePath}`);
    } catch (error) {
      console.warn("The Letterboxd feed cache did not load", error);
    }

    // Writing is native now: content/blog.json is generated from content/posts.
    let blog = { posts: [] };
    try {
      const blogPath = String(home.externalFeeds?.blog || "content/blog.json").replace(/^\/+/, "");
      blog = await fetchJson(`/${blogPath}`);
    } catch (error) {
      console.warn("The blog index did not load", error);
    }
    const works = [
      ...(home.works || []).map((work) => normalizeWork(work, "home")),
      ...feeds.flatMap((feed) => (feed.works || []).map((work) => normalizeWork(work, feed.source?.id || "archive")))
    ];
    const unique = [...new Map(works.map((work) => [work.id, work])).values()];
    const map = new Map(unique.map((work) => [work.id, work]));
    const reviewMinCharacters = Number(home.externalFeeds?.reviewMinCharacters) || 200;
    const reviews = (externalContent.reviews || []).filter((review) => (
      review && review.film && review.id && reviewCharacterCount(review.review) > reviewMinCharacters
    ));
    return {
      home,
      works: unique,
      workMap: map,
      featured: (home.featured || []).map((id) => map.get(id)).filter(Boolean),
      writing: blog.posts || [],
      reviews
    };
  }

  const projectHref = (work) => `#project=${encodeURIComponent(work.id)}`;
  const reviewHref = (review) => `#review=${encodeURIComponent(review.id)}`;

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
    return [...works]
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }))
      .map((work) => `
      <div class="project-index__entry">
        <dt><a class="project-link" href="${escapeHtml(projectHref(work))}" data-project-id="${escapeHtml(work.id)}" aria-haspopup="dialog">${escapeHtml(work.title)}</a> <small>[${escapeHtml(work.mediumResolved)} / ${escapeHtml(work.yearResolved)}]</small></dt>
        <dd>${escapeHtml(work.summaryResolved)}</dd>
      </div>`).join("");
  }

  function writingList(writing, sourceHref) {
    if (!writing?.length) {
      return `<li>Nothing is published yet. <a href="${escapeHtml(safeHref(sourceHref))}">Open the writing index.</a></li>`;
    }
    return writing.map((item) => {
      const href = safeHref(item.href);
      return `<li><a href="${escapeHtml(href)}"${externalAttributes(href)}>${escapeHtml(item.title)}</a> (${escapeHtml(item.year)})</li>`;
    }).join("");
  }

  function dateLabel(value) {
    const [year, month, day] = String(value || "").split("-");
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return year && months[Number(month) - 1] && day
      ? `${day} ${months[Number(month) - 1]} ${year}`
      : String(value || "date unavailable");
  }

  function ratingMarkup(rating) {
    if (rating === null || rating === undefined || rating === "") return "";
    const value = Number(rating);
    if (!Number.isFinite(value) || value <= 0) return "";
    const stars = `${"★".repeat(Math.floor(value))}${value % 1 ? "½" : ""}`;
    return `<span class="review-rating" aria-label="${escapeHtml(`${value} out of 5 stars`)}">${escapeHtml(stars)}</span>`;
  }

  function reviewExcerpt(value, maximum = 260) {
    const text = String(value || "").replaceAll(/\s+/g, " ").trim();
    return text.length > maximum ? `${text.slice(0, maximum).trimEnd()}…` : text;
  }

  function reviewCharacterCount(value) {
    return [...String(value || "")].length;
  }

  function reviewList(reviews, sourceHref) {
    if (!reviews?.length) {
      return `<li class="review-index__empty">No long reviews are available in the current feed. <a href="${escapeHtml(safeHref(sourceHref))}"${externalAttributes(sourceHref)}>Open Letterboxd.</a></li>`;
    }
    return reviews.map((review) => `
      <li class="review-index__entry">
        <p class="review-index__date">${escapeHtml(dateLabel(review.watchedDate))}</p>
        <h3><a class="review-link" href="${escapeHtml(reviewHref(review))}" data-review-id="${escapeHtml(review.id)}" aria-haspopup="dialog">${escapeHtml(review.film)}</a></h3>
        <p class="review-index__excerpt"><small>${escapeHtml(review.filmYear)} ${ratingMarkup(review.rating)}</small><br>${escapeHtml(reviewExcerpt(review.review))}</p>
      </li>`).join("");
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

  function render({ home, works, featured, writing, reviews }) {
    const identity = home.identity || {};
    const blogHref = identity.links?.writing || "/blog/";
    const letterboxdHref = identity.links?.letterboxd || "https://letterboxd.com/satyamkashyap/";
    const initialReviews = reviews.slice(0, REVIEW_BATCH_SIZE);
    app.innerHTML = `
      <main class="hyper-page" id="landing-main">
        <nav class="hyper-entry-nav" aria-label="More portfolio visualizations">
          ${branchLinks(home.branches)} ${copyEmailMarkup(identity.email, "[email]")}
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
          <p class="section-note">Essentials, click to read more about them.</p>
          <ol class="hyper-selected">${selectedProjects(featured)}</ol>
        </section>

        <section id="all-projects">
          <h2>All projects - (${works.length})</h2>
          <dl class="project-index">${completeIndex(works)}</dl>
        </section>

        <section class="hyper-writing" id="writing">
          <h2>Writing</h2>
          <p class="section-note">Essays and notes. <a href="${escapeHtml(safeHref(blogHref))}">Read them all →</a></p>
          <ul>${writingList(writing, blogHref)}</ul>
        </section>

        <section class="hyper-reviews" id="film-writing">
          <h2>Film writing</h2>
          <p class="section-note">Some of my writings from <a href="${escapeHtml(safeHref(letterboxdHref))}"${externalAttributes(letterboxdHref)}>my Letterboxd diary</a>. Open a title to read the full note here.</p>
          <ol class="review-index" id="review-index">${reviewList(initialReviews, letterboxdHref)}</ol>
          ${reviews.length > initialReviews.length ? `<button class="review-index__load-more" type="button" data-review-load-more aria-controls="review-index">load more reviews (${initialReviews.length}/${reviews.length})</button>` : ""}
        </section>

        <section class="hyper-more" id="more">
          <h2>More ways through</h2>
          <p class="section-note">The front page is the direct account. These branches are alternate visualizations for going further.</p>
          <div>${branchRegister(home.branches)}</div>
        </section>

        <hr>
        <footer>
          <p>${escapeHtml(identity.statement)}</p>
          <p>${socialLinks(identity)} · ${copyEmailMarkup(identity.email)}</p>
        </footer>
      </main>`;

    const reviewIndex = app.querySelector("#review-index");
    const loadMoreReviews = app.querySelector("[data-review-load-more]");
    let visibleReviewCount = initialReviews.length;
    loadMoreReviews?.addEventListener("click", () => {
      const nextReviewCount = Math.min(visibleReviewCount + REVIEW_BATCH_SIZE, reviews.length);
      reviewIndex?.insertAdjacentHTML("beforeend", reviewList(reviews.slice(visibleReviewCount, nextReviewCount), letterboxdHref));
      visibleReviewCount = nextReviewCount;
      if (visibleReviewCount >= reviews.length) {
        loadMoreReviews.remove();
      } else {
        loadMoreReviews.textContent = `load more reviews (${visibleReviewCount}/${reviews.length})`;
      }
    });
  }

  function detailLinks(work) {
    if (!work.linksResolved.length) return "";
    return `<nav class="project-dialog__links" aria-label="Project links">${work.linksResolved.map((link) => `
      ${emailFromHref(link.href)
        ? copyEmailMarkup(emailFromHref(link.href), `[${link.name}] ↗`)
        : `<a href="${escapeHtml(link.href)}"${externalAttributes(link.href)}>[${escapeHtml(link.name)}] ↗</a>`}`).join("")}</nav>`;
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
  let reviewMap = new Map();
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

  function openReview(id) {
    const review = reviewMap.get(id);
    if (!review) return;
    const href = safeHref(review.href, "");
    const poster = safeAsset(review.poster, "");
    reviewDetail.innerHTML = `
      <div class="review-dialog__lead">
        <div>
          <p class="project-dialog__meta">watched ${escapeHtml(dateLabel(review.watchedDate))}</p>
          <h2 id="review-dialog-title">${escapeHtml(review.film)}</h2>
          <p class="project-dialog__summary">${escapeHtml(review.filmYear)} ${ratingMarkup(review.rating)}</p>
        </div>
        ${poster ? `<figure class="review-dialog__poster"><img src="${escapeHtml(poster)}" alt="${escapeHtml(`${review.film} poster`)}" loading="lazy" decoding="async"></figure>` : ""}
      </div>
      <div class="project-dialog__text review-dialog__text">${String(review.review || "").split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")}</div>
      ${href ? `<nav class="project-dialog__links" aria-label="Review links"><a href="${escapeHtml(href)}"${externalAttributes(href)}>[read on letterboxd] ↗</a></nav>` : ""}`;

    reviewDetail.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => image.closest("figure")?.remove(), { once: true });
    });
    if (!reviewDialog.open) reviewDialog.showModal();
    document.body.classList.add("dialog-open");
    reviewCloseButton.focus({ preventScroll: true });
  }

  function hashValue(key) {
    return new URLSearchParams(location.hash.slice(1)).get(key);
  }

  function syncDialogFromUrl() {
    const projectId = hashValue("project");
    const reviewId = hashValue("review");
    if (projectId && projectMap.has(projectId)) {
      openProject(projectId);
    } else if (reviewId && reviewMap.has(reviewId)) {
      openReview(reviewId);
    } else if (dialog.open || reviewDialog.open) {
      historyIsClosing = true;
      if (dialog.open) dialog.close();
      if (reviewDialog.open) reviewDialog.close();
    }
  }

  function bindDialog(dialogElement, closeElement, detailElement, hashKey) {
    closeElement.addEventListener("click", () => dialogElement.close());
    dialogElement.addEventListener("click", (event) => {
      if (event.target === dialogElement) dialogElement.close();
    });
    dialogElement.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      detailElement.replaceChildren();
      if (historyIsClosing) {
        historyIsClosing = false;
      } else if (hashValue(hashKey)) {
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      }
    });
  }

  function bindInteractions() {
    app.addEventListener("click", (event) => {
      const projectLink = event.target.closest(".project-link");
      if (projectLink) {
        event.preventDefault();
        const id = projectLink.dataset.projectId;
        if (!projectMap.has(id)) return;
        history.pushState(null, "", projectHref(projectMap.get(id)));
        openProject(id);
        return;
      }

      const reviewLink = event.target.closest(".review-link");
      if (reviewLink) {
        event.preventDefault();
        const id = reviewLink.dataset.reviewId;
        if (!reviewMap.has(id)) return;
        history.pushState(null, "", reviewHref(reviewMap.get(id)));
        openReview(id);
      }
    });

    bindDialog(dialog, closeButton, detail, "project");
    bindDialog(reviewDialog, reviewCloseButton, reviewDetail, "review");
    window.addEventListener("popstate", syncDialogFromUrl);
  }

  loadPortfolio()
    .then((portfolio) => {
      projectMap = portfolio.workMap;
      reviewMap = new Map(portfolio.reviews.map((review) => [review.id, review]));
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
