// Qué quiere el agricultor con su pregunta, para decidir si lo contesta el recomendador (código) o el modelo.
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// "¿Qué me conviene sembrar?", "recomiéndame", "qué rotación me toca"... Lo contesta el recomendador, sin modelo.
// Ojo: "¿Para qué sirve la rotación de cultivos?" NO es esto: es una pregunta para entender, la contesta el modelo con la base de textos.
const ASKS_FOR_RECOMMENDATION = /(que (me )?((puedo|podria|debo|deberia|le) )?(siembro|sembrar|conviene|cultivo|cultivar|planto|plantar|pongo|meto)|recomiend|que rotacion|mi rotacion|rotacion (me|para mi))/;
const CONCEPTUAL = /(para que sirve|que es\b|que son\b|como funciona|que significa)/;

export function wantsRecommendation(question = '') {
  const q = strip(question);
  return ASKS_FOR_RECOMMENDATION.test(q) && !CONCEPTUAL.test(q);
}

// Seguimientos de una recomendación ("¿por qué sorgo?", "¿y el ingreso?"): el modelo recibe el resultado en la ficha.
// En las demás preguntas NO se manda: una ficha más grande y con datos que no vienen al caso hacía fallar al modelo.
const FOLLOW_UP = /(por que|porque|ingreso|ganancia|mejor cultivo|cual cultivo|mi recomendacion|mi rotacion)/;

export function isFollowUp(question = '') {
  return FOLLOW_UP.test(strip(question));
}

// "¿Por qué ese cultivo?", "¿por qué el frijol primero?", "¿por qué sorgo y no maíz?": después de "por qué" solo hay palabras
// de la recomendación. "¿Por qué se encharca mi parcela?" o "¿por qué está cara la urea?" traen su propio tema: no es esto.
const WHY_CROP_WORDS = new Set(
  ('ese este esa esta eso esto el la lo los las y me te cultivo cultivos primero primera primer plan rotacion ano anio en de del al ' +
    'grano recomiendas recomendaste recomienda pusiste pones sugieres sugeriste elegiste escogiste conviene ' +
    'maiz sorgo frijol trigo cebada garbanzo brocoli').split(' ')
);

export function asksWhyThisCrop(question = '') {
  const words = strip(question).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const i = words.findIndex((w, k) => w === 'porque' || (w === 'por' && words[k + 1] === 'que'));
  if (i < 0) return false;
  const rest = words.slice(words[i] === 'porque' ? i + 1 : i + 2);
  // "no" solo en "y no maíz" o al final ("¿por qué el maíz no?"); "¿por qué no me sale el maíz?" es un problema del cultivo.
  return rest.every((w, k) => WHY_CROP_WORDS.has(w) || /^\d+$/.test(w) || (w === 'no' && (rest[k - 1] === 'y' || k === rest.length - 1)));
}
