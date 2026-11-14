// Qué quiere el agricultor con su pregunta, para decidir si lo contesta el recomendador (código) o el modelo.
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// "¿Qué me conviene sembrar?", "recomiéndame", "qué rotación me toca"... Lo contesta el recomendador, sin modelo.
// Ojo: "¿Para qué sirve la rotación de cultivos?" NO es esto: es una pregunta para entender, la contesta el modelo con la base de textos.
const ASKS_FOR_RECOMMENDATION = /(que (me )?(siembro|sembrar|conviene|cultivo|cultivar|planto|plantar)|recomiend|que rotacion|mi rotacion|rotacion (me|para mi))/;
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
