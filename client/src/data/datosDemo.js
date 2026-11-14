/* Field Shift Bajío · datos de ejemplo (ilustrativos).
   Misma forma que las APIs para sustituir luego por NASA POWER y SoilGrids. */
// Datos de ejemplo del diseño original (ilustrativos). Se usan donde la API todavía no tiene dato:
// pantalla 3 (asistente IA), chat, visuales 3D por cultivo y requisitos de los 22 cultivos de "Probar cultivo".
const FS_DATOS = {
  parcelas: {
    celaya:    { id:'celaya',    nombre:'Celaya, Gto.',     boton:'Celaya, Gto. (Temporal)',   lat:20.52, lon:-100.81, top:46, left:52, ndvi:'0.64 · activo',   gwetroot:'42%', ph:'6.8 · óptimo' },
    marques:   { id:'marques',   nombre:'El Marqués, Qro.', boton:'El Marqués, Qro. (Sequía)', lat:20.59, lon:-100.39, top:34, left:70, ndvi:'0.41 · estrés',   gwetroot:'29%', ph:'7.2 · neutro' },
    salamanca: { id:'salamanca', nombre:'Salamanca, Gto.',  boton:'Salamanca, Gto. (Riego)',   lat:20.57, lon:-101.19, top:62, left:30, ndvi:'0.78 · vigoroso', gwetroot:'64%', ph:'6.6 · óptimo' }
  },

  mapa: {
    paletas: {
      sat:  ['#B9D9AE','#8FC285','#6CAA62','#4E8F4B','#C7DDB3','#A2C98F','#7DB46E'],
      ndvi: ['#F0F8EC','#D3EDCB','#A9DB9C','#7CC46F','#4FA54A','#2E8139','#165C2A'],
      smap: ['#E3F3EC','#BFE6D3','#93D2B6','#62B996','#3B9A79','#22795F','#125846']
    },
    indices: [3,5,2,6,1,4, 5,2,6,3,4,1, 2,6,4,5,3,6, 4,1,3,2,6,5],
    titulos: {
      sat:'CAPA: NASA GIBS TRUE COLOR + LÍMITES',
      ndvi:'CAPA: MODIS MOD13Q1 · ÍNDICE DE VERDOR',
      smap:'CAPA: NASA SMAP · HUMEDAD DEL SUELO'
    }
  },

  agua: {
    temporal: { titulo:'Temporal', sub:'Solo con lluvia' },
    riego:    { titulo:'Riego',    sub:'Pozo, presa o canal' }
  },
  prioridades: {
    riesgo: { titulo:'Arriesgar menos',  sub:'Resistir años secos' },
    suelo:  { titulo:'Cuidar el suelo',  sub:'Leguminosas que fijan nitrógeno' },
    agua:   { titulo:'Gastar menos agua',sub:'Bajo consumo hídrico' },
    ganar:  { titulo:'Ganar más',        sub:'Mayor rendimiento comercial' }
  },

  textoWhisper: 'Tengo 4 hectáreas de temporal en Celaya, el año pasado falló la lluvia y se me perdió el maíz. ¿Qué rotación me recomiendas?',

  /* ---------- Pantalla 2 ---------- */
  rotacion: [
    { anio:1, etiqueta:'AÑO 1 · 2026', pts:94, cultivo:'Sorgo grano', texto:'Arranque seguro ante poca lluvia (450 mm mínimo).',
      titulo3d:'Año 1 · Sorgo grano', insignia:'Alta tolerancia a sequía',
      tallo:{ alto:50, ancho:9, de:'#2E6B2A', a:'#9CC24A', glow:'rgba(156,194,74,.55)' },
      descripcion:'Las raíces profundas del sorgo aprovechan la humedad que queda entre 15 y 30 cm, sin pedir riegos de auxilio.' },
    { anio:2, etiqueta:'AÑO 2 · 2027', pts:91, cultivo:'Frijol Flor de Junio', texto:'Leguminosa que devuelve nitrógeno natural al suelo.',
      titulo3d:'Año 2 · Frijol Flor de Junio', insignia:'+45 kg/ha de nitrógeno',
      tallo:{ alto:30, ancho:15, de:'#14532D', a:'#4FBF6E', glow:'rgba(79,191,110,.6)' },
      descripcion:'Sus nódulos en la raíz fijan nitrógeno del aire en los primeros 15 cm del suelo y regeneran la fertilidad sin fertilizante extra.' },
    { anio:3, etiqueta:'AÑO 3 · 2028', pts:88, cultivo:'Maíz blanco ciclo corto', texto:'Aprovecha el suelo enriquecido con mayor rendimiento.',
      titulo3d:'Año 3 · Maíz blanco ciclo corto', insignia:'Suelo regenerado',
      tallo:{ alto:62, ancho:9, de:'#1B6B3A', a:'#C9E77A', glow:'rgba(201,231,122,.6)' },
      descripcion:'Con más materia orgánica y nitrógeno disponible tras el frijol, el maíz aprovecha mejor el temporal de junio a octubre.' }
  ],
  kpis: [
    { etiqueta:'LLUVIA MEDIA', valor:'569 mm' },
    { etiqueta:'AÑOS SECOS',   valor:'6 / 25' },
    { etiqueta:'TEMP. MEDIA',  valor:'19.4 °C' },
    { etiqueta:'pH SOILGRIDS', valor:'6.8' }
  ],
  lluvia: {
    desde: 2000,
    valores: [590,610,540,645,680,495,575,620,605,480,660,430,560,635,615,650,585,545,610,470,530,625,460,445,570],
    umbral: 520
  },
  ranking: [
    { cultivo:'Sorgo grano',       etiqueta:'muy bajo riesgo', pts:94, color:'#14532D' },
    { cultivo:'Frijol',            etiqueta:'fija nitrógeno',  pts:91, color:'#1B6B3A' },
    { cultivo:'Garbanzo',          etiqueta:'poca agua',       pts:87, color:'#23854A' },
    { cultivo:'Cebada grano',      etiqueta:'ciclo corto',     pts:82, color:'#3BA55C' },
    { cultivo:'Maíz grano blanco', etiqueta:'riesgo moderado', pts:74, color:'#6CC283' },
    { cultivo:'Trigo grano',       etiqueta:'mejor con riego', pts:68, color:'#8FD1A0' },
    { cultivo:'Brócoli / cebolla', etiqueta:'exige riego',     pts:45, color:'#B5E2BF' }
  ],
  preguntaDock: '¿En qué mes me conviene sembrar el frijol en el año 2 para aprovechar las lluvias de Celaya?',


  /* ---------- Pantalla 4 · Probar cultivo ----------
     Clima y suelo por parcela (ilustrativo; en la app: NASA POWER + SoilGrids).
     lluvia_ciclo = jun–sep · temp_ciclo = media jun–oct · ventana_dias = días útiles de temporal.
     secos_idx = índices (0 = 2000) de años con menos de 520 mm. */
  clima: {
    celaya:       { lluvia_anual:569, lluvia_ciclo:515, temp_ciclo:21.5, ph:6.8, arcilla:38, carbono:1.9, ventana_dias:125, secos_idx:[5,9,11,19,22,23] },
    marques:      { lluvia_anual:498, lluvia_ciclo:430, temp_ciclo:20.2, ph:7.2, arcilla:32, carbono:1.4, ventana_dias:110, secos_idx:[1,5,9,11,14,17,19,22,23] },
    salamanca:    { lluvia_anual:612, lluvia_ciclo:540, temp_ciclo:22.4, ph:6.6, arcilla:41, carbono:2.1, ventana_dias:135, secos_idx:[5,11,19,23] },
    personalizada:{ lluvia_anual:560, lluvia_ciclo:505, temp_ciclo:21.3, ph:6.9, arcilla:36, carbono:1.7, ventana_dias:120, secos_idx:[5,9,11,19,22,23] }
  },

  /* Requisitos por cultivo (estilo FAO Ecocrop, ilustrativos).
     lluvia = mm que pide durante el ciclo (perennes: mm al año) · temp = °C óptima · ph · arcilla % ·
     ciclo = días (0 = perenne) · sequia = tolerancia alta | media | baja */
  cultivos: [
    { id:'sorgo',     nombre:'Sorgo grano',             alias:['sorgo','milo'],                        tipo:'Grano',       lluvia:[400,650],  temp:[20,32], ph:[5.5,7.5], arcilla:[15,45], ciclo:110, sequia:'alta' },
    { id:'frijol',    nombre:'Frijol Flor de Junio',    alias:['frijol','frijoles','frejol','poroto','flor de junio'], tipo:'Leguminosa', lluvia:[300,500], temp:[18,26], ph:[6.0,7.5], arcilla:[10,35], ciclo:95, sequia:'media' },
    { id:'maiz',      nombre:'Maíz blanco ciclo corto', alias:['maiz','maiz blanco','elote','milpa'],   tipo:'Grano',       lluvia:[520,800],  temp:[18,30], ph:[5.8,7.5], arcilla:[15,40], ciclo:120, sequia:'baja' },
    { id:'garbanzo',  nombre:'Garbanzo',                alias:['garbanzo'],                             tipo:'Leguminosa',  lluvia:[250,450],  temp:[15,25], ph:[6.0,8.0], arcilla:[15,40], ciclo:100, sequia:'alta' },
    { id:'cebada',    nombre:'Cebada grano',            alias:['cebada'],                               tipo:'Grano',       lluvia:[350,600],  temp:[12,22], ph:[6.0,8.0], arcilla:[15,40], ciclo:100, sequia:'media' },
    { id:'trigo',     nombre:'Trigo grano',             alias:['trigo'],                                tipo:'Grano',       lluvia:[450,650],  temp:[12,24], ph:[6.0,7.5], arcilla:[15,40], ciclo:130, sequia:'baja' },
    { id:'avena',     nombre:'Avena forrajera',         alias:['avena'],                                tipo:'Forraje',     lluvia:[350,600],  temp:[10,24], ph:[5.5,7.5], arcilla:[15,45], ciclo:100, sequia:'media' },
    { id:'amaranto',  nombre:'Amaranto',                alias:['amaranto','alegria'],                   tipo:'Grano',       lluvia:[300,500],  temp:[18,30], ph:[6.0,7.5], arcilla:[10,35], ciclo:110, sequia:'alta' },
    { id:'girasol',   nombre:'Girasol',                 alias:['girasol'],                              tipo:'Oleaginosa',  lluvia:[400,650],  temp:[20,28], ph:[6.0,7.5], arcilla:[10,40], ciclo:110, sequia:'media' },
    { id:'cacahuate', nombre:'Cacahuate',               alias:['cacahuate','mani','cacahuete'],         tipo:'Leguminosa',  lluvia:[450,700],  temp:[22,30], ph:[5.5,7.0], arcilla:[5,25],  ciclo:120, sequia:'media' },
    { id:'calabaza',  nombre:'Calabaza',                alias:['calabaza','calabacita'],                tipo:'Hortaliza',   lluvia:[450,700],  temp:[18,28], ph:[5.5,7.0], arcilla:[10,35], ciclo:100, sequia:'media' },
    { id:'papa',      nombre:'Papa',                    alias:['papa','patata'],                        tipo:'Hortaliza',   lluvia:[500,700],  temp:[15,20], ph:[5.0,6.5], arcilla:[10,30], ciclo:110, sequia:'baja' },
    { id:'brocoli',   nombre:'Brócoli',                 alias:['brocoli'],                              tipo:'Hortaliza',   lluvia:[600,900],  temp:[15,22], ph:[6.0,7.0], arcilla:[15,35], ciclo:90,  sequia:'baja' },
    { id:'cebolla',   nombre:'Cebolla',                 alias:['cebolla'],                              tipo:'Hortaliza',   lluvia:[600,850],  temp:[13,24], ph:[6.0,7.0], arcilla:[10,30], ciclo:140, sequia:'baja' },
    { id:'jitomate',  nombre:'Jitomate',                alias:['jitomate','tomate rojo','tomate'],      tipo:'Hortaliza',   lluvia:[600,900],  temp:[18,27], ph:[6.0,7.0], arcilla:[10,35], ciclo:120, sequia:'baja' },
    { id:'chile',     nombre:'Chile',                   alias:['chile','chile serrano','chile ancho','pimiento'], tipo:'Hortaliza', lluvia:[600,900], temp:[18,30], ph:[6.0,7.0], arcilla:[10,35], ciclo:140, sequia:'baja' },
    { id:'fresa',     nombre:'Fresa',                   alias:['fresa','fresas','frutilla'],            tipo:'Frutal',      lluvia:[700,1000], temp:[15,25], ph:[5.5,6.8], arcilla:[10,30], ciclo:150, sequia:'baja' },
    { id:'arroz',     nombre:'Arroz',                   alias:['arroz'],                                tipo:'Grano',       lluvia:[1000,1500],temp:[22,32], ph:[5.0,6.5], arcilla:[30,60], ciclo:130, sequia:'baja' },
    { id:'alfalfa',   nombre:'Alfalfa',                 alias:['alfalfa'],                              tipo:'Forraje perenne', lluvia:[700,1200], temp:[15,28], ph:[6.5,8.0], arcilla:[15,40], ciclo:0, sequia:'media' },
    { id:'agave',     nombre:'Agave mezcalero',         alias:['agave','maguey','agave azul','mezcal'], tipo:'Perenne',     lluvia:[400,1000], temp:[15,30], ph:[6.0,8.0], arcilla:[10,35], ciclo:0, sequia:'alta' },
    { id:'nopal',     nombre:'Nopal',                   alias:['nopal','tuna'],                         tipo:'Perenne',     lluvia:[250,600],  temp:[15,30], ph:[6.0,8.5], arcilla:[5,35],  ciclo:0, sequia:'alta' },
    { id:'aguacate',  nombre:'Aguacate',                alias:['aguacate','palta'],                     tipo:'Frutal perenne', lluvia:[1000,1600], temp:[16,24], ph:[5.5,6.5], arcilla:[10,30], ciclo:0, sequia:'baja' }
  ],
  pruebaRapida: ['Garbanzo','Fresa','Aguacate','Amaranto','Cacahuate','Agave'],

  /* ---------- Pantalla 3 · contrato JSON (9.8) ---------- */
  respuestaIA: {
    pregunta: { texto:'¿En qué mes me conviene sembrar el frijol en el año 2 para aprovechar las lluvias de Celaya?',
                origen:'voz', duracion:'0:07', idioma:'español (MX)' },
    hora: 'Hoy · 12:20',
    pasos: [
      { titulo:'Transcripción de voz',           detalle:'Whisper · 19 palabras · confianza 99%',                 tiempo_s:0.3 },
      { titulo:'Entendió la intención',          detalle:'cultivo: frijol · año 2 · objetivo: fecha de siembra',  tiempo_s:0.2 },
      { titulo:'Consultó el clima de tu punto',  detalle:'NASA POWER · PRECTOTCORR, GWETROOT · 2000–2024',        tiempo_s:0.9 },
      { titulo:'Cruzó con suelo y cultivo',      detalle:'SoilGrids 0–30 cm · FAO Ecocrop: frijol 300–500 mm',    tiempo_s:0.6 },
      { titulo:'Redactó la respuesta',           detalle:'español sencillo · 4 fuentes citadas',                  tiempo_s:0.4 }
    ],
    respuesta_corta: {
      titulo:'Siembra tu frijol Flor de Junio entre el 15 de junio y el 10 de julio.',
      apoyo:'Es cuando la humedad en la zona de raíces pasa del 40% tras las primeras lluvias de verano, y te da tiempo de cosechar antes de que el temporal se corte en octubre.'
    },
    calendario: {
      meses: [
        { mes:'May', lluvia_mm:35,  gwetroot_pct:28 },
        { mes:'Jun', lluvia_mm:120, gwetroot_pct:41 },
        { mes:'Jul', lluvia_mm:150, gwetroot_pct:52 },
        { mes:'Ago', lluvia_mm:135, gwetroot_pct:58 },
        { mes:'Sep', lluvia_mm:110, gwetroot_pct:55 },
        { mes:'Oct', lluvia_mm:45,  gwetroot_pct:44 },
        { mes:'Nov', lluvia_mm:12,  gwetroot_pct:33 }
      ],
      fases: [
        { nombre:'Siembra',                 desde_quincena:4,  hasta_quincena:6 },
        { nombre:'Crecimiento y floración', desde_quincena:6,  hasta_quincena:10 },
        { nombre:'Cosecha · fin sep – oct', desde_quincena:10, hasta_quincena:12 }
      ]
    },
    razones: [
      { cifra:'41%',      titulo:'La tierra ya tiene humedad',   texto:'A partir de la segunda quincena de junio la humedad en la raíz pasa del 40%: la semilla germina parejo.', fuente:2, etiqueta:'GWETROOT' },
      { cifra:'515 mm',   titulo:'Lluvia suficiente en el ciclo', texto:'De junio a septiembre llueve en promedio más de lo que pide el frijol, aun en varios años secos.',         fuente:1, etiqueta:'PRECTOTCORR' },
      { cifra:'≈95 días', titulo:'Cosecha antes del corte',       texto:'Un ciclo corto sembrado en esa ventana se cosecha antes de que la lluvia baje en octubre.',             fuente:4, etiqueta:'FAO Ecocrop' }
    ],
    riesgos: [
      { si_pasa:'Para el 10 de julio todavía no llueve lo suficiente', haz_esto:'Recorre la siembra con una variedad de ciclo más corto o cambia ese año a garbanzo.' },
      { si_pasa:'Agosto viene muy lluvioso durante la floración',      haz_esto:'Siembra en surcos altos para que no se encharque y revisa hongos en las hojas.' }
    ],
    fuentes: [
      { id:1, nombre:'NASA POWER · PRECTOTCORR' }, { id:2, nombre:'NASA POWER · GWETROOT' },
      { id:3, nombre:'SoilGrids ISRIC' },          { id:4, nombre:'FAO Ecocrop' }
    ],
    confianza_pct: 87,
    resumen: [
      { k:'Años analizados',        v:'2000–2024' },
      { k:'Lluvia media anual',     v:'569 mm' },
      { k:'Años secos detectados',  v:'6 de 25' },
      { k:'pH del suelo 0–15 cm',   v:'6.8' },
      { k:'Arcilla 5–15 cm',        v:'38%' }
    ],
    plan: [
      { anio:2026, cultivo:'Sorgo grano' },
      { anio:2027, cultivo:'Frijol Flor de Junio' },
      { anio:2028, cultivo:'Maíz blanco ciclo corto' }
    ],
    efecto_en_plan: { anio:2027, cultivo:'Frijol Flor de Junio', nota:'siembra 15 jun – 10 jul' },
    sugerencias: [ '¿Cuánta semilla necesito para 4 ha?', '¿Y si este año viene seco?', '¿Cuándo siembro el maíz del año 3?' ]
  }
};

export default FS_DATOS;
