// Último paso del texto para el agricultor: unidades en palabras la primera vez, números redondeados y sin palabras técnicas.
// Va DESPUÉS del verificador de números (los números ya se revisaron contra los datos; aquí solo se presentan más fácil).
const PALABRAS = [
  [/precio medio rural/g, 'precio que pagan en el campo'], [/superficie siniestrada/g, 'superficie perdida'], [/siniestrad[ao]/g, 'perdida'],
  [/\bla mediana\b/g, 'lo normal'], [/\bmediana\b/g, 'lo normal'], [/\bumbral\b/g, 'límite'], [/\bPV\b/g, 'temporada de lluvias'],
  [/ingreso bruto/g, 'ingreso sin restar gastos'], [/Primavera-Verano/g, 'temporada de lluvias'], [/Otoño-Invierno/g, 'otoño-invierno'],
];

export function claro(texto) {
  if (typeof texto !== 'string' || !texto) return texto;
  let t = texto;
  // 528.9 -> unos 530 (salvo dinero); 1.65 -> 1.6. Los años y los enteros no se tocan.
  t = t.replace(/(\$)?\b(\d{3,4})\.\d+\b/g, (m, peso, n) => (peso ? m : `unos ${Math.round(Number(m) / 10) * 10}`));
  t = t.replace(/\b(\d{1,2})\.(\d{2,})\b(?! ?(ha\b|hect))/g, (m) => (Number(m) < 1 ? m : String(Number(Number(m).toFixed(1))))); // las hectáreas del agricultor y lo menor a 1 van exactos
  t = t.replace(/\$(\d{4,})\b(?!\.\d)( pesos)?/g, (m, n) => `$${Number(n).toLocaleString('en-US')}`); // $16463 pesos -> $16,463
  t = t.replace(/\bunos unos\b/g, 'unos').replace(/\b(unos|cerca de|como) unos\b/g, 'unos');
  // Unidades en palabras la primera vez.
  t = t.replace(/(\d) ?t\/ha\b/, '$1 toneladas por hectárea');
  t = /mm de lluvia/.test(t) ? t.replace(/(\d) ?mm de lluvia/, '$1 milímetros de lluvia') : t.replace(/(\d) ?mm\b/, '$1 milímetros de lluvia');
  const igual = (m, nuevo) => (m[0] === m[0].toUpperCase() ? nuevo[0].toUpperCase() + nuevo.slice(1) : nuevo); // respeta la mayúscula
  for (const [re, nuevo] of PALABRAS) t = t.replace(new RegExp(re.source, 'gi'), (m) => igual(m, nuevo));
  return t;
}
