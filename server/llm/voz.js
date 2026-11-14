// Voz a texto, local y sin internet (Whisper vía transformers.js). Los modelos viven en server/models/.
import { fileURLToPath } from 'node:url';

export const VOICE_MODEL = process.env.WHISPER_MODEL ?? 'Xenova/whisper-base';
let asr;

// samples: Float32Array mono a 16 kHz.
export async function transcribe(samples) {
  if (!asr) {
    // Import perezoso: transformers pesa y solo se carga al usar la voz.
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = fileURLToPath(new URL('../models/', import.meta.url));
    // Tras la primera descarga, OFFLINE=1 impide cualquier intento de red.
    env.allowRemoteModels = process.env.OFFLINE !== '1';
    asr = await pipeline('automatic-speech-recognition', VOICE_MODEL);
  }
  const { text } = await asr(samples, { language: 'spanish', task: 'transcribe' });
  return text.trim();
}
