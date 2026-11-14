// Guía de lo que se le puede preguntar al asistente: solo temas que de verdad sabe contestar con los datos que tiene.
// El front la muestra como botones; así el agricultor no se sale de lo que el asistente conoce y las respuestas no se alargan.
export const TEMAS = [
  {
    id: 'parcela', titulo: 'Mi parcela', icono: 'bi-geo-alt',
    preguntas: ['¿Cuánto llueve en verano?', '¿Cuáles fueron los años secos?', '¿Cómo está mi suelo?'],
  },
  {
    id: 'semana', titulo: 'El clima de la semana', icono: 'bi-cloud-sun',
    preguntas: ['¿Va a llover esta semana?', '¿Cuánta lluvia se espera en total?', '¿Qué temperatura mínima habrá?'],
  },
  {
    id: 'sembrar', titulo: 'Qué sembrar', icono: 'bi-flower1',
    preguntas: ['¿Qué me conviene sembrar?'],
  },
  {
    id: 'cultivos', titulo: 'Mis cultivos', icono: 'bi-tree',
    preguntas: ['¿Cómo le va al maíz de temporal?', '¿Qué tan riesgoso es el frijol?', '¿A cuánto se vende el sorgo?', '¿Cuánto rinde el trigo?'],
  },
  {
    id: 'saber', titulo: 'Para entender mejor', icono: 'bi-lightbulb',
    preguntas: ['¿Para qué sirve la rotación de cultivos?', '¿Qué hace el frijol por el suelo?', '¿Qué ayuda a que el suelo guarde humedad?', '¿Para qué sirve un invernadero?'],
  },
];

export const NOTA_FUERA_DE_TEMA =
  'Solo contesto sobre tu parcela, el clima, el suelo y los cultivos (maíz, sorgo, frijol, trigo, cebada, garbanzo, brócoli y jitomate). No doy marcas ni dosis de productos.';
