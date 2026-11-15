// Helpers shared by every screen: saved selection (localStorage), toast and reduced motion.
// Ported from the design's js/comun.js. Keys are kept so a saved selection survives the migration.
const SELECTION_KEY = 'fs.parcela';
const HISTORY_KEY = 'fs.pruebas';

export function readSelection() {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSelection(changes) {
  try {
    const current = readSelection() || {};
    localStorage.setItem(SELECTION_KEY, JSON.stringify({ ...current, ...changes }));
  } catch {
    /* storage not available */
  }
}

export function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveHistory(name) {
  const history = [name, ...readHistory().filter((x) => x !== name)].slice(0, 5);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage not available */
  }
  return history;
}

// Short on-screen notice (same markup and class as the design: .fs-toast).
export function toast(msg) {
  let el = document.getElementById('fs-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fs-toast';
    el.className = 'fs-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

export function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function copyText(text, onOk, onFail) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onOk, fallback);
  } else {
    fallback();
  }
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      onOk();
    } catch {
      onFail();
    }
    ta.remove();
  }
}
