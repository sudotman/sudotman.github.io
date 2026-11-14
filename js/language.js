/*
 * The name is the language switch. Clicking it moves the front door's fixed words (the name,
 * the chip under it, the section headings) from english to hindi to urdu and back. The body
 * of the page stays as it was written.
 *
 * What each language says lives in content/home.json under `languages`; english is the page
 * as js/landing.js rendered it, so there is nothing to translate back to. A language that
 * has no word for something leaves the english in place. The choice is kept in localStorage,
 * as the theme is.
 *
 * The welcome down the left edge follows by greeting in the languages the page is not in, so
 * in english it reads exactly as it always has, and it is the second way to switch.
 *
 * The reel ends by landing on the name, and says it in whichever language the page is in
 * (sayAsPage in js/intro.js), so the page keeps its language while the reel plays.
 */
(() => {
  "use strict";

  const KEY = "satyam.language";
  const RTL = new Set(["ur", "ar", "fa", "he", "ps", "sd"]);
  const root = document.documentElement;

  let main = null;
  let order = ["en"];
  let strings = {};
  let chosen = "en";
  let nameButton = null;
  let welcome = null;
  // What each element said in english, kept as text because that is all it ever was.
  const originals = new WeakMap();

  const read = () => {
    try {
      return localStorage.getItem(KEY) || "en";
    } catch {
      return "en";
    }
  };

  const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : "");

  const shown = () => (order.includes(chosen) ? chosen : "en");

  // The name breaks into its two words by its own measure in english. The other scripts
  // are given their lines, since the measure was set for latin letters.
  function sayName(target, value, language) {
    if (language === "en") {
      target.textContent = value;
      return;
    }
    // The space between them only shows where the stylesheet sets the words on one line.
    target.replaceChildren(...value.split(/\s+/).flatMap((word, index) => {
      const line = document.createElement("span");
      line.className = "name-line";
      line.textContent = word;
      return index ? [" ", line] : [line];
    }));
  }

  // Lettering that overhangs its own box (nastaliq does, a long way) can be left behind
  // on screen when it is replaced. Asking for the page to be painted afresh, once, on the
  // frame after a change, clears anything that was.
  function repaint() {
    main.style.opacity = "0.999";
    requestAnimationFrame(() => requestAnimationFrame(() => main.style.removeProperty("opacity")));
  }

  function apply() {
    if (!main) return;
    const language = shown();
    root.dataset.language = language;

    main.querySelectorAll("[data-say]").forEach((node) => {
      const target = node.querySelector(".name-switch") || node;
      if (!originals.has(node)) originals.set(node, target.textContent);
      const said = language === "en" ? "" : text(strings[language]?.[node.dataset.say]);
      const value = said || originals.get(node);
      if (node.dataset.say === "name") sayName(target, value, said ? language : "en");
      else target.textContent = value;
      // Direction belongs to the whole line, so the dash in the chip turns with its words.
      const block = node.closest("h1, h2, p") || node;
      block.lang = said ? language : "en";
      block.dir = said && RTL.has(language) ? "rtl" : "ltr";
    });

    if (welcome) {
      welcome.replaceChildren(...order.filter((code) => code !== language && text(strings[code]?.welcome)).map((code) => {
        const greeting = document.createElement("span");
        greeting.lang = code;
        greeting.textContent = `${strings[code].welcome} `;
        return greeting;
      }));
    }

    if (nameButton) nameButton.title = order.map((code) => text(strings[code]?.label) || code).join(" · ");
    repaint();
    document.dispatchEvent(new CustomEvent("landing:said", { detail: { language } }));
  }

  function next() {
    chosen = order[(order.indexOf(shown()) + 1) % order.length];
    try {
      localStorage.setItem(KEY, chosen);
    } catch {}
    apply();
    // Only a switch the visitor made: apply() also runs on load and from other tabs.
    document.dispatchEvent(new CustomEvent("language:switched", { detail: { language: chosen, index: order.indexOf(chosen) } }));
  }

  document.addEventListener("landing:ready", (event) => {
    const languages = event.detail.home?.languages;
    main = document.getElementById("landing-main");
    if (!main || !languages || typeof languages !== "object") return;

    // English is always first. Another language counts once it can at least say the name.
    strings = languages;
    order = ["en", ...Object.keys(languages).filter((code) => code !== "en" && text(languages[code]?.name))];
    if (order.length < 2) return;
    chosen = read();

    const heading = main.querySelector('.hyper-intro h1[data-say="name"]');
    if (heading && !heading.querySelector(".name-switch")) {
      nameButton = document.createElement("button");
      nameButton.type = "button";
      nameButton.className = "name-switch";
      nameButton.dataset.languageNext = "";
      nameButton.append(...heading.childNodes);
      heading.append(nameButton);
    }

    welcome = document.createElement("button");
    welcome.type = "button";
    welcome.className = "welcome-line";
    welcome.dataset.languageNext = "";
    welcome.setAttribute("aria-label", "Switch the page's language");
    main.append(welcome);

    root.dataset.languages = String(order.length);
    apply();
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-language-next]")) next();
  });

  addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    chosen = read();
    apply();
  });
})();
