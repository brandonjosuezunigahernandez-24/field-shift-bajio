// Browser-side rule engine of the "Probar cultivo" screen, ported from the design's js/cultivo.js.
// Pure functions: the plot context (`ctx`) comes from lib/parcelaClima.js and the crop list from
// data/datosDemo.js (22 crops with FAO Ecocrop style ranges, illustrative and not verified).
//
// ctx = { lluvia_anual, lluvia_ciclo, temp_ciclo, ph, arcilla, carbono, ventana_dias,
//         secos_idx: number[], total_anios, umbral_mm, desde }

export const FACT = [
  { id: 'agua', nombre: 'Agua', icono: 'bi-cloud-rain', peso: 0.26 },
  { id: 'temp', nombre: 'Temperatura', icono: 'bi-thermometer-half', peso: 0.16 },
  { id: 'ph', nombre: 'pH del suelo', icono: 'bi-droplet', peso: 0.12 },
  { id: 'textura', nombre: 'Textura', icono: 'bi-layers', peso: 0.1 },
  { id: 'sequia', nombre: 'Años secos', icono: 'bi-sun', peso: 0.2 },
  { id: 'ciclo', nombre: 'Ciclo', icono: 'bi-calendar3', peso: 0.16 },
];
export const TOL_TXT = { alta: 'alta', media: 'media', baja: 'baja' };
export const VER = {
  si: { titulo: 'Sí funciona', icono: 'bi-check2-circle', chip: 'Sí funciona' },
  con: { titulo: 'Funciona con cuidados', icono: 'bi-exclamation-circle', chip: 'Con cuidados' },
  no: { titulo: 'No conviene', icono: 'bi-x-circle', chip: 'No conviene' },
};
export const EST = { dentro: 'Dentro', limite: 'Al límite', fuera: 'Fuera' };

/* ---------- Crop search (accent and typo tolerant) ---------- */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lev(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1));
    }
  }
  return m[b.length][a.length];
}

const keysOf = (c) => [norm(c.nombre)].concat((c.alias || []).map(norm));

export function buscar(texto, cultivos) {
  const q = norm(texto);
  if (!q) return null;
  for (const c of cultivos) if (keysOf(c).includes(q)) return c; // exact
  for (const c of cultivos) {
    // contained ("frijol negro", "quiero sembrar fresa")
    for (const k of keysOf(c)) {
      if (k.length >= 3 && (q.includes(k) || (q.length >= 4 && k.indexOf(q) === 0))) return c;
    }
  }
  let best = null;
  let dist = 99; // typos
  cultivos.forEach((c) => {
    keysOf(c).forEach((k) => {
      const d = lev(q, k);
      if (d < dist) {
        dist = d;
        best = c;
      }
    });
  });
  return dist <= 2 ? best : null;
}

export function parecidos(texto, cultivos) {
  const q = norm(texto);
  return cultivos
    .map((c) => ({ c, d: Math.min(...keysOf(c).map((k) => lev(q, k))) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.c);
}

/* ---------- Rule engine ---------- */
function rango(v, a, b, tolBajo, tolAlto) {
  if (v >= a && v <= b) return { s: 100, lado: 0 };
  if (v < a) return { s: Math.max(0, 100 - ((a - v) / tolBajo) * 100), lado: -1 };
  return { s: Math.max(0, 100 - ((v - b) / tolAlto) * 100), lado: 1 };
}
const estado = (s) => (s >= 90 ? 'dentro' : s >= 55 ? 'limite' : 'fuera');

export function evaluar(c, ctx, conAgua) {
  const riego = conAgua === 'riego';
  const perenne = !c.ciclo;
  const f = {};

  // Water
  const lluvia = perenne ? ctx.lluvia_anual : ctx.lluvia_ciclo;
  let ra = rango(lluvia, c.lluvia[0], c.lluvia[1], c.lluvia[0] * 0.4, c.lluvia[1] * 0.6);
  if (riego && ra.lado < 0) ra = { s: 90, lado: -1, riego: true };
  f.agua = { s: ra.s, lado: ra.lado, riego: !!ra.riego, v: lluvia, a: c.lluvia[0], b: c.lluvia[1], lo: c.lluvia[0] * 0.6, hi: c.lluvia[1] * 1.6, unidad: 'mm', perenne };

  // Temperature
  const rt = rango(ctx.temp_ciclo, c.temp[0], c.temp[1], 6, 6);
  f.temp = { s: rt.s, lado: rt.lado, v: ctx.temp_ciclo, a: c.temp[0], b: c.temp[1], lo: c.temp[0] - 6, hi: c.temp[1] + 6, unidad: '°C', dec: 1 };

  // pH
  const rp = rango(ctx.ph, c.ph[0], c.ph[1], 1, 1);
  f.ph = { s: rp.s, lado: rp.lado, v: ctx.ph, a: c.ph[0], b: c.ph[1], lo: c.ph[0] - 1, hi: c.ph[1] + 1, unidad: '', dec: 1 };

  // Texture (clay)
  const rx = rango(ctx.arcilla, c.arcilla[0], c.arcilla[1], 15, 15);
  f.textura = { s: rx.s, lado: rx.lado, v: ctx.arcilla, a: c.arcilla[0], b: c.arcilla[1], lo: c.arcilla[0] - 15, hi: c.arcilla[1] + 15, unidad: '%' };

  // Dry years
  const frac = ctx.secos_idx.length / ctx.total_anios;
  const castigo = { alta: 40, media: 120, baja: 220 }[c.sequia] || 120;
  f.sequia = { s: riego ? 95 : Math.max(0, 100 - frac * castigo), n: ctx.secos_idx.length, tol: c.sequia, riego };

  // Cycle
  if (perenne) {
    const sp = riego ? 90 : { alta: 85, media: 45, baja: 20 }[c.sequia];
    f.ciclo = { s: sp, perenne: true, ventana: ctx.ventana_dias, riego };
  } else {
    const ventana = riego ? 200 : ctx.ventana_dias;
    const sc = c.ciclo <= ventana ? 100 : Math.max(0, 100 - ((c.ciclo - ventana) / 60) * 100);
    f.ciclo = { s: sc, dias: c.ciclo, ventana, riego };
  }

  FACT.forEach((x) => {
    f[x.id].s = Math.round(f[x.id].s);
    f[x.id].estado = estado(f[x.id].s);
  });

  let total = FACT.reduce((t, x) => t + f[x.id].s * x.peso, 0);
  const peor = Math.min(...FACT.map((x) => f[x.id].s));
  if (peor < 25) total = Math.min(total, 45);
  else if (peor < 50) total = Math.min(total, 72);
  total = Math.round(total);

  return { cultivo: c, f, total, veredicto: total >= 75 ? 'si' : total >= 50 ? 'con' : 'no' };
}

/* ---------- "Why" and "what to do" texts ---------- */
export const fmt = (v, dec) => (dec ? Number(v).toFixed(dec) : String(Math.round(v)));
const nombreCorto = (c) => c.nombre.split(' ')[0].toLowerCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function porQue(id, x, c, ctx) {
  let n = c.propio ? 'tu cultivo' : 'el ' + nombreCorto(c);
  if (!c.propio && /^(papa|fresa|cebolla|cebada|avena|alfalfa|calabaza|soya)/.test(nombreCorto(c))) n = 'la ' + nombreCorto(c);
  const N = ctx.total_anios;
  const U = Math.round(ctx.umbral_mm);
  switch (id) {
    case 'agua': {
      const per = x.perenne ? 'al año' : 'de junio a septiembre';
      if (x.riego) return `Llueven ${x.v} mm ${per} y ${n} pide al menos ${x.a} mm. Con riego cubres los ${x.a - x.v} mm que faltan, pero cuenta el costo del agua.`;
      if (x.lado === 0) return `Llueven ${x.v} mm ${per} y ${n} pide entre ${x.a} y ${x.b} mm: la lluvia le alcanza.`;
      if (x.lado < 0 && x.s >= 90) return `Llueven ${x.v} mm ${per} y ${n} pide ${x.a} mm: queda justo, apenas ${x.a - x.v} mm abajo.`;
      if (x.lado < 0) return `Llueven ${x.v} mm ${per} y ${n} necesita al menos ${x.a} mm: le faltarían unos ${x.a - x.v} mm.`;
      return `Llueven ${x.v} mm ${per} y ${n} tolera hasta ${x.b} mm: el exceso puede encharcar y traer hongos.`;
    }
    case 'temp': {
      const base = `La temperatura media del ciclo es ${fmt(x.v, 1)} °C; ${n} rinde mejor entre ${x.a} y ${x.b} °C`;
      return base + (x.lado === 0 ? '.' : x.lado < 0 ? ': le hace falta calor y crece lento.' : ': el calor estresa la floración.');
    }
    case 'ph': {
      const b2 = `Tu suelo tiene pH ${fmt(x.v, 1)} (0–30 cm) y ${n} prefiere de ${fmt(x.a, 1)} a ${fmt(x.b, 1)}`;
      return b2 + (x.lado === 0 ? '.' : x.lado > 0 ? ': el suelo es demasiado alcalino y le cuesta tomar hierro y fósforo.' : ': el suelo es demasiado ácido para él.');
    }
    case 'textura': {
      const b3 = `Tu suelo tiene ${x.v}% de arcilla y ${n} va bien con ${x.a}–${x.b}%`;
      return b3 + (x.lado === 0 ? '.' : x.lado > 0 ? ': la tierra es pesada, guarda mucha agua y puede asfixiar la raíz.' : ': la tierra es suelta y se seca rápido.');
    }
    case 'sequia':
      if (x.riego) return `En ${x.n} de ${N} años llovió menos de ${U} mm, pero con riego esos años pesan mucho menos.`;
      return (
        `En ${x.n} de ${N} años llovió menos de ${U} mm. ${cap(n)} tiene tolerancia ${TOL_TXT[x.tol]} a la sequía` +
        (x.tol === 'alta' ? ': aguanta bien esos años.' : x.tol === 'media' ? ': en esos años el rendimiento baja.' : ': en esos años podrías perder la cosecha.')
      );
    case 'ciclo':
      if (x.perenne) return 'Es perenne: tiene que aguantar la sequía de noviembre a mayo' + (x.riego ? ', y con riego lo logra.' : x.s >= 80 ? ', y lo hace bien.' : ' y sin riego sufre mucho.');
      if (x.riego) return `Necesita ${x.dias} días; con riego puedes adelantar la siembra y no dependes de la ventana de temporal.`;
      return `Necesita ${x.dias} días y el temporal te da unos ${x.ventana} días útiles (jun–oct)` + (x.dias <= x.ventana ? ': alcanzas a cosechar antes de que se corte la lluvia.' : ': la lluvia se corta antes de que termine.');
    default:
      return '';
  }
}

export function acciones(r) {
  const f = r.f;
  const out = [];
  if (f.agua.s < 90 && f.agua.lado < 0 && !f.agua.riego) out.push(['bi-droplet-half', 'Asegura riego de auxilio', 'O busca una variedad de menor consumo de agua.']);
  if (f.agua.riego) out.push(['bi-droplet-half', 'Calcula el costo del riego', `Necesitarás unos ${f.agua.a - f.agua.v} mm extra por ciclo.`]);
  if (f.agua.s < 90 && f.agua.lado > 0) out.push(['bi-water', 'Siembra en surcos altos', 'Deja drenes para que el agua no se estanque.']);
  if (f.temp.s < 90) out.push(['bi-thermometer-half', f.temp.lado < 0 ? 'Siembra un poco más tarde' : 'Siembra temprano', f.temp.lado < 0 ? 'O elige una variedad adaptada a frío.' : 'Así la floración no cae en los días más calientes.']);
  if (f.ph.s < 90) out.push(['bi-eyedropper', f.ph.lado > 0 ? 'Baja el pH poco a poco' : 'Sube el pH con cal agrícola', f.ph.lado > 0 ? 'Incorpora materia orgánica y azufre agrícola.' : 'Aplícala según tu análisis de suelo.']);
  if (f.textura.s < 90) out.push(['bi-layers', f.textura.lado > 0 ? 'Afloja la tierra' : 'Ayuda a que retenga humedad', f.textura.lado > 0 ? 'Composta, labranza mínima y surcos altos.' : 'Agrega materia orgánica y acolchado.']);
  if (f.sequia.s < 85) out.push(['bi-shield-check', 'Protégete en años secos', 'Contrata seguro agrícola y siembra cuando la humedad pase del 40%.']);
  if (f.ciclo.s < 90) out.push(['bi-calendar3', f.ciclo.perenne ? 'Plántalo solo con riego' : 'Busca una variedad precoz', f.ciclo.perenne ? 'Sin agua de noviembre a mayo no se establece.' : 'O siembra con la primera lluvia fuerte de junio.']);
  if (!out.length) {
    out.push(['bi-calendar-check', 'Siembra del 15 de junio al 10 de julio', 'Es cuando la humedad en la raíz pasa del 40%.']);
    out.push(['bi-arrow-repeat', 'Rótalo con una leguminosa', 'Frijol o garbanzo le devuelven nitrógeno al suelo.']);
  }
  return out.slice(0, 4);
}

const lista = (a) => (a.length <= 1 ? a[0] || '' : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]);

export function resumen(r, lugar) {
  const c = r.cultivo;
  const flojos = FACT.filter((x) => r.f[x.id].estado !== 'dentro').map((x) => x.nombre.toLowerCase());
  if (r.veredicto === 'si') return `${c.nombre} encuentra en ${lugar} la lluvia, el clima y el suelo que necesita` + (flojos.length ? `; solo vigila ${lista(flojos)}.` : '.');
  if (r.veredicto === 'con') return `Se puede sembrar en ${lugar}, pero ${lista(flojos)}${flojos.length > 1 ? ' te ponen' : ' te pone'} en riesgo. Revisa qué hacer abajo.`;
  const peor = FACT.slice().sort((a, b) => r.f[a.id].s - r.f[b.id].s)[0];
  const otros = flojos.filter((x) => x !== peor.nombre.toLowerCase());
  return `En ${lugar} ${peor.nombre.toLowerCase()} queda fuera de lo que necesita` + (flojos.length > 1 ? `, y también fallan ${lista(otros)}` : '') + '.';
}

/* ---------- Attached crop sheet: .json, .csv/.txt ---------- */
const MAPA_CAMPOS = {
  nombre: 'nombre', cultivo: 'nombre', lluvia_min: 'l0', lluvia_max: 'l1', temp_min: 't0', temp_max: 't1',
  ph_min: 'p0', ph_max: 'p1', arcilla_min: 'a0', arcilla_max: 'a1', ciclo_dias: 'ciclo', tolerancia_sequia: 'sequia', tipo: 'tipo',
};

export function fichaACultivo(obj, nombreArchivo, cultivos) {
  const o = {};
  Object.keys(obj).forEach((k) => {
    const m = MAPA_CAMPOS[norm(k).replace(/ /g, '_')];
    if (m) o[m] = obj[k];
  });
  const base = buscar(o.nombre || '', cultivos) || buscar(nombreArchivo, cultivos);
  const tieneRangos = ['l0', 'l1', 't0', 't1', 'p0', 'p1'].some((k) => o[k] !== undefined && o[k] !== '');
  if (!base && !tieneRangos) return null;
  if (base && !tieneRangos) return base;
  const b = base || { nombre: o.nombre || 'Cultivo de tu ficha', tipo: 'Ficha propia', lluvia: [400, 700], temp: [18, 28], ph: [6, 7.5], arcilla: [10, 40], ciclo: 110, sequia: 'media', alias: [] };
  const num = (v, d) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? d : n;
  };
  return {
    id: 'propio-' + norm(o.nombre || b.nombre).replace(/\W+/g, '-'),
    propio: true,
    alias: [],
    nombre: o.nombre || b.nombre,
    tipo: o.tipo || b.tipo,
    lluvia: [num(o.l0, b.lluvia[0]), num(o.l1, b.lluvia[1])],
    temp: [num(o.t0, b.temp[0]), num(o.t1, b.temp[1])],
    ph: [num(o.p0, b.ph[0]), num(o.p1, b.ph[1])],
    arcilla: [num(o.a0, b.arcilla[0]), num(o.a1, b.arcilla[1])],
    ciclo: num(o.ciclo, b.ciclo),
    sequia: ['alta', 'media', 'baja'].includes(norm(o.sequia)) ? norm(o.sequia) : b.sequia,
  };
}

export function leerTextoPlano(txt) {
  const lineas = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let obj = {};
  const pares = lineas.filter((l) => /[,;:=\t]/.test(l));
  if (pares.length >= 2) {
    // key,value per line …
    pares.forEach((l) => {
      const p = l.split(/[,;:=\t]/);
      if (p.length >= 2) obj[p[0].trim()] = p.slice(1).join(',').trim();
    });
    // … or headers on line 1 and values on line 2
    if (!Object.keys(obj).some((k) => MAPA_CAMPOS[norm(k).replace(/ /g, '_')])) obj = {};
    if (!Object.keys(obj).length && lineas.length >= 2) {
      const h = lineas[0].split(/[,;\t]/);
      const v = lineas[1].split(/[,;\t]/);
      h.forEach((k, i) => {
        obj[k.trim()] = (v[i] || '').trim();
      });
    }
  }
  if (!Object.keys(obj).length) obj.nombre = lineas[0] || '';
  return obj;
}

export const PLANTILLA_FICHA = {
  nombre: 'Garbanzo blanco Sinaloa', tipo: 'Leguminosa', lluvia_min: 250, lluvia_max: 450, temp_min: 15, temp_max: 25,
  ph_min: 6.0, ph_max: 8.0, arcilla_min: 15, arcilla_max: 40, ciclo_dias: 100, tolerancia_sequia: 'alta',
};
