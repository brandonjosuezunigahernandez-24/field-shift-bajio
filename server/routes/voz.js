import express, { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { transcribe } from '../llm/voz.js';

const router = Router();
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 30;

// POST /api/voz  Content-Type: application/octet-stream
// Cuerpo: audio mono a 16 kHz como Float32 little-endian (el front lo remuestrea). -> { texto }
router.post('/', express.raw({ type: 'application/octet-stream', limit: '4mb' }), async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length < 4 || body.length % 4 !== 0) {
    throw new HttpError(400, 'No llegó el audio. Intenta hablar de nuevo.');
  }
  if (body.length / 4 > SAMPLE_RATE * MAX_SECONDS) {
    throw new HttpError(400, `El audio es muy largo (máximo ${MAX_SECONDS} segundos).`);
  }
  // Copia para que el Float32Array quede alineado.
  const samples = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
  res.json({ texto: await transcribe(samples) });
});

export default router;
