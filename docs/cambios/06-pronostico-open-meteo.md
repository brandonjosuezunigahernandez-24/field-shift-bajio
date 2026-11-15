# 06 · Pronóstico de 7 días (Open-Meteo)

**Qué:** `sources/openMeteo.js`, `routes/pronostico.js` (`GET /api/pronostico?lat&lon`) y una sección `pronostico_7_dias` en la ficha.
**Para qué:** responder "¿va a llover esta semana?". El clima histórico de NASA no sirve para eso.
**Cómo funciona con y sin internet:**
1. Caché de menos de 3 horas → se usa, no se llama a la API.
2. Si no, consulta Open-Meteo (sin llave) y guarda con la hora.
3. Sin internet → usa la caché vieja con su fecha (`obtenido`).
4. Sin caché ni internet → `disponible: false`; el asistente no inventa.
**Cómo responde (ejemplo real, Celaya, con internet):**
- "¿Cuánta lluvia se espera en total?" → "Se espera un total de 1.4 milímetros de lluvia en los próximos 7 días [Open-Meteo]."
- "¿Qué temperatura mínima habrá?" → "11.3 grados Celsius, el día 15 de noviembre".
**Problema encontrado y arreglo:** Gemma 4B se equivocaba al buscar máximos y mínimos en la lista de días (dijo 12.3 °C cuando la mínima era 11.3 °C, y el verificador no lo detectó porque ambos números existen). Ahora **el código calcula** total de lluvia, día más lluvioso y temperaturas extremas (`resumen`) y el modelo solo los copia.
**Cómo probar:** `npm test` (40 pruebas); con el servidor sin `OFFLINE`, preguntar "¿Va a llover esta semana?"; repetir con `OFFLINE=1` para ver la caché.
**Límites (medidos):**
- Aun con `resumen`, el modelo a veces **cita la fuente equivocada** (puso `[SoilGrids]` a una temperatura) y añade frases de relleno.
- Primera respuesta con internet: ~25 s (carga del modelo y consulta).
- Se envía lat/lon (redondeados a 2 decimales) a un servicio externo. Open-Meteo es gratis solo para uso **no comercial** (CC BY 4.0, ver https://open-meteo.com/). Hay que citarlo.
- Pronóstico de 7 días, no estacional: no sirve para decidir qué sembrar.
