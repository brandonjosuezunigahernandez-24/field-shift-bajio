// Qué quiere el agricultor con su pregunta, para decidir si lo contesta el recomendador (código) o el modelo.
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Muletillas de voz al inicio ("oiga joven, este... ps ¿qué siembro?"): se quitan antes de detectar nada.
// "este" solo si no es "este año / este ciclo": va seguido de puntos, coma u otra palabra de pregunta.
const MULETILLA = /^[\s¿¡,.…-]*(oiga|oye|[oó]igame|mire|f[ií]jese|disculpe|perd[oó]n|una pregunta|ps|pues|bueno|a ver|haber|joven|se[nñ]or|se[nñ]o|jefe|amigo|licenciado|ingeniero|este(?=\s*[.,…]|\s+(qu[eé]|cu[aá]nt[oa]s?|cu[aá]ndo|c[oó]mo|d[oó]nde|cu[aá]l|me|le|y|hay|se|si|mi|oiga|ps|pues|a ver)\b))(?![a-zñáéíóú])[\s,.…:]*/i;
export function quitarMuletillas(pregunta = '') {
  let q = pregunta, antes;
  do { antes = q; q = q.replace(MULETILLA, ''); } while (q !== antes);
  return q.trim() || pregunta; // si todo era muletilla ("oiga"), se deja igual
}

// Preguntas para entender ("¿para qué sirve la rotación?", "¿qué es el temporal?"): las contesta el modelo con la base de textos.
const CONCEPTUAL = /(para que sirven?|\bque (es|son) (el|la|los|las|un|una)\b|que es\b(?! (lo|mejor|bueno|buena|mas|conveniente))|que son\b|como funciona|que significa|por que es (bueno|importante|malo))/;
// Más estricta (para no mandar al modelo «¿de qué es mi tierra?»): definiciones y para qué sirve algo.
const DEFINICION = /(para que sirven?|\bque (es|son|significa) (el|la|los|las|un|una)\b|como funciona|que significa|por que es (bueno|importante|malo))/;
export const esConcepto = (question = '') => DEFINICION.test(strip(question));

// "¿Qué me conviene sembrar?", "¿qué puedo sembrar?", "¿qué sería bueno plantar?", "recomiéndame"... Lo contesta el recomendador, sin modelo.
// "Me recomiendas una película" o "¿me recomiendas el frijol?" NO: el artículo con otra cosa que un cultivo genérico lo saca.
const VERBO = '(siembro|sembrar|siembra|conviene|cultivo|cultivar|planto|plantar|pongo|poner|meto|meter)'; // sin "echo": «¿qué le echo al gusano?» es de plaguicidas
const ASKS_FOR_RECOMMENDATION = new RegExp(`(que (me |le )?((puedo|podria|debo|deberia|le|me|seria|es|sera|me (aconseja|aconsejas|sugiere|sugieres|recomienda|recomiendas)) )?((bueno|buena idea|mejor|lo mas conveniente|conveniente|recomendable) )?${VERBO}\\b|recomiend\\w*\\b(?! (una?|el|la|los|las) (?!cultivo|semilla|planta|siembra|rotacion|variedad|leguminosa)\\w)|aconsej\\w* (que )?(sembrar|plantar|siembro|planto)|que rotacion|mi rotacion|rotacion (me|para mi))`);

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
    'otro otra otros salio sale ' + // "¿y por qué ese y no otro?", "¿por qué salió primero?"
    'maiz sorgo frijol trigo cebada garbanzo brocoli').split(' ')
);

const CROPS = /^(maiz|sorgo|frijol|trigo|cebada|garbanzo|brocoli)$/; // "¿por qué no maíz?"

export function asksWhyThisCrop(question = '') {
  const words = strip(question).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const i = words.findIndex((w, k) => w === 'porque' || (w === 'por' && words[k + 1] === 'que'));
  if (i < 0) return false;
  const rest = words.slice(words[i] === 'porque' ? i + 1 : i + 2);
  // "no" solo en "y no maíz" o al final ("¿por qué el maíz no?"); "¿por qué no me sale el maíz?" es un problema del cultivo.
  return rest.every((w, k) => WHY_CROP_WORDS.has(w) || /^\d+$/.test(w) || (w === 'no' && (rest[k - 1] === 'y' || k === rest.length - 1 || CROPS.test(rest[k + 1]))));
}
