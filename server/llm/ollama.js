// Habla con Ollama (local, sin internet). Devuelve { respuesta, datos_usados, fuentes } o lanza error.
const URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b';

const SYSTEM = `Eres el asistente de una app para agricultores de temporal del Bajío.
Respondes en español sencillo, máximo 3 oraciones (5 si explicas un texto de conocimiento), como si hablaras con un agricultor.
REGLAS:
1. Usa SOLO la FICHA. No uses conocimiento propio.
2. Si la respuesta no está en la FICHA, responde exactamente: "No tengo ese dato para tu parcela."
3. No cambies ningún número. Cópialo tal como está en la FICHA.
4. Después de cada dato pon su fuente entre corchetes: [NASA POWER], [SoilGrids] u [Open-Meteo] (el pronóstico de los próximos días viene de Open-Meteo). Si usas un texto de "conocimiento", cita la fuente que trae ese texto: [Base local], [Wikipedia] o [SIAP].
5. No recomiendes químicos, dosis ni marcas.
6. Para máximos, mínimos y totales del pronóstico usa "resumen"; no los busques tú en "dias".
7. Si preguntan por un cultivo y "conocimiento" no lo explica, responde "No tengo ese dato para tu parcela." No uses el pH, la arcilla ni la lluvia de la parcela para hablar de un cultivo, salvo que el texto de "conocimiento" diga qué necesita.
8. Si usas "conocimiento", explica con tus palabras en hasta 5 oraciones cortas y sencillas.
9. Contesta solo lo que preguntaron. No agregues pronóstico, suelo ni lluvia si no te lo pidieron.
10. Si hay "siap", son datos oficiales por estado, no de la parcela: di el estado y cita [SIAP]. Para preguntas de riesgo usa "perdida_promedio_pct" y "anios_con_perdida_mayor_10_pct".
11. Si hay "recomendacion", explícala con sus números y cita [SIAP]; no cambies los cultivos ni la rotación.`;

const SCHEMA = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    datos_usados: { type: 'array', items: { type: 'string' } },
    fuentes: { type: 'array', items: { type: 'string' } },
  },
  required: ['respuesta', 'datos_usados', 'fuentes'],
};

export async function askModel(ficha, pregunta, { historial = [], model = MODEL, timeoutMs = 60000 } = {}) {
  const res = await fetch(`${URL}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      format: SCHEMA,
      // num_ctx chico y num_predict corto: menos RAM y respuestas rápidas en laptops débiles.
      options: { temperature: 0.1, num_ctx: Number(process.env.OLLAMA_CTX) || 3072, num_predict: 300 },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nFICHA:\n${JSON.stringify(ficha)}` },
        // Memoria corta: las últimas vueltas de la conversación (la ficha ya trae los datos de la parcela).
        ...historial.flatMap((t) => [{ role: 'user', content: t.pregunta }, { role: 'assistant', content: JSON.stringify({ respuesta: t.respuesta, datos_usados: [], fuentes: [] }) }]),
        { role: 'user', content: pregunta },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  return JSON.parse((await res.json()).message.content);
}
