(() => {
  "use strict";

  let toastTimer;

  const copyText = async (value) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fall through to the legacy copy path for browsers that deny clipboard access.
    }

    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    input.remove();
    return copied;
  };

  const showToast = (message, target) => {
    let toast = document.querySelector("[data-copy-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "copy-toast";
      toast.dataset.copyToast = "";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
      document.body.append(toast);
    }

    toast.textContent = message;
    toast.hidden = false;
    const targetBounds = target.getBoundingClientRect();
    const toastBounds = toast.getBoundingClientRect();
    const edgeGap = 8;
    const gap = 10;
    const centeredLeft = targetBounds.left + (targetBounds.width / 2);
    const left = Math.min(
      Math.max(centeredLeft, (toastBounds.width / 2) + edgeGap),
      window.innerWidth - (toastBounds.width / 2) - edgeGap
    );
    const showAbove = targetBounds.top >= toastBounds.height + gap + edgeGap;
    const top = showAbove
      ? targetBounds.top - gap
      : Math.min(targetBounds.bottom + gap, window.innerHeight - toastBounds.height - edgeGap);
    toast.style.left = `${left}px`;
    toast.style.top = `${Math.max(edgeGap, top)}px`;
    toast.dataset.copyToastPosition = showAbove ? "above" : "below";
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.hidden = true;
    }, 2200);
  };

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-copy-email]")
      : null;
    if (!target) return;

    event.preventDefault();
    const email = target.dataset.copyEmail?.trim();
    if (!email) return;

    const copied = await copyText(email);
    showToast(copied ? "copied to clipboard" : "couldn't copy to clipboard", target);
  });
})();
