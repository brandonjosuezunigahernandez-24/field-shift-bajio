async function fetchOk(url, { timeoutMs = 15000, accept }) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  }
  return res;
}

// GET a JSON document with a hard timeout. Throws on timeout, network error or non-2xx status.
export async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const res = await fetchOk(url, { timeoutMs, accept: 'application/json' });
  return res.json();
}

// GET a binary file (e.g. a PNG tile) as a Buffer, same rules as fetchJson.
export async function fetchBuffer(url, { timeoutMs = 15000 } = {}) {
  const res = await fetchOk(url, { timeoutMs, accept: '*/*' });
  return Buffer.from(await res.arrayBuffer());
}
