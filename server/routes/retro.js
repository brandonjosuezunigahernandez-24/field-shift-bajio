import { Router } from 'express';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../lib/errors.js';

// «¿Te sirvió?» de cada respuesta. Una línea por voto en data/retro/retro.jsonl (sin coordenadas, sin perfil, sin nombres).
// La revisa una persona con scripts/revisar-retro.js antes de que algo entre al entrenamiento.
const ARCHIVO = () => process.env.RETRO_FILE ?? fileURLToPath(new URL('../data/retro/retro.jsonl', import.meta.url));

export const MOTIVOS = ['no_era', 'falta', 'largo', 'no_entiendo', 'dato_mal'];
const ORIGENES = ['motor', 'plantilla', 'llm', 'modelo'];
const ESTADOS = ['Guanajuato', 'Querétaro'];

// Correos y teléfonos (8 dígitos o más, con espacios o guiones) se tapan antes de guardar.
export const limpiar = (t) => t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]').replace(/\+?\d(?:[\s().-]*\d){7,}/g, '[teléfono]');

const texto = (v, max, campo, obligatorio = false) => {
  if (v == null || v === '') {
    if (obligatorio) throw new HttpError(400, `Falta ${campo}.`);
    return null;
  }
  if (typeof v !== 'string') throw new HttpError(400, `${campo} debe ser texto.`);
  return limpiar(v.trim().slice(0, max)) || null;
};
const uno = (v, lista, campo) => {
  if (v == null || v === '') return null;
  if (!lista.includes(v)) throw new HttpError(400, `${campo} no es válido.`);
  return v;
};

// Solo se copian los campos conocidos: lo demás que mande la pantalla (lat, lon, perfil...) se tira.
export function validar(b = {}) {
  if (typeof b.util !== 'boolean') throw new HttpError(400, 'Falta util (true o false).');
  const tema = texto(b.tema, 40, 'tema');
  if (tema && !/^[a-z0-9_-]+$/.test(tema)) throw new HttpError(400, 'tema no es válido.');
  return {
    fecha: new Date().toISOString().slice(0, 10), // solo el día: la hora no hace falta
    pregunta: texto(b.pregunta, 300, 'pregunta', true),
    tema,
    origen: uno(b.origen, ORIGENES, 'origen'),
    util: b.util,
    motivo: b.util ? null : uno(b.motivo, MOTIVOS, 'motivo'),
    comentario: b.util ? null : texto(b.comentario, 300, 'comentario'),
    respuesta: texto(b.respuesta, 600, 'respuesta'),
    estado: uno(b.estado, ESTADOS, 'estado'),
    version: texto(b.version, 20, 'version'),
  };
}

export const leerRetro = async (archivo = ARCHIVO()) => {
  const t = await readFile(archivo, 'utf8').catch(() => '');
  return t.split('\n').filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
};

// Conteos por tema y por motivo, sin textos.
export function resumir(filas) {
  const por_tema = {}, por_motivo = {};
  for (const f of filas) {
    const t = (por_tema[f.tema ?? 'sin_tema'] ??= { si: 0, no: 0 });
    t[f.util ? 'si' : 'no']++;
    if (!f.util) por_motivo[f.motivo ?? 'sin_motivo'] = (por_motivo[f.motivo ?? 'sin_motivo'] ?? 0) + 1;
  }
  return { total: filas.length, si: filas.filter((f) => f.util).length, no: filas.filter((f) => !f.util).length, por_tema, por_motivo };
}

const router = Router();

router.post('/', async (req, res) => {
  const fila = validar(req.body);
  const archivo = ARCHIVO();
  await mkdir(dirname(archivo), { recursive: true });
  await appendFile(archivo, JSON.stringify(fila) + '\n');
  res.status(201).json({ ok: true });
});

router.get('/resumen', async (req, res) => res.json(resumir(await leerRetro())));

export default router;
