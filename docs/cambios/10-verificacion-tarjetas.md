# 10 · Verificación de las tarjetas locales contra fuentes

**Qué:** contrasté los textos de `server/llm/conocimiento.json` (que yo había escrito de memoria) con búsquedas en fuentes confiables: FAO, ICRISAT, USDA/NRCS, Penn State y Univ. de Minnesota (extensión), INIFAP y gob.mx. Cada tarjeta ahora trae `verificado` (`true`, `"parcial"` o `false`) y los enlaces de respaldo en `respaldo`.

**Alcance honesto de la verificación:** leí los **resúmenes de los resultados de búsqueda**, no abrí cada documento completo. Para la demo, alguien debería abrir los enlaces de `respaldo` y confirmar. La app todavía **no muestra** el estado `verificado` al agricultor (solo existe en el archivo).

| Tarjeta | Estado | Qué encontré |
|---|---|---|
| rotación (plagas) | ✅ verificada | FAO: la rotación es de las formas más eficientes de cortar ciclos de plagas y enfermedades. USDA ERS: las plagas necesitan su cultivo huésped de un año a otro. |
| leguminosas | ✅ verificada y **corregida** | Penn State/FAO: parte del nitrógeno fijado se va con la cosecha y parte queda para el siguiente cultivo; **los granos como frijol y garbanzo dejan menos que las leguminosas de forraje**. Mi texto decía que "dejan el suelo con más nitrógeno", se sobrestimaba. |
| sorgo vs sequía | ✅ verificada | Documento ICRISAT/FAO y compendio FAO: el sorgo se considera resistente a la sequía frente al maíz; estudios muestran menor pérdida bajo sequía severa. Ojo: con agua suficiente rinden parecido. |
| maíz y agua | ✅ verificada | FAO: floración y formación del grano son las etapas más sensibles a la falta de agua; para el maíz, de la espiga a los estigmas. |
| materia orgánica | ✅ verificada y **ajustada** | Penn State/UMN: mejora la retención de agua, pero **sobre todo en suelos arenosos**; en arcillosos el efecto es menor y menos consistente. |
| garbanzo | ✅ verificada y **corregida** | ICRISAT/FAO: sensible al encharcamiento, necesita drenaje; relativamente tolerante a la sequía por su raíz. **Quité "clima fresco": no lo pude confirmar.** |
| brócoli | ✅ verificada y **corregida** | Ficha de gob.mx: clima fresco, óptimo ~17 °C, tolera heladas leves antes de formar la cabeza. Infografía de Guanajuato: ~98 % de la superficie es de riego. Datos del SIAP 2023: siembra en primavera-verano y en otoño-invierno. |
| textura del suelo | 🟡 parcial | Arenoso drena rápido y guarda poco (FAO, Penn State). Que la arcilla guarde más agua está respaldado, pero con fuente débil. "Se encharca" es conocimiento general. |
| jitomate | 🟡 parcial | INIFAP Zacatecas: trasplantar después del riesgo de heladas. Riego constante y drenaje: sin fuente directa. |
| trigo y cebada | 🟡 parcial | Solo respaldado por datos del SIAP de Guanajuato 2023 (archivo parcial): sobre todo otoño-invierno con riego. |
| pH, rastrojo, temporal/riego, invernadero, siembra del maíz, plagas | ❌ sin verificar | No se buscaron todavía. |

**Cómo probar:** `npm test` (47 pruebas); en `/probar` pregunta "garbanzo", "brócoli" o "materia orgánica" y compara con los enlaces de `respaldo` del JSON.

**Límites**
- Los resultados de búsqueda son resúmenes; falta la lectura completa de los documentos.
- Varios respaldos son en inglés y de otros países (USDA, Penn State); aplican en principio, pero no son específicos del Bajío.
- No se encontró un dato de INIFAP específico para "clima fresco" del garbanzo ni temperaturas de almácigo de jitomate.
