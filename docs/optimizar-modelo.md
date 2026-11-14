# Cómo optimizar el modelo (propuesta)

**Contexto:** el asistente debe funcionar **sin internet**, en laptops modestas, con un modelo chico (Gemma 4B). Una API de IA de paga (Gemini, GPT, Claude…) **contradice ese objetivo**: necesita internet y manda las preguntas del agricultor a un servicio externo. Podría ser un **modo opcional "con internet"** más adelante, nunca el principal.

## Las dos palancas
| Palanca | Qué es | Efecto | Costo |
|---|---|---|---|
| **Reducir la libertad** | Que el código calcule y redacte lo importante; el modelo solo conversa | Menos errores, respuestas repetibles | Menos flexible |
| **Darle más información** | Más datos y textos verificados en la ficha | Respuestas más completas | Más contexto = más lento y más memoria |

**Regla:** a un modelo chico se le da **poca libertad y buena información**, no mucha libertad.

## Propuesta por capas (de más a menos libertad del modelo)
1. **Calcula el código, redacta el código** (sin modelo): recomendación de cultivos, rotación, simulación, pronóstico, datos del SIAP. *Ya hecho para recomendar (`origen: "motor"`).* Pendiente para años secos, pronóstico y precios.
2. **Calcula el código, redacta el modelo con una ficha corta:** explicar por qué un cultivo, resumir la parcela. *Ya funciona; falla a veces en citas y relleno.*
3. **El modelo responde con textos verificados** (tarjetas, Wikipedia): preguntas generales de agricultura.
4. **Sin datos:** "No tengo ese dato" y sugerir una pregunta que sí pueda contestar (con botones).

## Respuestas más largas y completas
- **No se logran dejando que el modelo invente más**, sino con **más información verificada**: más tarjetas, textos de INIFAP/FAO resumidos, datos del SIAP por municipio.
- **Entrenar (afinar) el modelo** podría mejorar el estilo, pero necesita cientos de ejemplos buenos y no corrige datos faltantes. Hoy rinde más escribir mejores textos y plantillas.
- **Respuestas en varios pasos:** el código puede armar una respuesta larga con partes (resumen de la parcela + recomendación + riesgos + advertencias) y dejar al modelo solo para contestar dudas.

## Contexto y "reiniciar" sin perder la parcela
- La ficha de la parcela **se recalcula en cada pregunta** desde la caché: no ocupa memoria de la conversación.
- **Reiniciar la conversación** = vaciar el historial en el front; la parcela se conserva porque `lat`/`lon` (y `agua`, `prioridad`) viajan en cada petición.
- Para ahorrar contexto: ficha por tema (solo suelo si preguntan por suelo), historial de 2 vueltas y respuestas recortadas.

## Siguientes pasos de optimización (en orden)
1. Citas puestas por el código y plantillas para años secos, pronóstico y precios (hoy las redacta el modelo).
2. Verificador por campo (que el modelo diga qué dato usó y el código compare el valor).
3. Medir con el set de 15 preguntas y con la laptop en solo CPU.
4. Más tarjetas verificadas y datos del SIAP por municipio.
5. Modo opcional con internet (modelo en la nube) solo si el equipo lo decide y avisando al agricultor.
