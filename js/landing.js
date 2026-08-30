(() => {
  "use strict";

  const app = document.getElementById("landing-app");
  const projectDialogElement = document.getElementById("project-dialog");
  const reviewDialogElement = document.getElementById("review-dialog");
  if (!app || !projectDialogElement || !reviewDialogElement) return;

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

  const paragraphs = (value) => String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");

  const ordinal = (index, total) => `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

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

  const titleComparator = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });

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

    // Two tiers, one appearance each: the author's featured order leads, the
    // remainder follows alphabetically.
    const featuredIds = new Set((home.featured || []).filter((id) => map.has(id)));
    const lead = (home.featured || []).map((id) => map.get(id)).filter(Boolean);
    const rest = unique.filter((work) => !featuredIds.has(work.id)).sort(titleComparator);

    const reviewMinCharacters = Number(home.externalFeeds?.reviewMinCharacters) || 200;
    const reviews = (externalContent.reviews || []).filter((review) => (
      review && review.film && review.id && reviewCharacterCount(review.review) > reviewMinCharacters
    ));
    return {
      home,
      lead,
      rest,
      works: [...lead, ...rest],
      workMap: map,
      writing: blog.posts || [],
      reviews
    };
  }

  const projectHref = (work) => `#project=${encodeURIComponent(work.id)}`;
  const reviewHref = (review) => `#review=${encodeURIComponent(review.id)}`;

  function branchLinks(branches) {
    return Object.entries(branches || {}).map(([name, branch]) => {
      const href = safeHref(branch.href);
      return `<a href="${escapeHtml(href)}">[${escapeHtml(name)}]</a>`;
    }).join(" ");
  }

  const workLink = (work) => `href="${escapeHtml(projectHref(work))}" data-project-id="${escapeHtml(work.id)}" aria-haspopup="dialog"`;

  function leadRegister(works) {
    return works.map((work) => `
      <li class="work-lead" data-work-id="${escapeHtml(work.id)}">
        <a class="project-link work-lead__link" ${workLink(work)}>
          <span class="work-lead__mark" aria-hidden="true">★</span>
          <h3 class="work-lead__title">${escapeHtml(work.title)}</h3>
          <p class="work-lead__body"><small>${escapeHtml(work.mediumResolved)}, ${escapeHtml(work.yearResolved)}</small><br>${escapeHtml(work.summaryResolved)}</p>
        </a>
      </li>`).join("");
  }

  function restRegister(works) {
    return works.map((work) => `
      <li class="work-rest__item" data-work-id="${escapeHtml(work.id)}">
        <a class="project-link work-rest__link" ${workLink(work)}>
          <span class="work-rest__mark" aria-hidden="true">→</span>
          <span class="work-rest__title">${escapeHtml(work.title)}</span>
          <span class="work-rest__meta">${escapeHtml(work.mediumResolved)} / ${escapeHtml(work.yearResolved)}</span>
        </a>
      </li>`).join("");
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
      <li class="review-index__entry" data-review-row="${escapeHtml(review.id)}">
        <a class="review-link review-index__link" href="${escapeHtml(reviewHref(review))}" data-review-id="${escapeHtml(review.id)}" aria-haspopup="dialog">
          <span class="review-index__date">${escapeHtml(dateLabel(review.watchedDate))}</span>
          <span class="review-index__film">${escapeHtml(review.film)}</span>
          <span class="review-index__meta">${escapeHtml(review.filmYear)} ${ratingMarkup(review.rating)}</span>
          <span class="review-index__excerpt">${escapeHtml(reviewExcerpt(review.review))}</span>
        </a>
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

  function render(portfolio) {
    const { home, lead, rest, writing, reviews } = portfolio;
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

        <section class="hyper-work" id="work">
          <h2>Work</h2>
          <p class="section-note">★ marks the ones I would show you first. Open any row to read the record — inside it, ← and → move between them.</p>
          <ol class="work-lead-list">${leadRegister(lead)}</ol>
          ${rest.length ? `
          <div class="work-rest">
            <h3 class="work-rest__heading">everything else <small>(${rest.length})</small></h3>
            <ul class="work-rest__list">${restRegister(rest)}</ul>
          </div>` : ""}
        </section>

        <section class="hyper-writing" id="writing">
          <h2>Writing</h2>
          <p class="section-note">Essays and notes. <a href="${escapeHtml(safeHref(blogHref))}">Read them all →</a></p>
          <ul>${writingList(writing, blogHref)}</ul>
        </section>

        <section class="hyper-reviews" id="film-writing">
          <h2>Film writing</h2>
          <p class="section-note">Some of my writings from <a href="${escapeHtml(safeHref(letterboxdHref))}"${externalAttributes(letterboxdHref)}>my Letterboxd diary</a>. Open a title to read the full note here, then keep moving with ← and →.</p>
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
  }

  /* Record dialogs                                                          */
  /* ---------------------------------------------------------------------- */

  const workRows = new Map();
  let historyIsClosing = false;

  const hashValue = (key) => new URLSearchParams(location.hash.slice(1)).get(key);

  const clearHash = () => history.replaceState(null, "", `${location.pathname}${location.search}`);

  /**
   * One controller drives both record dialogs so the project modal and the
   * review modal behave identically: prev/next, a position counter, arrow keys,
   * and a close that puts you back on the row you are actually looking at.
   */
  function createRecordDialog({ root, hashKey, hrefFor, renderRecord, rowFor, onNavigate }) {
    const shellBody = root.querySelector("[data-dialog-body]");
    const closeButton = root.querySelector("[data-dialog-close]");
    const previousButton = root.querySelector("[data-dialog-prev]");
    const nextButton = root.querySelector("[data-dialog-next]");
    const position = root.querySelector("[data-dialog-position]");

    let records = new Map();
    let sequence = [];
    let currentId = "";

    function indexOfCurrent() {
      return sequence.indexOf(currentId);
    }

    function updateControls() {
      const index = indexOfCurrent();
      const total = sequence.length;
      const known = index >= 0 && total > 0;
      previousButton.disabled = !known || index === 0;
      nextButton.disabled = !known || index === total - 1;
      position.textContent = known ? ordinal(index, total) : "";
    }

    function open(id, { push = false } = {}) {
      const record = records.get(id);
      if (!record) return false;
      currentId = id;
      shellBody.innerHTML = `<article class="record-dialog__record">${renderRecord(record)}</article>`;
      shellBody.querySelectorAll("img").forEach((image) => {
        image.addEventListener("error", () => image.closest("figure")?.remove(), { once: true });
      });
      shellBody.scrollTop = 0;
      updateControls();
      const href = hrefFor(record);
      // Opening pushes one entry so Back leaves the record; stepping through
      // replaces it so a long browse does not bury the page in history.
      if (push) history.pushState(null, "", href);
      else if (root.open) history.replaceState(null, "", href);
      if (!root.open) {
        root.showModal();
        document.body.classList.add("dialog-open");
        closeButton.focus({ preventScroll: true });
      }
      onNavigate?.(id);
      return true;
    }

    function step(delta) {
      const index = indexOfCurrent();
      if (index < 0) return;
      const target = sequence[index + delta];
      if (target) open(target);
    }

    function returnToRow() {
      const row = rowFor?.(currentId);
      if (!row) return;
      row.focus({ preventScroll: true });
      const box = row.getBoundingClientRect();
      if (box.top < 80 || box.bottom > window.innerHeight - 40) {
        row.scrollIntoView({ block: "center", behavior: "auto" });
      }
    }

    closeButton.addEventListener("click", () => root.close());
    previousButton.addEventListener("click", () => step(-1));
    nextButton.addEventListener("click", () => step(1));

    root.addEventListener("click", (event) => {
      if (event.target === root) root.close();
    });

    root.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "Escape") {
        // Closing is handled here rather than left to the native cancel so the
        // bar's "close [esc]" holds even where that path is unavailable.
        event.preventDefault();
        root.close();
      }
    });

    root.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      const wasHistory = historyIsClosing;
      historyIsClosing = false;
      if (!wasHistory && hashValue(hashKey)) clearHash();
      returnToRow();
      shellBody.replaceChildren();
      currentId = "";
    });

    return {
      has: (id) => records.has(id),
      isOpen: () => root.open,
      open,
      close: () => root.close(),
      setRecords(next) {
        records = next;
        if (!sequence.length) sequence = [...records.keys()];
        updateControls();
      },
      setSequence(next) {
        sequence = next.filter((id) => records.has(id));
        updateControls();
      }
    };
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

  const projectDialog = createRecordDialog({
    root: projectDialogElement,
    hashKey: "project",
    hrefFor: projectHref,
    rowFor: (id) => workRows.get(id)?.querySelector(".project-link"),
    renderRecord: (work) => `
      <p class="project-dialog__meta">${escapeHtml(work.mediumResolved)} / ${escapeHtml(work.yearResolved)}</p>
      <h2 id="project-dialog-title">${escapeHtml(work.title)}</h2>
      <p class="project-dialog__summary">${escapeHtml(work.summaryResolved)}</p>
      <div class="project-dialog__text">${paragraphs(work.bodyResolved)}</div>
      ${detailLinks(work)}
      ${detailImages(work)}`
  });

  const reviewState = { visibleCount: 0, ensure: null };

  const reviewDialog = createRecordDialog({
    root: reviewDialogElement,
    hashKey: "review",
    hrefFor: reviewHref,
    rowFor: (id) => {
      reviewState.ensure?.(id);
      return app.querySelector(`[data-review-row="${CSS.escape(id)}"] .review-index__link`);
    },
    renderRecord: (review) => {
      const href = safeHref(review.href, "");
      const poster = safeAsset(review.poster, "");
      return `
      <div class="review-dialog__lead">
        <div>
          <p class="project-dialog__meta">watched ${escapeHtml(dateLabel(review.watchedDate))}</p>
          <h2 id="review-dialog-title">${escapeHtml(review.film)}</h2>
          <p class="project-dialog__summary">${escapeHtml(review.filmYear)} ${ratingMarkup(review.rating)}</p>
        </div>
        ${poster ? `<figure class="review-dialog__poster"><img src="${escapeHtml(poster)}" alt="${escapeHtml(`${review.film} poster`)}" loading="lazy" decoding="async"></figure>` : ""}
      </div>
      <div class="project-dialog__text review-dialog__text">${paragraphs(review.review)}</div>
      ${href ? `<nav class="project-dialog__links" aria-label="Review links"><a href="${escapeHtml(href)}"${externalAttributes(href)}>[read on letterboxd] ↗</a></nav>` : ""}`;
    }
  });

  function bindReviewIndex(reviews, letterboxdHref) {
    const list = app.querySelector("#review-index");
    const loadMore = app.querySelector("[data-review-load-more]");
    if (!list) return;
    reviewState.visibleCount = Math.min(REVIEW_BATCH_SIZE, reviews.length);

    function showUpTo(count) {
      const next = Math.min(count, reviews.length);
      if (next <= reviewState.visibleCount) return;
      list.insertAdjacentHTML("beforeend", reviewList(reviews.slice(reviewState.visibleCount, next), letterboxdHref));
      reviewState.visibleCount = next;
      if (!loadMore) return;
      if (reviewState.visibleCount >= reviews.length) loadMore.remove();
      else loadMore.textContent = `load more reviews (${reviewState.visibleCount}/${reviews.length})`;
    }

    // Stepping through reviews in the dialog can outrun the rendered list, so
    // closing on an unrendered review reveals it first and lands you on it.
    reviewState.ensure = (id) => {
      const index = reviews.findIndex((review) => review.id === id);
      if (index >= reviewState.visibleCount) showUpTo(index + 1);
    };

    loadMore?.addEventListener("click", () => showUpTo(reviewState.visibleCount + REVIEW_BATCH_SIZE));
  }

  function syncDialogFromUrl() {
    const projectId = hashValue("project");
    const reviewId = hashValue("review");
    if (projectId && projectDialog.has(projectId)) {
      projectDialog.open(projectId);
    } else if (reviewId && reviewDialog.has(reviewId)) {
      reviewDialog.open(reviewId);
    } else if (projectDialog.isOpen() || reviewDialog.isOpen()) {
      historyIsClosing = true;
      projectDialog.close();
      reviewDialog.close();
    }
  }

  function bindInteractions(portfolio) {
    app.addEventListener("click", (event) => {
      const projectLink = event.target.closest(".project-link");
      if (projectLink) {
        const id = projectLink.dataset.projectId;
        if (!projectDialog.has(id)) return;
        event.preventDefault();
        projectDialog.open(id, { push: true });
        return;
      }

      const reviewLink = event.target.closest(".review-link");
      if (reviewLink) {
        const id = reviewLink.dataset.reviewId;
        if (!reviewDialog.has(id)) return;
        event.preventDefault();
        reviewDialog.open(id, { push: true });
      }
    });

    // Both tiers are one sequence, so stepping through records follows the
    // order they are read in and closing can return to the right row.
    app.querySelectorAll("[data-work-id]").forEach((row) => workRows.set(row.dataset.workId, row));
    projectDialog.setSequence(portfolio.works.map((work) => work.id));
    bindReviewIndex(portfolio.reviews, portfolio.home.identity?.links?.letterboxd || "https://letterboxd.com/satyamkashyap/");
    window.addEventListener("popstate", syncDialogFromUrl);
  }

  loadPortfolio()
    .then((portfolio) => {
      projectDialog.setRecords(portfolio.workMap);
      reviewDialog.setRecords(new Map(portfolio.reviews.map((review) => [review.id, review])));
      reviewDialog.setSequence(portfolio.reviews.map((review) => review.id));
      render(portfolio);
      bindInteractions(portfolio);
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
