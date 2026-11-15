// Habla con Ollama (local, sin internet). Devuelve { respuesta, fuentes } o lanza error.
import { mensajes } from './prompt.js';

const URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b';

// Texto libre (sin JSON forzado): sale más corto y rápido; las fuentes se leen de los corchetes.
const citas = (t) => [...new Set([...t.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/)))];
const OPTIONS = {
  temperature: 0,
  num_ctx: Number(process.env.OLLAMA_CTX) || 2048, // la ficha recortada cabe de sobra
  num_predict: 180, // ~4 frases; antes 300 y a veces se ciclaba hasta cortarse
};
// Que el modelo se quede en memoria entre preguntas (la primera carga tarda segundos).
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? '30m';

function chat(ficha, pregunta, { historial = [], model = MODEL, timeoutMs = 60000, stream = false, options = {} } = {}) {
  return fetch(`${URL}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, stream, keep_alive: KEEP_ALIVE, options: { ...OPTIONS, ...options }, messages: mensajes(ficha, pregunta, historial) }),
  });
}

// Carga el modelo y deja procesado el prompt fijo (sistema + ejemplos) al arrancar el servidor. Nunca lanza.
export async function precalentar() {
  try {
    const res = await chat({}, 'hola', { options: { num_predict: 1 }, timeoutMs: 120000 });
    await res.json();
    return true;
  } catch { return false; }
}

export async function askModel(ficha, pregunta, opts = {}) {
  const res = await chat(ficha, pregunta, opts);
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const respuesta = (await res.json()).message.content.trim();
  return { respuesta, fuentes: citas(respuesta) };
}

// Texto de "respuesta" que ya se escribió en el JSON parcial que va soltando el modelo.
export function partialRespuesta(content) {
  const m = content.match(/"respuesta"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return '';
  const raw = m[1].replace(/\\$/, '');
  try { return JSON.parse(`"${raw}"`); } catch { return raw; }
}

// Igual que askModel, pero avisa con onDelta(texto nuevo) mientras el modelo escribe (Ollama stream:true).
export async function askModelStream(ficha, pregunta, { onDelta = () => {}, ...opts } = {}) {
  const res = await chat(ficha, pregunta, { ...opts, stream: true });
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const dec = new TextDecoder();
  let buf = '', content = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const delta = JSON.parse(line).message?.content ?? '';
      content += delta;
      if (delta) onDelta(delta);
    }
  }
  return { respuesta: content.trim(), fuentes: citas(content) };
}
