// Revisa que cada número de la respuesta del modelo exista en la ficha.
const NUM = /\d+(?:[.,]\d+)?/g;
const toNum = (s) => Number(s.replace(',', '.'));

function numbersIn(value, out = new Set()) {
  if (typeof value === 'number') {
    out.add(value);
    out.add(Math.round(value));
    out.add(Math.abs(value)); // el texto escribe "−2.7" y el número suelto es 2.7
    out.add(Math.round(Math.abs(value)));
  } else if (typeof value === 'string') {
    (value.match(NUM) ?? []).forEach((m) => out.add(toNum(m)));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => numbersIn(v, out));
  }
  return out;
}

// shortcut: los números ≤ 3 se aceptan siempre ("3 años", "1 de 3"), subir el rigor si el modelo abusa.
export function verifyNumbers(text, ficha) {
  const allowed = numbersIn(ficha);
  const unknown = (text.match(NUM) ?? []).map(toNum).filter((n) => n > 3 && !allowed.has(n));
  return { ok: unknown.length === 0, desconocidos: unknown };
}
