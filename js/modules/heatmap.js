(() => {
  "use strict";

  const Site = window.ImpossibleRooms;
  if (!Site) return;

  const initRegistrationCursor = () => {
    const cursor = document.querySelector(".cursor-register");
    if (!cursor || !Site.finePointer.matches || Site.reduceMotion.matches) return;

    let frame = 0;
    let x = -100;
    let y = -100;

    const paint = () => {
      document.documentElement.style.setProperty("--cursor-x", `${x}px`);
      document.documentElement.style.setProperty("--cursor-y", `${y}px`);
      frame = 0;
    };

    document.addEventListener("pointermove", event => {
      x = event.clientX;
      y = event.clientY;
      cursor.classList.remove("is-hidden");
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });

    document.addEventListener("pointerover", event => {
      cursor.classList.toggle("is-over-action", Boolean(event.target.closest("a, button, [role='button'], input, textarea, select")));
    }, { passive: true });

    document.addEventListener("pointerleave", () => cursor.classList.add("is-hidden"), { passive: true });
    window.addEventListener("blur", () => cursor.classList.add("is-hidden"));
  };

  const initLensParallax = () => {
    const hero = document.querySelector(".hero");
    const lens = document.querySelector(".hero-lens");
    if (!hero || !lens || Site.reduceMotion.matches || !Site.finePointer.matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      lens.style.setProperty("--lens-x", x.toFixed(2));
      lens.style.setProperty("--lens-y", y.toFixed(2));
      frame = 0;
    };

    hero.addEventListener("pointermove", event => {
      const rect = hero.getBoundingClientRect();
      x = ((event.clientX - rect.left) / rect.width - 0.5) * 16;
      y = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });

    hero.addEventListener("pointerleave", () => {
      x = 0;
      y = 0;
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });
  };

  const initPlateCoordinates = () => {
    document.addEventListener("pointermove", event => {
      const plate = event.target.closest(".work-plate__visual");
      if (!plate) return;
      const rect = plate.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * 99);
      const y = Math.round(((event.clientY - rect.top) / rect.height) * 99);
      const label = plate.querySelector(".work-plate__measure span");
      if (!label || label.dataset.baseLabel === undefined) label && (label.dataset.baseLabel = label.textContent);
      if (label) label.textContent = `${label.dataset.baseLabel} / X${String(x).padStart(2, "0")} Y${String(y).padStart(2, "0")}`;
    }, { passive: true });

    document.addEventListener("pointerout", event => {
      const plate = event.target.closest(".work-plate__visual");
      if (!plate || plate.contains(event.relatedTarget)) return;
      const label = plate.querySelector(".work-plate__measure span");
      if (label?.dataset.baseLabel) label.textContent = label.dataset.baseLabel;
    }, { passive: true });
  };

  document.addEventListener("DOMContentLoaded", () => {
    initRegistrationCursor();
    initLensParallax();
    initPlateCoordinates();
    Site.ready.then(() => document.body.classList.add("is-ready")).catch(() => {});
  });
})();
