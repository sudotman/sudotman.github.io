// The theme, for the front door, the 404 and the writing pages. Loaded in the
// head without defer, so the choice is on <html> before anything paints.
//
// Light unless [dark] was pressed: the choice is the reader's, kept in this
// browser, and the system setting is not consulted. css/theme.css holds both
// palettes and keys the dark one off data-theme.
(() => {
  "use strict";

  const KEY = "satyam.theme";
  const CHROME = { light: "#ffffff", dark: "#002b36" };
  const root = document.documentElement;

  const read = () => {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  };

  const apply = (theme) => {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CHROME[theme]);
  };

  apply(read());

  // Any element carrying data-theme-toggle switches it, wherever it is rendered.
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-theme-toggle]")) return;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  });

  // Keep an open tab, and a page brought back from the history cache, in step.
  addEventListener("storage", (event) => {
    if (event.key === KEY) apply(read());
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) apply(read());
  });
})();
