/*
 * The visitor's own layer on the front door: the rows they starred, the passages they marked
 * with the highlighter, and "your copy", which is the page cut down to those two.
 *
 * None of it leaves the browser. Stars and marks are kept in localStorage and nowhere else,
 * so there is nothing here to send, sync or moderate.
 *
 * js/landing.js renders the page and says so (landing:ready, landing:record, landing:rows);
 * this script hangs its controls on what it finds there. A star is a button at the end of a
 * work row and in its record. The highlighter is picked up from the yellow chip under the
 * name, the one piece of text that is already marked. Marks are drawn with the CSS Custom
 * Highlight API, so the page's own DOM is never rewritten, and they are remembered by their
 * words and a little of what surrounds them: a mark whose text has since changed is dropped.
 *
 * Everything is built with createElement and textContent. Stored marks are the visitor's own
 * selections, but they are read back from storage, and storage is not to be trusted.
 */
(() => {
  "use strict";

  const root = document.documentElement;
  const STARS_KEY = "satyam.stars";
  const MARKS_KEY = "satyam.marks";
  const MAX_MARKS = 200;
  const MAX_LENGTH = 1200;
  const CONTEXT = 32;
  const SUPPORTED = typeof Highlight === "function" && !!window.CSS?.highlights;

  const SCOPE_NAMES = {
    intro: "the introduction",
    now: "right now",
    work: "work",
    writing: "writing",
    "film-writing": "film writing",
    more: "more ways through",
    footer: "the footer"
  };

  const read = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Private mode can refuse writes. The page still works for this visit. */
    }
  };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "data") Object.assign(node.dataset, value);
      else if (key === "attrs") for (const [name, v] of Object.entries(value)) node.setAttribute(name, v);
      else node[key] = value;
    }
    node.append(...[].concat(children));
    return node;
  }

  const validMark = (mark) => mark && typeof mark.id === "string" && typeof mark.scope === "string"
    && typeof mark.exact === "string" && mark.exact.length > 0 && mark.exact.length <= MAX_LENGTH
    && typeof mark.prefix === "string" && typeof mark.suffix === "string";

  // For js/ambient.js, which gives each of these a sound.
  const said = (kind) => document.dispatchEvent(new CustomEvent("visitor:kept", { detail: { kind } }));

  let page = null;
  let main = null;
  let stars = new Set();
  let marks = [];
  let copyOpen = false;

  function load() {
    stars = new Set(read(STARS_KEY).filter((id) => typeof id === "string"));
    marks = read(MARKS_KEY).filter(validMark).slice(-MAX_MARKS);
  }

  load();

  /* ---------------------------------------------------------------------- */
  /* Stars                                                                   */
  /* ---------------------------------------------------------------------- */

  function syncStar(button) {
    const id = button.dataset.star;
    const on = stars.has(id);
    const title = page?.works.get(id)?.title || "this work";
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? `Unstar ${title}` : `Star ${title}`);
    button.title = on ? "one of yours — click to let it go" : "keep this as one of yours";
    if (button.classList.contains("work-star--record")) button.textContent = on ? "[★ one of yours]" : "[☆ keep this one]";
  }

  function starButton(id, className = "work-star") {
    const button = el("button", { type: "button", className, data: { star: id } });
    syncStar(button);
    return button;
  }

  function decorateRows() {
    main.querySelectorAll("li[data-work-id]").forEach((row) => {
      if (!row.querySelector(":scope > .work-star")) row.append(starButton(row.dataset.workId));
    });
  }

  function toggleStar(id) {
    if (stars.has(id)) stars.delete(id);
    else stars.add(id);
    said(stars.has(id) ? "star" : "unstar");
    write(STARS_KEY, [...stars]);
    document.querySelectorAll("[data-star]").forEach(syncStar);
    changed();
  }

  /* ---------------------------------------------------------------------- */
  /* Marks                                                                   */
  /* ---------------------------------------------------------------------- */

  // id → the live Range each mark currently resolves to, for drawing and for lifting.
  const live = new Map();

  const language = () => root.dataset.language || "en";

  const scopeRoot = (scope) => document.querySelector(`[data-mark-scope="${CSS.escape(scope)}"]`);

  // A scope's text as one string, and where each of its text nodes starts in it. Range
  // .toString() concatenates the same nodes, so offsets taken from either agree.
  function textIndex(scope) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push({ node, start: text.length });
      text += node.data;
    }
    return { nodes, text };
  }

  const sharedEnd = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
    return n;
  };

  const sharedStart = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
    return n;
  };

  // The same words can occur more than once; the remembered surroundings pick which.
  function locate(mark, { text }) {
    let best = -1;
    let bestScore = -1;
    for (let at = text.indexOf(mark.exact); at !== -1; at = text.indexOf(mark.exact, at + 1)) {
      const end = at + mark.exact.length;
      const score = sharedEnd(text.slice(Math.max(0, at - mark.prefix.length), at), mark.prefix)
        + sharedStart(text.slice(end, end + mark.suffix.length), mark.suffix);
      if (score > bestScore) {
        best = at;
        bestScore = score;
      }
    }
    return best;
  }

  function rangeAt({ nodes }, from, to) {
    const range = document.createRange();
    const first = nodes.find(({ node, start }) => from >= start && from < start + node.data.length);
    const last = nodes.find(({ node, start }) => to > start && to <= start + node.data.length);
    if (!first || !last) return null;
    range.setStart(first.node, from - first.start);
    range.setEnd(last.node, to - last.start);
    return range;
  }

  // The marker does not work on [redacted]. It comes out black.
  function redactions(range) {
    const found = [];
    const top = range.commonAncestorContainer;
    const walker = document.createTreeWalker(top.nodeType === Node.TEXT_NODE ? top.parentNode : top, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue;
      const from = node === range.startContainer ? range.startOffset : 0;
      const to = node === range.endContainer ? range.endOffset : node.data.length;
      for (const match of node.data.matchAll(/\[redacted\]/gi)) {
        const a = Math.max(from, match.index);
        const b = Math.min(to, match.index + match[0].length);
        if (b <= a) continue;
        const struck = document.createRange();
        struck.setStart(node, a);
        struck.setEnd(node, b);
        found.push(struck);
      }
    }
    return found;
  }

  // A mark whose scope is not on screen (a record that is closed) is kept as long as
  // that record still exists.
  function stillExists(scope) {
    if (!page) return true;
    const [kind, ...rest] = scope.split(":");
    const id = rest.join(":");
    if (kind === "project") return page.works.has(id);
    if (kind === "review") return page.reviews.some((review) => review.id === id);
    return false;
  }

  function paint() {
    if (!SUPPORTED) return;
    live.clear();
    const marked = new Highlight();
    const struck = new Highlight();
    struck.priority = 1;
    const indexes = new Map();
    const before = marks.length;
    marks = marks.filter((mark) => {
      const scope = scopeRoot(mark.scope);
      if (!scope) return stillExists(mark.scope);
      if (!indexes.has(scope)) indexes.set(scope, textIndex(scope));
      const index = indexes.get(scope);
      const at = locate(mark, index);
      const range = at < 0 ? null : rangeAt(index, at, at + mark.exact.length);
      // Not found is not always gone: the review list grows on demand, and a mark made
      // over a heading in one language is not there to find while the page is in another.
      if (!range) return !!scope.querySelector("[data-review-load-more]") || (mark.lang || "en") !== language();
      live.set(mark.id, range);
      marked.add(range);
      redactions(range).forEach((part) => struck.add(part));
      return true;
    });
    CSS.highlights.set("visitor-mark", marked);
    CSS.highlights.set("visitor-redacted", struck);
    if (marks.length !== before) write(MARKS_KEY, marks);
  }

  function capture(selected) {
    const start = selected.startContainer.nodeType === Node.ELEMENT_NODE ? selected.startContainer : selected.startContainer.parentElement;
    const scope = start?.closest("[data-mark-scope]");
    if (!scope) return false;
    const range = selected.cloneRange();
    if (!scope.contains(range.endContainer)) range.setEnd(scope, scope.childNodes.length);

    const index = textIndex(scope);
    const head = document.createRange();
    head.selectNodeContents(scope);
    head.setEnd(range.startContainer, range.startOffset);
    let from = head.toString().length;
    let exact = range.toString();
    from += exact.length - exact.trimStart().length;
    exact = exact.trim().slice(0, MAX_LENGTH).trimEnd();
    if (exact.length < 2) return false;

    const mark = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      scope: scope.dataset.markScope,
      exact,
      prefix: index.text.slice(Math.max(0, from - CONTEXT), from),
      suffix: index.text.slice(from + exact.length, from + exact.length + CONTEXT),
      lang: language(),
      at: Date.now()
    };
    if (!marks.some((other) => other.scope === mark.scope && other.exact === mark.exact && other.prefix === mark.prefix)) {
      marks.push(mark);
      if (marks.length > MAX_MARKS) marks.shift();
      write(MARKS_KEY, marks);
      said("mark");
    }
    paint();
    changed();
    return true;
  }

  function markAt(x, y) {
    for (const [id, range] of live) {
      for (const box of range.getClientRects()) {
        if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return id;
      }
    }
    return null;
  }

  function lift(id) {
    marks = marks.filter((mark) => mark.id !== id);
    said("lift");
    write(MARKS_KEY, marks);
    paint();
    changed();
  }

  /* ---------------------------------------------------------------------- */
  /* The highlighter                                                         */
  /* ---------------------------------------------------------------------- */

  const coarse = matchMedia("(pointer: coarse)").matches;
  let pen = null;
  let toast = null;
  let pending = null;       // a touch selection waiting for [mark it]
  let suppressUntil = 0;    // the click that ends a selection must not also follow a link

  const markerOn = () => root.dataset.marker === "on";

  function buildToast() {
    const say = el("span", { className: "visitor-toast__say" });
    const markIt = el("button", { type: "button", className: "visitor-toast__button", textContent: "[mark it]", hidden: true, data: { markPending: "" } });
    const down = el("button", { type: "button", className: "visitor-toast__button", textContent: "[put it down]", data: { markerOff: "" } });
    toast = el("div", { className: "visitor-toast", attrs: { role: "status" } }, [say, " ", markIt, " ", down]);
    if (toast.showPopover) toast.setAttribute("popover", "manual");
    // Touching the button must not collapse the selection it is about to mark.
    markIt.addEventListener("pointerdown", (event) => event.preventDefault());
    document.body.append(toast);
  }

  function showToast() {
    if (!toast) buildToast();
    toast.querySelector(".visitor-toast__say").textContent = coarse
      ? "marker in hand. select something, then mark it. tap a mark to lift it."
      : "marker in hand. whatever you select stays marked. click a mark to lift it.";
    // A modal dialog sits in the top layer; showing again puts this above it.
    try {
      if (toast.matches(":popover-open")) toast.hidePopover();
      toast.showPopover?.();
    } catch {
      /* no popover here: it is a fixed element and that will do */
    }
    toast.classList.add("is-on");
  }

  function hideToast() {
    if (!toast) return;
    try {
      if (toast.matches(":popover-open")) toast.hidePopover();
    } catch {}
    toast.classList.remove("is-on");
  }

  function setMarker(on) {
    if (on) root.dataset.marker = "on";
    else delete root.dataset.marker;
    pen?.setAttribute("aria-pressed", String(on));
    if (pen) pen.title = on ? "put the highlighter down" : "the highlighter. pick it up";
    pending = null;
    if (on) showToast();
    else hideToast();
  }

  function mountPen() {
    const chip = main.querySelector(".hyper-subtitle");
    if (!SUPPORTED || !chip || chip.querySelector(".marker-pen")) return;
    pen = el("button", { type: "button", className: "marker-pen", data: { markerPen: "" }, attrs: { "aria-pressed": "false" } });
    pen.title = "the highlighter. pick it up";
    pen.append(...chip.childNodes);
    chip.append(pen);
  }

  function selectedRange() {
    const selection = getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    return selection.getRangeAt(0);
  }

  /* ---------------------------------------------------------------------- */
  /* Your copy                                                               */
  /* ---------------------------------------------------------------------- */

  let copyLink = null;
  let copyFoot = null;

  // The way in is at both ends of the page: a bracket link in the entry nav, and a word
  // in the footer's line of links, for whoever has read to the bottom.
  function mountNav() {
    const nav = main.querySelector(".hyper-entry-nav");
    if (nav && !nav.querySelector("[data-copy-toggle]")) {
      copyLink = el("button", { type: "button", className: "bracket-button", hidden: true, data: { copyToggle: "" } });
      // After the links that go somewhere, before the ones on the right that play.
      const right = nav.querySelector(".hyper-entry-nav__right");
      if (right) right.before(copyLink, " ");
      else nav.append(" ", copyLink);
    }
    const line = main.querySelector("footer > p:last-child");
    if (line && !line.querySelector(".footer-copy")) {
      copyFoot = el("span", { className: "footer-extra footer-copy", hidden: true }, [
        " · ",
        el("button", { type: "button", className: "bracket-button", data: { copyToggle: "" } })
      ]);
      line.append(copyFoot);
    }
  }

  function sourceOf(mark) {
    const [kind, ...rest] = mark.scope.split(":");
    const id = rest.join(":");
    if (kind === "project" && page.works.has(id)) {
      return el("a", { className: "project-link", href: `#project=${encodeURIComponent(id)}`, textContent: page.works.get(id).title, data: { projectId: id }, attrs: { "aria-haspopup": "dialog" } });
    }
    const review = kind === "review" && page.reviews.find((item) => item.id === id);
    if (review) {
      return el("a", { className: "review-link", href: `#review=${encodeURIComponent(id)}`, textContent: review.film, data: { reviewId: id }, attrs: { "aria-haspopup": "dialog" } });
    }
    return document.createTextNode(SCOPE_NAMES[mark.scope] || "the page");
  }

  function quoted(mark) {
    const text = mark.exact.replaceAll(/\s+/g, " ");
    const parts = text.split(/(\[redacted\])/i).filter(Boolean).map((part) => (
      /^\[redacted\]$/i.test(part) ? el("span", { className: "redacted", textContent: part }) : part
    ));
    return el("mark", {}, parts);
  }

  function starredRow(work) {
    return el("li", { className: "work-rest__item" }, [
      el("a", { className: "project-link work-rest__link", href: `#project=${encodeURIComponent(work.id)}`, data: { projectId: work.id }, attrs: { "aria-haspopup": "dialog" } }, [
        el("span", { className: "work-rest__mark", textContent: "→", attrs: { "aria-hidden": "true" } }),
        el("span", { className: "work-rest__title", textContent: work.title }),
        el("span", { className: "work-rest__meta", textContent: `${work.mediumResolved} / ${work.yearResolved}` })
      ]),
      starButton(work.id)
    ]);
  }

  // Clearing is the visitor's own data going, so it asks once before it does.
  function clearButton(label, count, kind) {
    return el("button", { type: "button", className: "bracket-button", textContent: `[${label}]`, data: { clear: kind, label, count: String(count) } });
  }

  function renderCopy() {
    main.querySelector(".your-copy")?.remove();
    if (!copyOpen) return;
    const kept = [...stars].map((id) => page.works.get(id)).filter(Boolean);
    const section = el("section", { className: "your-copy", id: "your-copy" });
    section.append(
      el("h2", { textContent: "Your copy" }),
      el("p", { className: "section-note" }, [
        "What you starred and what you marked. The things you fell in love with ;)",
        el("button", { type: "button", className: "bracket-button", textContent: "[print it]", data: { print: "" } }),
        " ",
        el("button", { type: "button", className: "bracket-button", textContent: "[the whole page]", data: { copyToggle: "" } })
      ])
    );

    if (kept.length) {
      section.append(
        el("h3", { className: "work-rest__heading" }, ["starred ", el("small", { textContent: `(${kept.length})` }), " ", clearButton("clear stars", kept.length, "stars")]),
        el("ul", { className: "work-rest__list" }, kept.map(starredRow))
      );
    }

    if (marks.length) {
      section.append(
        el("h3", { className: "work-rest__heading" }, ["marked ", el("small", { textContent: `(${marks.length})` }), " ", clearButton("clear marks", marks.length, "marks")]),
        el("ol", { className: "copy-marks" }, marks.map((mark) => el("li", { className: "copy-mark" }, [
          el("blockquote", {}, quoted(mark)),
          el("p", { className: "copy-mark__from" }, [
            "from ",
            sourceOf(mark),
            " · ",
            el("button", { type: "button", className: "bracket-button", textContent: "lift", data: { lift: mark.id } })
          ])
        ])))
      );
    }

    main.querySelector(".hyper-intro").after(section);
  }

  function setCopy(open) {
    copyOpen = open && (stars.size > 0 || marks.length > 0);
    main.classList.toggle("is-copy", copyOpen);
    renderCopy();
    syncNav();
    if (open) window.scrollTo({ top: 0, behavior: "instant" });
  }

  function syncNav() {
    const label = copyOpen ? "the whole page" : "your copy";
    const none = !(stars.size || marks.length);
    if (copyLink) {
      copyLink.hidden = none;
      copyLink.textContent = `[${label}]`;
      copyLink.setAttribute("aria-pressed", String(copyOpen));
    }
    if (copyFoot) {
      copyFoot.hidden = none;
      copyFoot.querySelector("button").textContent = label;
    }
  }

  // Something the visitor keeps has changed: the nav link and, if it is open, their copy.
  function changed() {
    if (!main) return;
    if (copyOpen && !stars.size && !marks.length) return setCopy(false);
    syncNav();
    renderCopy();
  }

  /* ---------------------------------------------------------------------- */
  /* Wiring                                                                  */
  /* ---------------------------------------------------------------------- */

  let armed = null;

  document.addEventListener("click", (event) => {
    // The click that finishes a selection made over a link is not a click on the link.
    if (performance.now() < suppressUntil) {
      suppressUntil = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const target = event.target.closest?.("[data-star], [data-marker-pen], [data-marker-off], [data-mark-pending], [data-copy-toggle], [data-lift], [data-clear]");

    if (markerOn() && !target) {
      const id = markAt(event.clientX, event.clientY);
      if (id) {
        event.preventDefault();
        event.stopPropagation();
        lift(id);
      }
      return;
    }
    if (!target) return;

    if (target.dataset.star !== undefined) {
      event.preventDefault();
      toggleStar(target.dataset.star);
    } else if (target.dataset.markerPen !== undefined) {
      setMarker(!markerOn());
    } else if (target.dataset.markerOff !== undefined) {
      setMarker(false);
    } else if (target.dataset.markPending !== undefined) {
      if (pending && capture(pending)) getSelection()?.removeAllRanges();
      pending = null;
      target.hidden = true;
    } else if (target.dataset.copyToggle !== undefined) {
      setCopy(!copyOpen);
    } else if (target.dataset.lift !== undefined) {
      lift(target.dataset.lift);
    } else if (target.dataset.clear !== undefined) {
      if (armed !== target) {
        armed = target;
        target.textContent = `[sure? that is ${target.dataset.count} gone]`;
        setTimeout(() => {
          if (armed === target) armed = null;
          if (target.isConnected) target.textContent = `[${target.dataset.label}]`;
        }, 4000);
        return;
      }
      armed = null;
      if (target.dataset.clear === "stars") {
        stars.clear();
        write(STARS_KEY, []);
        document.querySelectorAll("[data-star]").forEach(syncStar);
      } else {
        marks = [];
        write(MARKS_KEY, marks);
        paint();
      }
      changed();
    }
  }, true);

  if (SUPPORTED) {
    // A work row is one link, and a browser will not start a selection inside a link:
    // some drag the link away, some do nothing. So for as long as the button is held the
    // link is not one. Its address is taken off on the way down and put back on the way
    // up, before the click, so a plain click still goes where it always went.
    let held = null;
    const giveBack = () => {
      if (held) held.link.setAttribute("href", held.href);
      held = null;
    };
    document.addEventListener("mousedown", (event) => {
      giveBack();
      if (!markerOn() || event.button !== 0) return;
      const link = event.target.closest?.("a[href]");
      if (!link || !link.closest("[data-mark-scope]")) return;
      held = { link, href: link.getAttribute("href") };
      link.removeAttribute("href");
    }, true);
    addEventListener("mouseup", giveBack, true);
    addEventListener("blur", giveBack);

    // With a mouse the mark is made the moment the selection is let go of.
    document.addEventListener("mouseup", (event) => {
      if (!markerOn() || coarse || event.button !== 0) return;
      const range = selectedRange();
      if (!range || !capture(range)) return;
      getSelection().removeAllRanges();
      suppressUntil = performance.now() + 400;
    });

    // On a touch screen a selection is adjusted by its handles, so it waits to be asked.
    document.addEventListener("selectionchange", () => {
      if (!markerOn() || !coarse || !toast) return;
      const range = selectedRange();
      pending = range ? range.cloneRange() : pending;
      toast.querySelector("[data-mark-pending]").hidden = !range;
    });

    // A row is one link, and dragging a link drags the link. With the marker in hand it
    // should select the words instead.
    document.addEventListener("dragstart", (event) => {
      if (markerOn()) event.preventDefault();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && markerOn() && !document.querySelector("dialog[open]")) setMarker(false);
    });
  }

  document.addEventListener("landing:ready", (event) => {
    page = event.detail;
    main = document.getElementById("landing-main");
    root.dataset.visitor = "on";
    decorateRows();
    mountPen();
    mountNav();
    paint();
    changed();
  });

  document.addEventListener("landing:record", (event) => {
    const { kind, id, root: body } = event.detail;
    if (kind === "project") body.querySelector(".project-dialog__meta")?.after(" ", starButton(id, "work-star--record bracket-button"));
    paint();
    if (markerOn()) showToast();
  });

  document.addEventListener("landing:rows", paint);
  // js/language.js has changed what the headings say, so the marks are found again.
  document.addEventListener("landing:said", paint);

  addEventListener("storage", (event) => {
    if (event.key !== STARS_KEY && event.key !== MARKS_KEY) return;
    load();
    if (!main) return;
    document.querySelectorAll("[data-star]").forEach(syncStar);
    paint();
    changed();
  });
})();
