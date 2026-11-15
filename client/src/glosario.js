// Palabras técnicas que salen en las respuestas y gráficas, con una explicación de 1 frase.
// `re`: cómo se reconoce en el texto (sin distinguir mayúsculas). `fuente`: de dónde sale la definición.
// Lo que dice «en esta app» viene del código del proyecto (server/engine y server/llm), no de fuera.
export const GLOSARIO = [
  { id: 'tha', re: 't/ha|t por hectárea|toneladas por hectárea', def: 't/ha: toneladas por hectárea, cuántas toneladas (de 1,000 kg) salen de cada hectárea. Una hectárea es un cuadro de 100 por 100 metros, un poco más grande que una cancha de futbol.', fuente: 'Sistema Internacional de Unidades (1 ha = 10,000 m²); cancha FIFA de 105 × 68 m = 7,140 m²' },
  { id: 't', re: '(?<=\\d\\s?)t(?![\\p{L}/])', def: 't: toneladas. 1 tonelada son 1,000 kilos.', fuente: 'Sistema Internacional de Unidades' },
  { id: 'ha', re: '(?<=\\d\\s?)ha(?![\\p{L}])|hectáreas?', def: 'Hectárea (ha): un cuadro de 100 por 100 metros (10,000 m²), un poco más grande que una cancha de futbol.', fuente: 'Sistema Internacional de Unidades' },
  { id: 'mm', re: '(?<=\\d\\s?)mm(?![\\p{L}])|milímetros de lluvia', def: 'mm de lluvia: 1 milímetro es 1 litro de agua en cada metro cuadrado de tierra.', fuente: 'Definición de la medida de lluvia (1 mm = 1 L/m²), Organización Meteorológica Mundial' },
  { id: 'ph', re: 'pH', def: 'pH: mide qué tan ácida (menos de 7) o alcalina (más de 7) es la tierra; 7 es neutro. Cada cultivo crece mejor en cierto rango.', fuente: 'FAO, Portal de Suelos' },
  { id: 'arcilla', re: 'arcillas?|arcillosa', def: 'Arcilla: la parte más fina de la tierra (granos de menos de 0.002 mm). Mucha arcilla hace tierra pegajosa que guarda agua pero se encharca.', fuente: 'USDA, clases de textura del suelo' },
  { id: 'carbono', re: 'carbono orgánico|materia orgánica', def: 'Carbono orgánico: lo que queda de plantas y animales descompuestos en la tierra. Más carbono suele ser tierra más fértil y que guarda más agua.', fuente: 'FAO, Carbono orgánico del suelo (2017)' },
  { id: 'siniestro', re: 'siniestrad[ao]s?|superficie dañada|dañad[ao]', def: 'Superficie dañada (siniestrada): parte de lo sembrado que se perdió y no se cosechó, por sequía, helada, granizo, plagas u otras causas.', fuente: 'SIAP, glosario del Cierre de la producción agrícola' },
  { id: 'temporal', re: 'temporal', def: 'Temporal: cuando la siembra depende solo de la lluvia, sin riego. También se le dice así a la temporada de lluvias.', fuente: 'SIAP (modalidad «temporal» contra «riego»)' },
  { id: 'pv', re: 'PV|primavera-verano', def: 'PV (primavera-verano): el ciclo que se siembra con las lluvias; en el Bajío llueve de junio a septiembre.', fuente: 'SIAP (ciclos agrícolas); meses de lluvia de NASA POWER en esta app' },
  { id: 'oi', re: 'OI|otoño-invierno', def: 'OI (otoño-invierno): el ciclo de los meses fríos y secos; en el Bajío solo se puede sembrar con riego.', fuente: 'SIAP (ciclos agrícolas)' },
  { id: 'siap', re: 'SIAP', def: 'SIAP: Servicio de Información Agroalimentaria y Pesquera, de la Secretaría de Agricultura. Publica cuánto se sembró, cosechó y perdió en cada estado y municipio.', fuente: 'gob.mx/siap' },
  { id: 'nasa', re: 'NASA POWER', def: 'NASA POWER: datos de clima de la NASA hechos con satélites y modelos, para cualquier punto del mundo. Aquí usamos los de tu parcela desde el año 2000.', fuente: 'power.larc.nasa.gov' },
  { id: 'ecocrop', re: 'FAO EcoCrop|EcoCrop', def: 'FAO EcoCrop: lista de la FAO (de la ONU) con el clima y el suelo que aguanta cada cultivo.', fuente: 'gaez.fao.org/pages/ecocrop' },
  { id: 'puntaje', re: 'puntajes?', def: 'Puntaje: calificación de 0 a 100 que da esta app a cada cultivo según tu clima, tu lluvia, tu suelo y lo que elegiste. Más alto es mejor.', fuente: 'Esta app (server/engine)' },
  { id: 'rendimiento', re: 'rendimientos?|rindió|rinde', def: 'Rendimiento: cuánto se cosecha por cada hectárea sembrada.', fuente: 'SIAP (rendimiento = producción entre superficie cosechada)' },
  { id: 'mediana', re: 'mediana', def: 'Mediana: el valor de en medio; la mitad de los años quedó arriba y la otra mitad abajo.', fuente: 'Definición de estadística' },
  { id: 'umbral', re: 'umbral', def: 'Umbral: el límite para separar; por ejemplo, con menos lluvia que esa, el año cuenta como seco.', fuente: 'Esta app' },
  { id: 'seco', re: 'años? secos?', def: 'Año seco (en esta app): de junio a septiembre llovió en tu parcela menos del 80 % de lo normal (la mediana de esos años).', fuente: 'Esta app, con lluvia de NASA POWER' },
  { id: 'leguminosa', re: 'leguminosas?', def: 'Leguminosa: plantas como frijol, garbanzo, haba o alfalfa; en la raíz toman nitrógeno del aire y dejan la tierra mejor para el siguiente cultivo.', fuente: 'FAO, Leguminosas (Año Internacional de las Legumbres, 2016)' },
  { id: 'rotacion', re: 'rotación|rotar', def: 'Rotación: cambiar de cultivo cada temporada o cada año en la misma tierra, para cuidar el suelo y cortar plagas.', fuente: 'FAO, Agricultura de conservación' },
  { id: 'bruto', re: 'ingreso bruto', def: 'Ingreso bruto: lo que te pagarían por la cosecha, sin restar lo que gastaste (semilla, fertilizante, renta, mano de obra).', fuente: 'Definición contable' },
  { id: 'precio', re: 'precio medio rural', def: 'Precio medio rural: lo que le pagaron al productor por tonelada en su zona, según el SIAP.', fuente: 'SIAP, Cierre de la producción agrícola' },
];

// Una sola expresión con todos los términos. Los bordes evitan marcar pedazos de palabras («ha» dentro de «hace»).
const TODOS = new RegExp(`(?<![\\p{L}\\d])(${GLOSARIO.map((g) => `(${g.re})`).join('|')})(?![\\p{L}])`, 'giu');

// Parte un texto en pedazos: strings sueltos y { termino, texto } para cada palabra del glosario.
// `vistos` (Set de ids) hace que cada palabra se marque solo la primera vez en la tarjeta.
export function partirGlosario(texto, vistos = new Set()) {
  const out = [];
  let ultimo = 0;
  for (const m of String(texto ?? '').matchAll(TODOS)) {
    const i = m.slice(2).findIndex((x) => x !== undefined);
    const g = GLOSARIO[i];
    if (!g || vistos.has(g.id)) continue;
    vistos.add(g.id);
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
    out.push({ termino: g, texto: m[0] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < String(texto ?? '').length) out.push(String(texto).slice(ultimo));
  return out;
}

// Unidad del servidor dicha en palabras (ejes de las gráficas y la cifra grande).
const UNIDADES = { 't/ha': 'toneladas por hectárea', t: 'toneladas', mm: 'milímetros de lluvia', ha: 'hectáreas', '%': 'por ciento', '°C': 'grados centígrados', $: 'pesos', 'MJ/m² al día': 'energía del sol (megajoules por metro cuadrado al día)' };
export const unidadEnPalabras = (u) => UNIDADES[u] ?? u ?? '';

// Texto para «Escuchar»: las abreviaturas se leen en palabras.
export function paraOir(t) {
  return String(t ?? '')
    .replace(/(\d{4})\s*[-–]\s*(\d{4})/g, '$1 a $2')
    .replace(/\$\s?(\d[\d,]*)/g, '$1 pesos')
    .replace(/t\/ha\b/g, 'toneladas por hectárea')
    .replace(/(\d)\s*t(?![\p{L}/])/gu, '$1 toneladas')
    .replace(/(\d)\s*mm(?![\p{L}])/gu, '$1 milímetros')
    .replace(/(\d)\s*ha(?![\p{L}])/gu, '$1 hectáreas')
    .replace(/\s*°C/g, ' grados')
    .replace(/(\d)\s*%/g, '$1 por ciento')
    .replace(/\bpH\b/g, 'pe hache')
    .replace(/\bPV\b/g, 'primavera-verano')
    .replace(/\bOI\b/g, 'otoño-invierno');
}

// «Para ti»: la primera frase (después del titular) que usa sus hectáreas, su parcela o su suelo.
// «no de tu parcela» es una advertencia, no un dato para él. Si el titular ya es para él, no se repite.
const PARA_TI = /\b(con|en) tus\b|\btus \d|\btu (parcela|suelo|terreno)\b/i;
const paraTi = (f) => PARA_TI.test(f) && !/\bno (son |es )?(de|en) tu\b/i.test(f);
export const fraseParaTi = (lista) => (lista[0] && paraTi(lista[0]) ? -1 : lista.findIndex((f, i) => i > 0 && paraTi(f)));

// La cifra grande solo para preguntas de cantidad («¿cuánto…?», «¿a cómo…?», «¿cuáles fueron…?»).
const DE_CANTIDAD = /cu[aá]nt|a c[oó]mo|qu[eé] tanto|cu[aá]les fueron/i;
// Número + unidad. No cuenta el que va justo después de «tus» (es el dato que dio el agricultor, no la respuesta).
const CIFRA = /(?<!\btus?\s)(?<![\d.,$])(\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?)\s*(t\/ha|toneladas por hectárea|toneladas|t(?![\p{L}/])|mm(?![\p{L}])|milímetros|ha(?![\p{L}])|hectáreas|%|°C|pesos|años secos|años)?(?:\s*((?:la|por) (?:tonelada|hectárea)))?/gu;
export function cifraPrincipal(pregunta, lista) {
  if (!DE_CANTIDAD.test(pregunta ?? '')) return null;
  // «¿A cómo…?» pide el precio (va en el titular), no el total de sus hectáreas.
  const k = /a c[oó]mo|precio|pagan/i.test(pregunta) ? -1 : fraseParaTi(lista);
  const orden = k > 0 ? [k, ...lista.keys()].filter((x, i, a) => a.indexOf(x) === i) : [...lista.keys()];
  for (const i of orden) {
    for (const m of lista[i].matchAll(CIFRA)) {
      if (/^\d{4}$/.test(m[1]) && !m[2]) continue; // un año suelto no es la cifra
      const pesos = m[1].startsWith('$');
      if (!m[2] && !pesos) continue; // sin unidad no se sabe qué es
      return { valor: m[1].replace(/^\$\s?/, ''), unidad: (pesos ? 'pesos' : unidadEnPalabras(m[2])) + (m[3] ? ` ${m[3]}` : ''), frase: i };
    }
  }
  return null;
}

// Años que nombra la respuesta (sin los rangos «2000-2024» o «de 2018 a 2024»), para resaltarlos en las gráficas.
export const aniosNombrados = (t) => [...new Set(String(t ?? '').replace(/\d{4}\s*(?:[-–]|a)\s*\d{4}/g, '').match(/\b(19|20)\d{2}\b/g) ?? [])];
