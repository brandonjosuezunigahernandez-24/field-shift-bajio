// Frutales y perennes de Guanajuato y Querétaro, solo con datos del SIAP (server/data/frutales_resumen.json,
// lo genera scripts/frutales-resumen.js). No inventa tiempos, costos ni requisitos agronómicos.
import { existsSync, readFileSync } from 'node:fs';

const FILE = new URL('../data/frutales_resumen.json', import.meta.url);
let data;
const load = () => (data ??= existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null);
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const ALIAS = { nopal: 'nopalitos', 'nopal tunero': 'tuna', fresas: 'fresa', aguacates: 'aguacate', esparragos: 'esparrago', uvas: 'uva', nueces: 'nuez' };

// Lo que un frutal NO es (se dice siempre, venga o no con datos).
export const NO_ES = [
  'No entra en la rotación de 3 años del recomendador: es perenne (dura varios años en el mismo terreno), no se cambia cada ciclo.',
  'No se puede probar un ciclo y decidir después: la inversión inicial es alta y tarda años en producir.',
];
export const NO_VERIFICADO = 'Tiempo para que dé fruta, costo de establecer, agua y clima que necesita: no verificado (el SIAP no lo trae). Pregunta a INIFAP, a la SADER de tu estado o a un técnico antes de decidir.';

const estadoClave = (e) => (e && Object.keys(load()?.estados ?? {}).find((k) => strip(k) === strip(String(e)))) ?? null;

// Lista de frutales del estado (ordenada por valor de producción 2018-2024), o null si el estado no está o faltan datos.
export function topFrutales(estado, n = 10) {
  const k = estadoClave(estado);
  return k ? load().estados[k].slice(0, n).map((f) => ({ ...f, estado: k })) : null;
}

export function fichaFrutal(nombre) {
  const d = load();
  if (!d || !nombre) return null;
  const q = ALIAS[strip(nombre)] ?? strip(nombre);
  const porEstado = Object.entries(d.estados).flatMap(([estado, l]) => l.filter((f) => strip(f.cultivo) === q).map((f) => ({ estado, ...f })));
  if (!porEstado.length) return null;
  const f = porEstado[0];
  const texto = porEstado.map((x) => {
    const mun = x.municipios_2024.map((m) => `${m.nombre} (${m.pct_sembrada} %)`).join(', ');
    const precio = x.precio_cambio_pct == null ? '' : ` El precio rural pasó de unos $${x.precio_rural_2018_2019} a $${x.precio_rural_2023_2024} por tonelada (${x.precio_cambio_pct > 0 ? '+' : ''}${x.precio_cambio_pct} %, sin quitar inflación).`;
    return `${x.estado}: ${x.sembrada_ha_2024} ha en 2024 (${x.cosechada_ha_2024} ya producen), ${x.rendimiento_2024} t/ha, ${x.riego_pct_2024} % con riego, valor de $${x.valor_millones_2024} millones.${precio} Se concentra en ${mun}.`;
  }).join(' ');
  return { cultivo: f.cultivo, tipo: f.tipo, estados: porEstado, texto, no_es: NO_ES, no_verificado: NO_VERIFICADO, fuente: 'SIAP' };
}
