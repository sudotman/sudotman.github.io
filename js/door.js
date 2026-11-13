/*
 * Under the door: the two things a visitor can leave on the front door for the next one.
 *
 *   note from the previous visitor. Only one exists at a time. It is not shown until it is asked for; reading it
 *   is free, and leaving one replaces it. A note nobody should have to read can be swept
 *   away, which brings back the one before.
 *
 *   One word each. Every visitor may leave one word a day, in any script, and the words
 *   run on as a single sentence.
 *
 * This is the only script on the front door that talks to anything but satyam.lol. The
 * service is scripts/door/, and its address is content/home.json's door.endpoint; with no
 * address there, none of this is on the page. It is sent what the visitor typed and
 * nothing else: no cookies, no identifiers, no credentials.
 *
 * It is written to survive the service being away. The words come first from
 * content/door.json, the snapshot scripts/sync-door.mjs commits, and then from the door
 * itself if it answers. The visitor's own word and the last note they read are kept in
 * localStorage, so their page still shows them, and a word left while the door was not
 * answering is sent the next time it does.
 *
 * Everything a stranger wrote is set with textContent. Nothing here builds markup from it.
 */
(() => {
  "use strict";

  const KEY = "satyam.door";
  const TIMEOUT = 7000;
  const WORD = /^[\p{L}\p{M}][\p{L}\p{M}'’\-]*$/u;

  let endpoint = "";
  let limits = { note: 200, word: 24 };
  let online = false;
  let note = null;
  let noteRead = false;
  let words = [];
  let total = 0;
  let ui = null;

  const local = (() => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  })();

  const remember = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(local));
    } catch {
      /* this visit only, then */
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

  const isLocalHost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith(".localhost");

  // The committed address, or on a development machine one handed over in the query string
  // (?door=http://localhost:8413), which is how the page is tried against a local door.
  function endpointFrom(home) {
    let address = typeof home?.door?.endpoint === "string" ? home.door.endpoint : "";
    if (isLocalHost()) address = new URLSearchParams(location.search).get("door") || address;
    address = address.trim().replace(/\/+$/, "");
    if (/^https:\/\//i.test(address)) return address;
    return isLocalHost() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(address) ? address : "";
  }

  async function ask(path, payload) {
    const response = await fetch(`${endpoint}${path}`, {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT)
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      /* an answer with no body is still an answer */
    }
    return { ok: response.ok, status: response.status, json: json && typeof json === "object" ? json : {} };
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function ago(at) {
    const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
    if (minutes < 2) return "just now";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? "a day ago" : `${days} days ago`;
  }

  const cleanWords = (list) => (Array.isArray(list) ? list : [])
    .map((item) => (typeof item === "string" ? item : item?.word))
    .filter((word) => typeof word === "string" && word.length > 0 && word.length <= 64);

  const validNote = (value) => value && Number.isInteger(value.id) && typeof value.text === "string" && Number.isFinite(value.at)
    ? { id: value.id, text: value.text.slice(0, 400), at: value.at }
    : null;

  /* ---------------------------------------------------------------------- */
  /* What is on the page                                                     */
  /* ---------------------------------------------------------------------- */

  function build(main) {
    const noteBox = el("div", { className: "door-note" });
    const wordsBox = el("div", { className: "door-words" });
    const section = el("section", { className: "hyper-door", id: "door" }, [
      el("h2", { textContent: "Under the door", data: { say: "door" } }),
      el("p", { className: "section-note", textContent: "The satyam-adjacent cinematic universe consciousness. (or some bullshit)" }),
      el("h3", { className: "work-rest__heading", textContent: "note from the previous visitor" }),
      noteBox,
      el("h3", { className: "work-rest__heading" }, ["collective consciousness", el("small", { data: { doorTotal: "" } })]),
      wordsBox
    ]);
    const before = main.querySelector(":scope > hr");
    if (before) before.before(section);
    else main.append(section);
    ui = { section, noteBox, wordsBox, noteStatus: "", wordStatus: "" };
  }

  function renderNote() {
    const { noteBox } = ui;
    const children = [];
    const mine = note && local.mine === note.id;

    if (!online) {
      const last = validNote(local.last);
      if (last) {
        children.push(
          el("blockquote", { dir: "auto", textContent: last.text }),
          el("p", { className: "door-meta", textContent: "that is note from the previous visitor as you last saw it. the door is not answering just now, so it may have changed." })
        );
      } else {
        children.push(el("p", { className: "door-meta", textContent: "the door is not answering just now. note from the previous visitor will be here when it does." }));
      }
    } else if (!note) {
      children.push(el("p", { className: "door-meta", textContent: "nothing under the door. be the first to leave something." }));
    } else if (!noteRead && !mine) {
      children.push(el("p", { className: "door-meta" }, [
        `someone left a note ${ago(note.at)}. `,
        el("button", { type: "button", className: "bracket-button", textContent: "[read it]", data: { doorRead: "" } })
      ]));
    } else {
      children.push(
        el("blockquote", { dir: "auto", textContent: note.text }),
        el("p", { className: "door-meta" }, mine
          ? ["thanks for sliding this note under the door!"]
          : [`left ${ago(note.at)}. `, el("button", { type: "button", className: "bracket-button", textContent: "[sweep it away]", title: "for a note nobody should have to read. the one before it comes back.", data: { doorSweep: String(note.id) } })])
      );
    }

    if (online && (!note || noteRead || mine)) {
      const input = el("input", { type: "text", name: "note", maxLength: limits.note, autocomplete: "off", placeholder: note ? "leave one for whoever comes next" : "leave a note", attrs: { "aria-label": "Your note", enterkeyhint: "send" } });
      children.push(el("form", { className: "door-form", data: { doorForm: "note" } }, [
        input,
        el("button", { type: "submit", className: "bracket-button", textContent: "[slide it under]" })
      ]));
    }

    children.push(el("p", { className: "door-status", textContent: ui.noteStatus, attrs: { role: "status" } }));
    noteBox.replaceChildren(...children);
  }

  function renderWords() {
    const { wordsBox, section } = ui;
    const mine = local.word?.day === today() ? local.word.text : "";
    const waiting = typeof local.pending === "string" ? local.pending : "";
    const run = el("p", { className: "door-run" });

    if (total > words.length) run.append("… ");
    words.forEach((word) => run.append(el("bdi", { textContent: word }), " "));
    // A word that has not reached the door yet is still the visitor's, on their own page.
    if (waiting) run.append(el("bdi", { className: "door-run__mine", textContent: waiting }), " ");
    if (!words.length && !waiting) run.append("no words yet. ");

    if (!mine && !waiting) {
      run.append(el("form", { className: "door-form", data: { doorForm: "word" } }, [
        el("input", { type: "text", name: "word", maxLength: limits.word, autocomplete: "off", autocapitalize: "off", spellcheck: false, placeholder: "your word", attrs: { "aria-label": "Your word for today", enterkeyhint: "send" } }),
        el("button", { type: "submit", className: "bracket-button", textContent: "[leave it]" })
      ]));
    }

    let status = ui.wordStatus;
    if (!status && waiting) status = `"${waiting}" is waiting on this page. it goes to the door the next time it answers.`;
    else if (!status && mine) status = `"${mine}" is yours for today. come back tomorrow for another.`;

    section.querySelector("[data-door-total]").textContent = total ? `(${total})` : "";
    wordsBox.replaceChildren(run, el("p", { className: "door-status", textContent: status, attrs: { role: "status" } }));
  }

  /* ---------------------------------------------------------------------- */
  /* Talking to the door                                                     */
  /* ---------------------------------------------------------------------- */

  function take(state) {
    online = true;
    note = validNote(state.note);
    words = cleanWords(state.words);
    total = Number.isInteger(state.total) ? state.total : words.length;
    if (Number.isInteger(state.limits?.note) && Number.isInteger(state.limits?.word)) limits = state.limits;
  }

  async function sendWord(word, { quiet = false } = {}) {
    try {
      const answer = await ask("/word", { word });
      if (answer.ok && typeof answer.json.word?.word === "string") {
        words.push(answer.json.word.word);
        total = Number.isInteger(answer.json.total) ? answer.json.total : total + 1;
        local.word = { text: answer.json.word.word, day: today() };
        delete local.pending;
        ui.wordStatus = "";
      } else {
        // The door answered and said no. Nothing is left waiting.
        delete local.pending;
        if (answer.status === 429) local.word = { text: local.word?.text || word, day: today() };
        ui.wordStatus = quiet ? "" : String(answer.json.error || "the door would not take that.").slice(0, 160);
      }
    } catch {
      local.pending = word;
      ui.wordStatus = "";
    }
    remember();
    renderWords();
  }

  async function leaveNote(text) {
    ui.noteStatus = "sliding it under…";
    renderNote();
    try {
      const answer = await ask("/note", { text });
      const left = answer.ok && validNote(answer.json.note);
      if (left) {
        note = left;
        noteRead = true;
        local.mine = left.id;
        local.last = left;
        remember();
        ui.noteStatus = "";
      } else {
        ui.noteStatus = String(answer.json.error || "the door would not take that.").slice(0, 160);
      }
    } catch {
      ui.noteStatus = "the door is stuck. your note was not left; try again in a while.";
    }
    renderNote();
    if (ui.noteStatus) {
      const input = ui.noteBox.querySelector("input");
      if (input) input.value = text;
    }
  }

  let sweepArmed = 0;

  async function sweep(button) {
    if (Date.now() - sweepArmed > 5000) {
      sweepArmed = Date.now();
      button.textContent = "[sure? it is gone for everyone]";
      setTimeout(() => {
        if (button.isConnected) button.textContent = "[sweep it away]";
      }, 5000);
      return;
    }
    sweepArmed = 0;
    try {
      const answer = await ask("/note/sweep", { id: Number(button.dataset.doorSweep) });
      if (answer.ok || answer.status === 409) {
        note = validNote(answer.json.note);
        noteRead = false;
        if (!answer.ok) ui.noteStatus = "someone got there first.";
        else ui.noteStatus = note ? "swept. this is what was under it." : "swept. there was nothing under it.";
        if (note) noteRead = true;
        local.last = note || undefined;
        remember();
      } else {
        ui.noteStatus = String(answer.json.error || "the door would not do that.").slice(0, 160);
      }
    } catch {
      ui.noteStatus = "the door is stuck. try again in a while.";
    }
    renderNote();
  }

  document.addEventListener("click", (event) => {
    if (!ui) return;
    const read = event.target.closest?.("[data-door-read]");
    const sweeper = event.target.closest?.("[data-door-sweep]");
    if (read) {
      noteRead = true;
      local.last = note;
      remember();
      ui.noteStatus = "";
      renderNote();
      ui.noteBox.querySelector("input")?.focus({ preventScroll: true });
    } else if (sweeper) {
      sweep(sweeper);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest?.("[data-door-form]");
    if (!form || !ui) return;
    event.preventDefault();
    const input = form.querySelector("input");
    const value = input.value.normalize("NFC").replaceAll(/\s+/g, " ").trim();
    if (!value) return;

    if (form.dataset.doorForm === "note") {
      leaveNote(value);
      return;
    }
    if ([...value].length > limits.word || !WORD.test(value)) {
      ui.wordStatus = "one word, letters only.";
      renderWords();
      ui.wordsBox.querySelector("input")?.focus({ preventScroll: true });
      return;
    }
    ui.wordStatus = "";
    sendWord(value);
  });

  document.addEventListener("landing:ready", async (event) => {
    const main = document.getElementById("landing-main");
    endpoint = endpointFrom(event.detail.home);
    if (!main || !endpoint || main.querySelector(".hyper-door")) return;
    build(main);
    renderNote();
    renderWords();

    // The committed snapshot first: it is on this site, so it is there even when the door is not.
    try {
      const response = await fetch("/content/door.json", { cache: "no-cache" });
      const snapshot = response.ok ? await response.json() : null;
      if (snapshot && !online) {
        words = cleanWords(snapshot.words).slice(-80);
        total = Number.isInteger(snapshot.total) ? snapshot.total : words.length;
        renderWords();
      }
    } catch {
      /* no snapshot yet */
    }

    try {
      const answer = await ask("/door");
      if (!answer.ok) throw new Error(`the door returned ${answer.status}`);
      take(answer.json);
    } catch (error) {
      console.warn("The door did not answer", error);
    }
    renderNote();
    renderWords();
    if (online && typeof local.pending === "string") sendWord(local.pending, { quiet: true });
  });
})();
