// GET a JSON document with a hard timeout. Throws on timeout, network error or non-2xx status.
export async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  }
  return res.json();
}
