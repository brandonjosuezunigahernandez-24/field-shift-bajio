import { readFileSync } from 'node:fs';

// Acciones de mapa que se piden junto con la respuesta. Lista cerrada.
// Las decide el código leyendo la respuesta, no el modelo: Gemma 4B casi nunca las pedía.
export const ACTION_TYPES = ['zoom_parcela', 'zoom_region', 'resaltar_anios_secos'];

// shortcut: palabras clave simples, subir a algo más fino si se vuelve impreciso.
export function actionsFor(text) {
  const t = text.toLowerCase();
  const out = [];
  if (/\b(parcela|suelo)\b/.test(t)) out.push('zoom_parcela');
  if (/\b(seco|secos|sequ[ií]a)\b/.test(t)) out.push('resaltar_anios_secos');
  return out.map((tipo) => ({ tipo }));
}

// ---------- «Qué hacer»: tarjetas de acción con fuente leída (data/acciones.json) ----------
export const ACCIONES = JSON.parse(readFileSync(new URL('../data/acciones.json', import.meta.url), 'utf8')).acciones;
const strip = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pesos = (n) => n.toLocaleString('en-US');

// Señales de la parcela. datos = summarizeClimate (NASA POWER); "seco" = 1 de cada 5 años o más fue seco, o el último lo fue.
function senales(perfil, datos) {
  const anios = datos?.lluvia_pv_anual?.length ?? 0;
  const secos = datos?.anios_secos?.length ?? 0;
  const ultimoSeco = datos?.lluvia_pv_anual?.at(-1)?.seco === true;
  return { anios, secos, seco: anios > 0 && (secos / anios >= 0.2 || ultimoSeco), despues_maiz: perfil.ultimo_cultivo === 'maiz' };
}

// Apoyo de Producción para el Bienestar 2026 en temporal (Reglas de Operación, DOF). Solo los tramos fijos (hasta 8 ha).
const montoBienestar = (ha) => (ha <= 3 ? 7000 : ha <= 4 ? 8000 : ha <= 8 ? 10000 : null);

function porque(a, s, perfil) {
  if (a.condicion === 'seco' && s.seco) return `En tu parcela ${s.secos} de ${s.anios} años fueron secos de junio a septiembre (NASA POWER). ${a.porque}`;
  if (a.condicion === 'despues_maiz' && s.despues_maiz) return `Lo último que sembraste fue maíz. ${a.porque}`;
  const monto = a.id === 'produccion-bienestar' && perfil.agua === 'temporal' && perfil.hectareas ? montoBienestar(perfil.hectareas) : null;
  if (monto) return `Con tus ${perfil.hectareas} hectáreas de temporal el apoyo de 2026 es de ${pesos(monto)} pesos, según las Reglas de Operación (DOF).`;
  return a.porque;
}

// Máximo 3 acciones para la pregunta. Una acción entra si coincide el tema o una palabra de la pregunta;
// los datos de la parcela (año seco, maíz antes) solo la suben de lugar, no la meten sola.
// perfil: { estado, ultimo_cultivo, agua, hectareas }. Salida: [{ accion, porque, fuente, url }].
export function accionesPara({ tema = null, cultivo = null, perfil = {}, datos = null, pregunta = '' } = {}) {
  const q = strip(pregunta);
  const s = senales(perfil, datos);
  return ACCIONES
    .map((a) => {
      if (a.estados && !a.estados.includes(perfil.estado)) return null;
      if (a.cultivos && cultivo && !a.cultivos.includes(cultivo)) return null;
      if (a.cultivos && !cultivo && ['desglose', 'aptitud', 'frutales'].includes(tema)) return null; // la nuez no lleva el acopio del maíz
      const porTema = Boolean(tema) && a.temas.includes(tema);
      const porPalabra = a.palabras.some((p) => q.includes(p));
      if (!porTema && !porPalabra) return null;
      // Lo que dijo el agricultor pesa más que el tema y que los datos.
      const puntos = (porPalabra ? 3 : 0) + (porTema ? 1 : 0) + (a.condicion && s[a.condicion] ? 2 : 0) + (a.cultivos && cultivo ? 1 : 0);
      return { a, puntos };
    })
    .filter(Boolean)
    .sort((x, y) => y.puntos - x.puntos) // sort estable: en empate queda el orden del JSON
    .slice(0, 3)
    .map(({ a }) => ({ accion: a.accion, porque: porque(a, s, perfil), fuente: a.fuente.nombre, url: a.fuente.url }));
}

// La acción con fecha de siembra (p. ej. frijol del INIFAP), para que el texto de la respuesta no diga "no tengo fechas" cuando sí la hay.
const MES = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/;
export const fechaDeSiembra = (args) => accionesPara({ ...args, tema: 'siembra' }).find((a) => /^Siembra/.test(a.accion) && MES.test(a.accion)) ?? null;
