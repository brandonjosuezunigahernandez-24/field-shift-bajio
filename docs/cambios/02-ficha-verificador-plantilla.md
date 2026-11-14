# 02 · Ficha, verificador y plantilla

**Qué:** `server/llm/ficha.js`, `verificador.js`, `plantilla.js`.
**Para qué:** el modelo solo puede usar la **ficha** (datos reales de la parcela). El **verificador** revisa que cada número de la respuesta exista en la ficha. La **plantilla** es la respuesta de respaldo sin modelo.
**Cómo responde:** la plantilla dice, por ejemplo: "En verano suele llover 528.9 mm. De 2000-2024, 6 años fueron secos [NASA POWER]. Tu suelo tiene pH 7.4…".
**Cómo probar:** `cd server && npm test` (`test/llm.test.js`).
**Límites:**
- El verificador solo ve números (los ≤ 3 siempre pasan). **No detecta frases falsas sin números ni números reales en el lugar equivocado** (ver cambio 06).
- La plantilla no depende de la pregunta: siempre da el mismo resumen.
