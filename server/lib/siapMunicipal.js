import fs from 'node:fs';
import path from 'node:path';

export const SIAP_RAW_DIR_DEFAULT =
  'C:/Users/fglar/OneDrive/Documentos/GitHub/field-shift-bajio/server/data/siap_raw';

const ESTADOS = { 11: 'Guanajuato', 22: 'Querétaro' };

// Lee los CSV municipales del SIAP (latin1, sin comillas) -> filas con numeros.
export function readSiapRows(dir = process.env.SIAP_RAW_DIR || SIAP_RAW_DIR_DEFAULT, years = [2018, 2019, 2020, 2021, 2022, 2023, 2024]) {
  const rows = [];
  for (const y of years) {
    const lines = fs.readFileSync(path.join(dir, `${y}.csv`), 'latin1').split(/\r?\n/);
    const head = lines[0].split(',').map((h) => (h === 'Nomcultivo Sin Um' ? 'Nomcultivo' : h === 'Precio' ? 'Preciomediorural' : h)); // 2018-2020 usan otro nombre
    for (const l of lines.slice(1)) {
      if (!l) continue;
      const c = l.split(',');
      if (c.length !== head.length) continue; // shortcut: ignora filas con comas internas
      const o = Object.fromEntries(head.map((h, i) => [h, c[i]]));
      for (const k of ['Sembrada', 'Cosechada', 'Siniestrada', 'Volumenproduccion', 'Rendimiento']) o[k] = Number(o[k]);
      o.Anio = Number(o.Anio);
      o.Nomestado = ESTADOS[o.Idestado] ?? o.Nomestado; // 2018-2020 traen la tilde danada
      rows.push(o);
    }
  }
  return rows;
}

export const isTemporalPV = (r) => r.Nomcicloproductivo === 'Primavera-Verano' && r.Nommodalidad === 'Temporal';
