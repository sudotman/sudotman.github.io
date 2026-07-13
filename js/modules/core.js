(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  const state = {
    manifest: null,
    profile: null,
    works: [],
    worksById: new Map(),
    mediumById: new Map(),
    activeFilter: "all"
  };

  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const escapeHTML = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const stripHTML = (value = "") => {
    const holder = document.createElement("div");
    holder.innerHTML = String(value);
    return (holder.textContent || "").replace(/\s+/g, " ").trim();
  };

  const safeHex = (value, fallback = "#c74a32") => (
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  );

  const safeLink = (value = "") => {
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.href : "#";
    } catch {
      return "#";
    }
  };

  const externalAttrs = (href = "") => /^https?:/i.test(href)
    ? ' target="_blank" rel="noopener noreferrer"'
    : "";

  const observeReveals = (root = document) => {
    const items = [...root.querySelectorAll(".reveal:not([data-reveal-bound])")];
    items.forEach(item => item.dataset.revealBound = "true");

    if (!items.length) return;
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach(item => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries, instance) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        instance.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

    items.forEach(item => observer.observe(item));
  };

  const initScrollProgress = () => {
    let ticking = false;
    const update = () => {
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / available));
      document.documentElement.style.setProperty("--progress", progress.toFixed(4));
      document.querySelector(".topbar")?.classList.toggle("is-scrolled", window.scrollY > 24);
      ticking = false;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
  };

  const initSectionTracking = () => {
    const sections = [...document.querySelectorAll("main section[id]")];
    const links = [...document.querySelectorAll("[data-section-link]")];
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;

      document.body.dataset.pageTheme = visible.target.dataset.theme || "night";
      links.forEach(link => {
        const active = link.dataset.sectionLink === visible.target.id
          || (visible.target.id === "catalogue" && link.dataset.sectionLink === "work")
          || (visible.target.id === "satellites" && link.dataset.sectionLink === "human-index");
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-32% 0px -48%", threshold: [0, 0.1, 0.25] });

    sections.forEach(section => observer.observe(section));
  };

  class InstrumentEngraving {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: true });
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.pointer = { x: 0.58, y: 0.44, targetX: 0.58, targetY: 0.44 };
      this.lastFrame = 0;
      this.frameInterval = 1000 / (window.matchMedia("(pointer: coarse)").matches || navigator.connection?.saveData ? 18 : 27);
      this.raf = 0;
      this.active = true;
      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement);
      } else {
        window.addEventListener("resize", () => this.resize(), { passive: true });
      }
      this.onPointer = this.onPointer.bind(this);
      this.tick = this.tick.bind(this);
      canvas.parentElement.addEventListener("pointermove", this.onPointer, { passive: true });
      this.resize();
      this.draw(0);
      this.start();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.draw(performance.now());
    }

    onPointer(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.targetX = (event.clientX - rect.left) / Math.max(1, rect.width);
      this.pointer.targetY = (event.clientY - rect.top) / Math.max(1, rect.height);
    }

    tick(time) {
      this.raf = 0;
      if (!this.active || document.hidden || reduceMotion.matches) return;
      if (time - this.lastFrame < this.frameInterval) {
        this.start();
        return;
      }
      this.lastFrame = time;
      this.pointer.x += (this.pointer.targetX - this.pointer.x) * 0.035;
      this.pointer.y += (this.pointer.targetY - this.pointer.y) * 0.035;
      this.draw(time);
      this.start();
    }

    start() {
      if (!this.raf && this.active && !document.hidden && !reduceMotion.matches) {
        this.raf = requestAnimationFrame(this.tick);
      }
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    draw(time) {
      const { ctx, width, height, pointer } = this;
      ctx.clearRect(0, 0, width, height);

      const drift = reduceMotion.matches ? 0 : time * 0.00008;
      const centerX = width * (0.48 + (pointer.x - 0.5) * 0.045);
      const centerY = height * (0.43 + (pointer.y - 0.5) * 0.035);

      ctx.save();
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = "rgba(176, 140, 76, 0.23)";
      for (let line = 0; line < 15; line += 1) {
        const yBase = height * (0.1 + line * 0.058);
        ctx.beginPath();
        for (let x = -20; x <= width + 20; x += 14) {
          const distance = Math.hypot(x - centerX, yBase - centerY);
          const wave = Math.sin(x * 0.008 + line * 0.58 + drift * (line + 5)) * (8 + line * 0.65);
          const field = Math.cos(distance * 0.012 - drift * 5) * 6;
          const y = yBase + wave + field;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(232, 222, 202, 0.13)";
      for (let ring = 0; ring < 5; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, width * (0.09 + ring * 0.075), height * (0.07 + ring * 0.052), -0.18, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(199, 74, 50, 0.72)";
      const nodes = 12;
      for (let node = 0; node < nodes; node += 1) {
        const phase = node * 2.399 + drift * (node % 3 + 1);
        const radiusX = width * (0.12 + (node % 5) * 0.052);
        const radiusY = height * (0.08 + (node % 4) * 0.043);
        const x = centerX + Math.cos(phase) * radiusX;
        const y = centerY + Math.sin(phase) * radiusY;
        ctx.beginPath();
        ctx.arc(x, y, node % 4 === 0 ? 1.8 : 1.05, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  const initHeroInstrument = () => {
    const canvas = document.querySelector("#instrument-canvas");
    if (!canvas || !canvas.getContext) return;
    const instrument = new InstrumentEngraving(canvas);
    if ("IntersectionObserver" in window) {
      const visibilityObserver = new IntersectionObserver(([entry]) => {
        instrument.active = entry.isIntersecting;
        if (instrument.active) instrument.start();
        else instrument.stop();
      }, { threshold: 0.01 });
      visibilityObserver.observe(canvas.parentElement);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) instrument.stop();
      else instrument.start();
    });
    reduceMotion.addEventListener?.("change", event => {
      if (event.matches) {
        instrument.stop();
        instrument.draw(performance.now());
      } else {
        instrument.start();
      }
    });
  };

  window.ImpossibleRooms = {
    state,
    ready,
    resolveReady,
    rejectReady,
    reduceMotion,
    finePointer,
    escapeHTML,
    stripHTML,
    safeHex,
    safeLink,
    externalAttrs,
    observeReveals
  };

  document.documentElement.classList.add("js");
  document.addEventListener("DOMContentLoaded", () => {
    initScrollProgress();
    initSectionTracking();
    initHeroInstrument();
    observeReveals();
  });
})();
