# Cómo funciona un LLM (explicado fácil)

Para quien va a construir el asistente de Field Shift Bajío. No hace falta saber matemáticas.

## 1. ¿Qué es un LLM?

LLM = *Large Language Model* (modelo de lenguaje grande).

Es **un programa que aprendió a adivinar la siguiente palabra**. Eso es todo.

Es como el autocompletar del celular, pero entrenado con millones de libros, páginas y conversaciones. Si le escribes:

> "El maíz necesita agua para…"

adivina que lo más probable es: "crecer". Repite el truco palabra por palabra y así arma respuestas completas.

**Idea clave:** el modelo no "sabe" cosas como una persona. Sabe qué palabras suelen ir juntas. Por eso a veces suena muy seguro y se equivoca.

## 2. ¿Cómo aprendió? (entrenamiento)

1. Se le dan cantidades enormes de texto.
2. Se le tapa una palabra y se le pide adivinarla.
3. Si falla, se ajustan sus "perillas" internas un poquito. Se repite miles de millones de veces.

Al final queda un archivo grande con millones de números ajustados. Esos números se llaman **parámetros** o **pesos**. Ese archivo **es** el modelo.

- Gemma 3 de **4B** = 4 mil millones de parámetros.
- Más parámetros = más listo, pero más pesado y lento.
- Una vez entrenado, **ya no aprende de tus conversaciones**. Es una foto congelada.

## 3. ¿Qué pasa cuando le escribes? (inferencia)

```
Tu pregunta → tokens → el modelo calcula → siguiente token → se repite → respuesta
```

- **Token:** un pedazo de palabra. "sorgo" puede ser 2 tokens. Más o menos, 1 token es ¾ de palabra.
- El modelo saca una **lista de candidatos con probabilidad** ("crecer" 60%, "vivir" 15%…), elige uno, lo pega al texto y repite.
- **Temperatura:** qué tan atrevido es al elegir. Temperatura 0 = siempre el más probable (serio, repetible). Temperatura alta = más creativo, más inventa. **Nosotros usamos baja** (0 a 0.2).
- **Ventana de contexto:** cuánto texto puede "tener a la vista" a la vez (tu pregunta + lo que le mandes + su respuesta). Lo que no cabe, no lo ve.

## 4. ¿Por qué inventa? (alucinaciones)

Porque su trabajo es producir texto que *suene bien*, no verificar que sea cierto. Si no tiene el dato, igual completa con algo parecido.

Ejemplo peligroso en nuestra app: "¿Cuántos años secos tuvo mi parcela?" → si no le damos el dato, puede inventar "8".

## 5. La solución de este proyecto: el LLM explica, el código decide

```
NASA + suelo ──► Motor de reglas (código) ──► FICHA con los números reales
                                                      │
Pregunta del agricultor ──────────────────────────────┤
                                                      ▼
                                          LLM: "redacta con SOLO esto"
                                                      ▼
                                   Verificador: ¿cada número está en la ficha?
                                          sí → se muestra │ no → respuesta plantilla
```

- **El motor** calcula riesgos y elige cultivos. Es código, no se equivoca al sumar.
- **La ficha** es un texto pequeño con todos los datos de la parcela. Se le pega al modelo en cada pregunta.
- **El LLM** solo lo pone en español sencillo.
- **El verificador** revisa que los números de la respuesta existan en la ficha.

A esta técnica de "pégale los datos y que responda solo con eso" se le llama **RAG** (en su forma simple). Como nuestra ficha es chica, no necesitamos base de datos vectorial.

## 6. El prompt (las instrucciones)

Es el texto que le mandas al modelo antes de la pregunta. Tiene tres partes:

1. **Rol y reglas:** "Eres un asistente para agricultores. Usa solo la ficha. Si no está, di 'No tengo ese dato'."
2. **La ficha** con los datos.
3. **La pregunta** del agricultor.

Escribir bien el prompt es la parte donde más se gana calidad con menos esfuerzo.

## 7. ¿Se puede correr en tu computadora, sin internet? Sí

Un modelo es un archivo. Si lo descargas una vez, corre en tu compu sin conexión.

| Concepto | Qué es |
|---|---|
| **Gemma** | Familia de modelos abiertos de Google, gratis de descargar y usar. |
| **Ollama** | Programa que descarga y corre modelos locales y te da un servidor en `http://localhost:11434`. Nuestro servidor Express le habla ahí en lugar de a internet. |
| **Cuantización** | Comprimir el modelo (números de menos precisión) para que quepa en menos memoria. Pierde un poco de calidad y gana mucha velocidad. |
| **GPU / VRAM** | La tarjeta de video acelera el modelo. Si no hay, corre en CPU, más lento. |

**Regla práctica de tamaño** (modelo cuantizado):

| Modelo | Memoria aprox. | Para qué |
|---|---|---|
| 1B | ~1 GB | Laptop modesta, respuestas simples |
| 4B | ~3 GB | **Buen punto medio** para nuestro caso |
| 12B | ~8 GB | Mejor calidad, necesita buena GPU o mucha RAM |

Tu laptop tiene una RTX 4060 con 8 GB de VRAM: un modelo de 4B va cómodo. **La laptop que se lleve al rancho puede ser más débil**, así que hay que probar en esa.

## 8. Límites de un modelo chico (para no sorprendernos)

- Se equivoca más que uno grande → por eso la ficha cerrada y el verificador no son opcionales.
- Sigue peor instrucciones largas → prompt corto y claro.
- Puede mezclar idiomas → se le pide "responde en español".
- Si le pides que "controle la pantalla", a veces rompe el formato → le damos una **lista cerrada de acciones** y el código valida (ver `docs/llm-plan.md`).

## 9. Glosario rápido

| Palabra | Significa |
|---|---|
| Prompt | El texto que le mandas |
| Token | Pedazo de palabra |
| Parámetros | Los números que forman el modelo (más = más grande) |
| Inferencia | Usar el modelo ya entrenado |
| Temperatura | Qué tan creativo/atrevido responde |
| Contexto | Todo lo que el modelo tiene a la vista en una pregunta |
| Alucinación | Respuesta inventada que suena creíble |
| RAG | Darle datos al modelo en el prompt para que responda con ellos |
| Cuantización | Comprimir el modelo para que pese menos |
| Ollama | Programa para correr modelos en tu compu |
