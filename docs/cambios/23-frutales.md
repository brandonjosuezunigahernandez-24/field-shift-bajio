# 23 · Frutales de Guanajuato y Querétaro (solo datos del SIAP)

**Qué:** el asistente sabe qué frutales y perennes importan en los dos estados, con datos oficiales. No es una recomendación: los frutales **no** entran al recomendador.
- `server/scripts/frutales-resumen.js`: lee los CSV del SIAP (`server/data/siap_raw/`, 2018-2024, solo ciclo **Perennes**) y escribe `server/data/frutales_resumen.json` (~19 KB). Re-ejecutable: `node scripts/frutales-resumen.js [carpeta_csv]`.
- `server/llm/frutales.js`: funciones puras `topFrutales(estado, n)` y `fichaFrutal(nombre)` (acepta acentos, plural y "nopal tunero").
- `GET /api/frutales?estado=Guanajuato` (sin `estado`: ambos). 404 si el estado no es Guanajuato/Querétaro.
- `server/test/frutales.test.js` (3 pruebas; el total pasa a 83).

**Qué es y qué NO es un frutal (se devuelve siempre en `no_es`):** es perenne, no entra en la rotación de 3 años, no se puede probar un ciclo y decidir después, la inversión inicial es alta y tarda años en producir.

## Datos reales (SIAP, ciclo Perennes)
Se descartó lo marginal (< $10 millones de producción en 7 años) y lo que no es fruta/nopal/hortaliza perenne (alfalfa, agave, pastos, rosa, maguey, árbol de navidad, sábila).
Valor 2024 en millones de pesos, superficie sembrada 2024 (ha), rendimiento 2024 (t/ha), precio rural 2024 ($/t) y cambio de precio 2018-19 a 2023-24 (nominal).

**Guanajuato:** espárrago 4,615 ha, $1,758 M, 9.9 t/ha, $38,445 (+24 %) · fresa 1,994 ha, $1,502 M, 56.3 t/ha, $13,919 (+34 %), 100 % riego, Irapuato 30 % y Tarandacuao 24 % · frambuesa 240 ha, $226 M · arándano 531 ha, $207 M, precio −8 % · tuna 1,803 ha (98 % temporal, Dolores Hidalgo 64 %), $80 M · uva 505 ha (San Miguel de Allende 62 %) · nopalitos 286 ha (Salamanca 56 %) · aguacate 307 ha, $40 M, precio +70 % (León 20 %) · granada, zarzamora, alcachofa, nuez, guayaba, durazno, limón (todos < $15 M al año).
**Querétaro:** espárrago 1,240 ha, $287 M, 4.7 t/ha, $48,976 · uva 530 ha, $71 M (Ezequiel Montes 38 %) · nuez 99 ha, $25 M, $81,794/t (+68 %), Peñamiller 70 % · naranja 240 ha (Arroyo Seco 83 %), $5,037/t · aguacate 173 ha, 3.8 t/ha (en Guanajuato 8.0) · manzana 412 ha, 1.95 t/ha, 93 % temporal, precio −19 % · tuna, nopalitos, guayaba, mango (< $8 M al año).

## Límites
- **Todo agronómico está "no verificado"**: tiempo para producir, costo de establecer, agua y clima. No se hizo búsqueda web ni se inventó nada; la respuesta manda a INIFAP/SADER/un técnico.
- Solo el ciclo "Perennes": un cultivo que el SIAP registra en otros ciclos no aparece (p. ej. fresa en Querétaro no sale).
- "Sembrada" incluye árboles aún sin producir; "cosechada" es lo que ya produce (diferencia visible en aguacate y limón).
- Siniestro ~0 % en casi todos (perennes bajo riego): no significa que no haya riesgo, solo que el SIAP no lo registra. El precio es nominal, sin quitar inflación. El precio es de la parcela (rural), no de venta final.
- Espárrago y alcachofa son hortalizas perennes, no frutales; se incluyen aparte (`tipo`) porque dominan el valor.
- Los datos por municipio son de un solo año (2024) y pueden cambiar de un año a otro.
