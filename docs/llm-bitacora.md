# Bitácora del asistente LLM

Registro de lo que se hace y por qué. Cada entrada con fecha. Sirve también para `docs/IA_USADA.md` y `docs/FUENTES.md`.

## 2026-11-14 · Paso 1: modelos locales

**Estado inicial de la laptop**
- GPU: NVIDIA RTX 4060 Laptop, 8 GB de VRAM.
- Disco libre: ~240 GB.
- Ollama ya estaba instalado. Único modelo: `qwen2.5-coder:7b` (4.7 GB), hecho para programar, no se usa en el asistente.

**Modelos que se descargan con `ollama pull`**

| Modelo | Tamaño aprox. | Por qué |
|---|---|---|
| `gemma3:4b` | ~3.3 GB | **Modelo principal.** Cabe de sobra en 8 GB de VRAM, responde bien en español y es gratis y abierto (Google). |
| `gemma3:1b` | ~0.8 GB | **Prueba de laptop débil.** La laptop que se lleve al rancho puede ser más modesta; con este medimos si el asistente sigue sirviendo con un modelo mínimo. |

**Por qué Gemma y no otro:** el plan del equipo ya la nombra como la opción local, es de licencia abierta y tiene tamaños chicos. No se comparó contra otras familias; si el 4B falla en las pruebas se puede evaluar otra.

**Qué NO se hizo**
- No se usa ninguna API en la nube ni se manda información a internet para el asistente.
- Los modelos viven en la carpeta de Ollama de la máquina, **no se suben al repo** (pesan varios GB).

## Siguiente
- Probar que `gemma3:4b` responde sin internet.
- Armar la ficha de la parcela (`server/llm/ficha.js`).
