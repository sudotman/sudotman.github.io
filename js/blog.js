(() => {
  "use strict";

  /**
   * Tag and text filtering for the writing index.
   *
   * Pure progressive enhancement: the list is already complete in the HTML, so
   * with JavaScript off every post is still there and still linked. This only
   * hides rows.
   */

  const filter = document.querySelector("[data-post-filter]");
  const list = document.querySelector("[data-post-list]");
  const empty = document.querySelector("[data-post-empty]");
  if (!filter || !list) return;

  const entries = [...list.querySelectorAll(".post-list__entry")];
  const search = filter.querySelector("[data-post-search]");
  const tagButtons = [...filter.querySelectorAll("[data-tag]")];
  const reset = document.querySelector("[data-post-reset]");

  let activeTag = "";
  let query = "";

  const matches = (entry) => {
    const tags = (entry.dataset.tags || "").split(" ").filter(Boolean);
    if (activeTag && !tags.includes(activeTag)) return false;
    return !query || (entry.dataset.search || "").includes(query);
  };

  function apply() {
    let visible = 0;
    for (const entry of entries) {
      const shown = matches(entry);
      entry.hidden = !shown;
      if (shown) visible += 1;
    }
    if (empty) empty.hidden = visible !== 0;

    // Keep the state shareable without turning it into a history entry per keystroke.
    const params = new URLSearchParams();
    if (activeTag) params.set("tag", activeTag);
    const hash = params.toString();
    history.replaceState(null, "", hash ? `?${hash}` : location.pathname);
  }

  function selectTag(tag) {
    activeTag = tag;
    for (const button of tagButtons) button.classList.toggle("is-active", button.dataset.tag === tag);
    apply();
  }

  for (const button of tagButtons) {
    button.addEventListener("click", () => selectTag(button.dataset.tag === activeTag ? "" : button.dataset.tag));
  }

  search?.addEventListener("input", () => {
    query = search.value.trim().toLowerCase();
    apply();
  });

  reset?.addEventListener("click", () => {
    query = "";
    if (search) search.value = "";
    selectTag("");
    search?.focus();
  });

  const initialTag = new URLSearchParams(location.search).get("tag");
  if (initialTag && tagButtons.some((button) => button.dataset.tag === initialTag)) {
    selectTag(initialTag);
  }
})();
