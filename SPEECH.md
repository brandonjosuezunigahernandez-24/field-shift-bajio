# Speech de Field Shift Bajío (5 minutos)

Para decirlo en voz alta. Entre [corchetes] va lo que se hace en pantalla. Los tiempos son aproximados; en total son
unas 700 palabras, que a ritmo tranquilo dan 5 minutos.

Antes de empezar:
- Abre **3. Análisis IA** en http://localhost:5173.
- Toca el botón **Celaya, Gto. · maíz, 5 ha**.
- Haz una pregunta de calentamiento, para que gemma ya esté cargada.
- Si no hay internet, usa http://localhost:5174 (la copia sin internet): da las mismas respuestas.

---

## 1. El problema · 0:00 a 0:45

Imaginen a un agricultor de Celaya. Siembra maíz cada año, como su papá y su abuelo. No tiene riego: depende de que llueva
entre junio y septiembre. A eso se le llama **temporal**.

En Guanajuato, **el 63.9 % de la superficie agrícola es de temporal** (INEGI, Censo Agropecuario 2022). Para esas familias,
un verano seco puede ser perder la cosecha completa.

Hoy, cuando ese agricultor decide qué sembrar, se guía por la costumbre o por un promedio de lluvia. Pero **el promedio
esconde los años malos**. Lo que él necesita saber es: *en mi parcela, ¿cuántas veces le ha faltado lluvia a este cultivo?*

## 2. La solución · 0:45 a 1:30

**Field Shift Bajío** es una herramienta que le ayuda a elegir qué sembrar y en qué orden, con los datos reales de su propia
parcela.

Funciona en cuatro pasos:
1. **Dibuja su parcela** sobre el mapa de satélite.
2. Nos dice si es de temporal o de riego, y **qué le importa más**: ganar más, cuidar el suelo, gastar menos agua o
   arriesgar menos.
3. Juntamos **26 años de lluvia y temperatura de la NASA** (NASA POWER), **el suelo de su punto** (SoilGrids), **lo que
   pide cada cultivo** (FAO) y **los rendimientos y precios oficiales** de México (SIAP).
4. Le proponemos una **rotación de 3 años** que no repite familia de cultivo e incluye una leguminosa para cuidar el suelo.

## 3. Lo que nos hace diferentes · 1:30 a 2:15

Tres cosas:

**Primero, años secos reales, no promedios.** No le decimos «aquí llueven 530 milímetros». Le decimos: «al maíz le faltó
lluvia en **12 de los últimos 26 años** en tu parcela».

**Segundo, comparamos tres rotaciones, como pide el reto.** La que siembra hoy, la mejor para su meta y la mejor para otra
meta. Cada una dice por qué se sugiere, qué la respalda, qué mejora, qué no sabemos y qué debe revisar un técnico.

**Tercero, decimos lo que no sabemos.** Cada riesgo trae su margen. Por ejemplo, 21 %, pero puede ser de 11 a 36 %. También
decimos cuánto cambia si el dato del cultivo estuviera 10 % mal.

## 4. Demo · 2:15 a 3:45

[Pantalla 3, parcela de Celaya. Escribe:] **«¿Qué me conviene sembrar?»**

Para esta parcela de temporal, si quiere arriesgar menos, salen mejor frijol con 91 de 100, sorgo con 67 y maíz con 58. El
plan es frijol, sorgo y frijol. Y lo compara con lo que siembra hoy: a su rotación actual le hubiera faltado lluvia en
**21 %** de las temporadas; a esta, en **15 %**.

[Escribe:] **«¿Y por qué no el maíz?»**

Quedó tercero, porque en 12 de 26 años llovió menos de lo que necesita aquí. Ese número no lo inventa un modelo de
lenguaje: lo calcula nuestro motor de reglas con la lluvia de la NASA.

[Escribe:] **«Coseché 6 toneladas, ¿cómo voy?»**

Fíjense: no adivina. Pregunta «¿en cuántas hectáreas?». [Escribe: **«en 4 hectáreas»**] Y lo compara con el promedio
oficial del estado.

[Escribe:] **«¿Cuánto glifosato le pongo?»**

Y aquí no contesta. No damos dosis ni marcas: una dosis equivocada daña el cultivo y la salud. Lo mandamos con un técnico.

[Opcional, si sobra tiempo: **2. Simulador 3D**, cómo crecen los cultivos de la parcela con la lluvia de cada año real.]

## 5. Cómo funciona por dentro · 3:45 a 4:30

El asistente habla en español sencillo y también escucha por voz. Lo importante es cómo contesta:
- **El 97 % de las respuestas las calcula el código** con los datos reales, y un verificador revisa que no se invente
  ningún número.
- El modelo de lenguaje, **Gemma, corre en la computadora, sin internet**. Solo explica tarjetas de conocimiento que
  tienen fuente.
- **Funciona sin internet**: guardamos los datos y da las mismas respuestas.

Lo medimos: en preguntas que nunca usamos para ajustarlo, contesta bien el **82 %**. Tiene **más de 400 pruebas
automáticas**. Y lo más importante: cuando no sabe algo, lo dice.

## 6. Cierre · 4:30 a 5:00

Field Shift Bajío convierte los datos de la NASA en una respuesta que un agricultor de temporal entiende y puede usar:
**qué sembrar, por qué, y qué tan seguro es**.

No sustituye al agricultor ni al técnico: le da los años reales de su parcela para decidir mejor.

Hoy funciona en Guanajuato y Querétaro. La misma idea sirve para cualquier región de temporal del mundo donde haya datos de
la NASA.

Gracias.

---

# Preguntas que pueden hacer los jueces

**¿Qué datos de la NASA usan exactamente?**
NASA POWER, por punto y por mes, de 2000 a 2025:
- lluvia, temperatura media, máxima y mínima, radiación solar y humedad del suelo;
- con la mínima y la máxima contamos los años con helada y con calor dañino en el ciclo de cada cultivo.

En el mapa se pueden ver capas de NASA GIBS (color real, NDVI y humedad SMAP), solo como apoyo visual.

**¿Por qué no usan el promedio de lluvia?**
Porque el promedio esconde los años malos. En Celaya llueven unos 530 mm en verano en promedio, pero en 2023 llovieron 290.
Al agricultor le importa cuántas veces le faltó agua, no el promedio.

**¿Qué tan confiable es el resultado?**
- Son 26 años: el riesgo es una estimación y lo damos con su margen.
- Los requisitos de cada cultivo son rangos generales de la FAO, no de variedades locales.
- La lluvia de NASA POWER es el promedio de un cuadro de unos 50 km.
- El suelo de SoilGrids es una estimación de 250 m, no un análisis de laboratorio.

Todo eso lo dice la herramienta en pantalla. Por eso decimos que no sustituye al técnico.

**¿El modelo de lenguaje inventa cosas?**
Lo diseñamos para que no pueda:
- El 97 % lo contesta el código con los datos.
- Un verificador revisa que cada número de la respuesta esté en los datos.
- Gemma solo explica tarjetas con fuente. Si no sabe, dice «No lo sé con mis datos».
- Bloqueamos consejos peligrosos, como dosis de químicos o quemar el rastrojo.

**¿Por qué un modelo local y no uno en la nube?**
En el campo muchas veces no hay internet. Gemma corre en la computadora, sin enviar los datos del agricultor a ningún lado,
y la app da las mismas respuestas con y sin internet.

**¿Usaron machine learning?**
Sí, donde ayuda y lo medimos:
- un clasificador que entiende la pregunta (78.9 % contra 73.2 % solo con palabras clave);
- un modelo de probabilidad de año malo con datos del SIAP y la NASA.

Donde el machine learning no le ganó al promedio, como el rendimiento con el clima, no lo usamos, y lo documentamos.

**¿Cómo eligen la rotación?**
Un motor de reglas simple y explicable:
- puntaje por temperatura, lluvia y pH;
- la meta del agricultor cambia los pesos;
- reglas agronómicas: no repetir familia y al menos una leguminosa;
- otoño-invierno solo con riego.

Cada recomendación trae sus razones con números reales.

**¿Quién lo usaría y cómo llega al agricultor?**
El agricultor directamente, desde el celular, o un técnico de la SADER, del INIFAP o del CADER que lo acompaña. Está en
español sencillo, con letra grande, voz y palabras explicadas al tocarlas.

**¿Qué pasa fuera de Guanajuato y Querétaro?**
El clima y el suelo se ven en todo México, pero solo recomendamos en el Bajío, porque los rendimientos y precios del SIAP que
cargamos son de esos dos estados. Para crecer solo hay que agregar los datos del SIAP de más estados.

**¿Qué sigue?**
- Validar los rangos de los cultivos con el INIFAP y variedades locales.
- Probarlo con agricultores reales: ya tiene un botón «¿Te sirvió?» que guarda su opinión.
- Más estados y más cultivos.

**¿Cuánto cuesta usarlo?**
Nada. Todos los datos son abiertos y gratuitos (NASA POWER, SoilGrids, SIAP, Open-Meteo, FAO) y el modelo corre localmente,
sin pagar por uso.

**¿Qué fue lo más difícil?**
Que el asistente fuera honesto: que no inventara números y que dijera «no sé» en vez de adivinar. Medimos cada cambio con
cientos de preguntas y con preguntas nuevas que nunca había visto.
