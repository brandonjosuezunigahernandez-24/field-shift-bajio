// Guía de lo que se le puede preguntar al asistente: solo temas que de verdad sabe contestar con los datos que tiene.
// El front la muestra como botones; así el agricultor no se sale de lo que el asistente conoce y las respuestas no se alargan.
export const TEMAS = [
  {
    id: 'parcela', titulo: 'Mi parcela', icono: 'bi-geo-alt',
    preguntas: ['¿Cuánto llueve en verano?', '¿Cuáles fueron los años secos?', '¿Cómo está mi suelo?'],
  },
  {
    id: 'clima', titulo: 'El clima de mi zona', icono: 'bi-thermometer-half',
    preguntas: ['¿En qué mes llueve más?', '¿Hay riesgo de heladas?', '¿Hace mucho calor en mayo?', '¿Está llegando menos lluvia que antes?', '¿Cuánta radiación solar hay?'],
  },
  {
    id: 'semana', titulo: 'El clima de la semana', icono: 'bi-cloud-sun',
    preguntas: ['¿Va a llover esta semana?', '¿Cuánta lluvia se espera en total?', '¿Qué temperatura mínima habrá?'],
  },
  {
    id: 'sembrar', titulo: 'Qué sembrar', icono: 'bi-flower1',
    preguntas: ['¿Qué me conviene sembrar?', '¿Cuándo siembro?'],
  },
  {
    id: 'cultivos', titulo: 'Granos', icono: 'bi-tree',
    preguntas: ['¿Cómo le va al maíz de temporal?', '¿Qué tan riesgoso es el frijol?', '¿A cuánto se vende el sorgo?', '¿Cuánto rinde el trigo?'],
  },
  {
    id: 'verduras', titulo: 'Verduras', icono: 'bi-basket',
    preguntas: ['¿A cuánto se vende el jitomate?', '¿Qué tan riesgoso es el brócoli?', '¿Cuánto rinde el jitomate?'],
  },
  {
    id: 'frutas', titulo: 'Frutas', icono: 'bi-apple',
    preguntas: ['¿A cuánto se vende el aguacate?', '¿Cuánto rinde la fresa?'],
  },
  {
    id: 'aptitud', titulo: '¿Se da en mi parcela?', icono: 'bi-patch-check',
    preguntas: ['¿Puedo sembrar fresa aquí?', '¿Qué frutas se dan en mi parcela?', '¿Se da el aguacate en Querétaro?', '¿Qué verduras se pueden sembrar aquí?'],
  },
  {
    id: 'desglose', titulo: 'Frutas y verduras: más datos', icono: 'bi-bar-chart',
    preguntas: ['¿Dónde se siembra más el brócoli?', '¿Cuánta superficie de cebolla hay?', '¿Ha subido el precio del aguacate?', '¿Cuánto tarda en dar fruta el aguacate?'],
  },
  {
    id: 'frutales', titulo: 'Frutales y perennes', icono: 'bi-tree-fill',
    preguntas: ['¿Qué frutales hay en mi estado?', '¿Cuánto rinde el espárrago?', '¿Qué se sabe de la uva?', '¿Qué hay de la tuna?'],
  },
  {
    id: 'saber', titulo: 'Para entender mejor', icono: 'bi-lightbulb',
    preguntas: ['¿Para qué sirve la rotación de cultivos?', '¿Qué hace el frijol por el suelo?', '¿Qué ayuda a que el suelo guarde humedad?', '¿Para qué sirve un invernadero?'],
  },
];

export const NOTA_FUERA_DE_TEMA =
  'Solo contesto sobre tu parcela, el clima, el suelo y los cultivos con datos del SIAP: granos (maíz, sorgo, frijol, trigo, cebada, garbanzo), verduras (brócoli, jitomate, papa, cebolla) y algunas frutas y perennes (fresa, aguacate, espárrago, uva, tuna…), solo superficie, precios, rendimientos y pérdidas por estado. Cómo se cultivan no lo tengo verificado. No doy marcas ni dosis de productos.';
