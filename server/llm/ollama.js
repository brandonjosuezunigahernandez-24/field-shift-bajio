// Habla con Ollama (local, sin internet). Devuelve { respuesta, datos_usados, fuentes } o lanza error.
const URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b';

const SYSTEM = `Eres el asistente de una app para agricultores de temporal del Bajío.
Respondes en español sencillo, máximo 3 oraciones, como si hablaras con un agricultor.
REGLAS:
1. Usa SOLO la FICHA. No uses conocimiento propio.
2. Si la respuesta no está en la FICHA, responde exactamente: "No tengo ese dato para tu parcela."
3. No cambies ningún número. Cópialo tal como está en la FICHA.
4. Después de cada dato pon su fuente entre corchetes: [NASA POWER], [SoilGrids] u [Open-Meteo] (el pronóstico de los próximos días viene de Open-Meteo).
5. No recomiendes químicos, dosis ni marcas.
6. Para máximos, mínimos y totales del pronóstico usa "resumen"; no los busques tú en "dias".`;

const SCHEMA = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    datos_usados: { type: 'array', items: { type: 'string' } },
    fuentes: { type: 'array', items: { type: 'string' } },
  },
  required: ['respuesta', 'datos_usados', 'fuentes'],
};

export async function askModel(ficha, pregunta, model = MODEL, timeoutMs = 60000) {
  const res = await fetch(`${URL}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      format: SCHEMA,
      // num_ctx chico y num_predict corto: menos RAM y respuestas rápidas en laptops débiles.
      options: { temperature: 0.1, num_ctx: 2048, num_predict: 200 },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nFICHA:\n${JSON.stringify(ficha)}` },
        { role: 'user', content: pregunta },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  return JSON.parse((await res.json()).message.content);
}
