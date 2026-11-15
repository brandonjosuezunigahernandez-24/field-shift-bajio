# 30. Gráficas según la pregunta

La respuesta de `POST /api/asistente` (y el `final` de `/stream`) ahora puede traer un campo `graficas`: hasta 3 gráficas o tablas
con datos reales para que el cliente las dibuje. Si no hay nada que mostrar, el campo no viene.

## Esquema (fijo)

```js
graficas: [
  { tipo: "barras" | "linea", titulo, unidad, etiquetas: [..], series: [{ nombre, valores: [..] }], nota?, fuente },
  { tipo: "tabla", titulo, columnas: [..], filas: [[..], [..]], nota?, fuente },
]
```

- `valores` tiene el mismo largo que `etiquetas`. Si una serie no tiene dato en un año, va `null` (no se inventa).
- `fuente` siempre: `SIAP`, `NASA POWER`, `Open-Meteo` o `Modelo entrenado`.

## Qué pregunta devuelve qué

| Pregunta (ejemplo) | Gráficas |
|---|---|
| ¿Cuánto maíz puedo producir? | Rendimiento por año (t/ha, temporal y/o riego) · tabla «Tus X ha: año malo / promedio / año bueno» (si dio hectáreas) · % de superficie dañada por año |
| ¿A cómo se vende el maíz? | Precio medio rural por año · ingreso bruto por hectárea · rendimiento por año |
| ¿Qué tan riesgoso es el maíz? / si llueve poco | Daño estimado en año seco / normal / lluvioso (modelo) · % dañado por año · rendimiento |
| ¿Recomiendas plantar maíz este año? | Daño estimado por escenario · probabilidad de año malo · % dañado por año |
| Maíz de riego o temporal | Rendimiento, % dañado y precio por año, riego y temporal como dos series |
| ¿Maíz o sorgo? | Ingreso bruto por hectárea de los dos · rendimiento por año de los dos |
| ¿Dónde se siembra más maíz? | Tabla de municipios con más superficie (por estado) |
| Maíz en dos ciclos | Superficie 2024 primavera-verano contra otoño-invierno |
| Precio, rendimiento o riesgo de otro cultivo del SIAP (sorgo, frijol…) | Rendimiento, % dañado y precio por año; primero la que pidió |
| Lo mismo, pero contestado por el modelo de lenguaje | Las mismas tres del SIAP, si la pregunta nombra un cultivo con datos |
| ¿Cuánto llueve? / ¿qué mes llueve más? | Lluvia media por mes (12 barras) · lluvia de verano por año con la línea de año seco |
| Años secos / ¿cuánto llovió en 2023? | Lluvia de verano por año con la línea de año seco |
| ¿Está lloviendo menos que antes? | Lo mismo, en línea |
| Heladas | Años con helada en cada mes · hora más fría promedio por mes |
| Calor / radiación / humedad | Una serie por mes |
| ¿Cuándo siembro? | Lluvia media por mes |
| Pronóstico de la semana | Lluvia por día (mm) · temperaturas máxima y mínima (línea) |
| Frutales | Tabla con superficie, rendimiento, % de riego y precio por estado · tabla de municipios principales |
| ¿Qué me conviene sembrar? | Puntaje por cultivo · ingreso bruto en 3 años: caso malo, esperado y bueno |
| Varias parcelas | Ingreso de todo el terreno en 3 años: repartido contra «lo mismo en todas» |

## Ejemplo real (Celaya, 5 ha de temporal, sin internet)

Pregunta: «¿Cuánto maíz puedo producir en mi parcela?»

```json
{
  "respuesta": "El maíz de temporal rinde en promedio 1.65 t por hectárea en Guanajuato.\nDe 2018 a 2024 rindió entre 1.39 t/ha (2023) y 1.82 t/ha (2024)... Con tus 5 ha sacarías unas 8.3 t (entre 7 t en un año malo y 9.1 t en uno bueno)...",
  "graficas": [
    { "tipo": "barras", "titulo": "Maíz: rendimiento por año", "unidad": "t/ha",
      "etiquetas": ["2018","2019","2020","2021","2022","2023","2024"],
      "series": [{ "nombre": "Temporal", "valores": [1.77,1.46,1.52,1.76,1.79,1.39,1.82] }], "fuente": "SIAP" },
    { "tipo": "tabla", "titulo": "Tus 5 ha: toneladas de maíz", "columnas": ["","Año malo","Promedio","Año bueno"],
      "filas": [["De temporal",7,8.3,9.1]], "nota": "Promedios del estado por hectárea sembrada, no de tu parcela.", "fuente": "SIAP" },
    { "tipo": "barras", "titulo": "Maíz: superficie dañada por año", "unidad": "% de la superficie sembrada",
      "etiquetas": ["2018","2019","2020","2021","2022","2023","2024"],
      "series": [{ "nombre": "Temporal", "valores": [0.8,7.7,2.4,0,0,26.9,0] }],
      "nota": "Incluye sequía, heladas, plagas y otras causas.", "fuente": "SIAP" }
  ]
}
```

Pregunta: «¿Cuáles fueron los años secos?» (texto: «Fueron 6 años secos de 25… menos de 423.2 mm»)

```json
{ "tipo": "barras", "titulo": "Lluvia de junio a septiembre por año", "unidad": "mm",
  "etiquetas": ["2000","2001","2002", "..."],
  "series": [{ "nombre": "Lluvia de verano", "valores": [361,571.4,569.3, "..."] },
             { "nombre": "Año seco si es menos de", "valores": [423.2,423.2,423.2, "..."] }],
  "nota": "Un año es seco si llovió menos del 80 % de lo normal (la mediana).", "fuente": "NASA POWER" }
```

## Cómo está hecho

- `server/llm/graficas.js`: funciones puras. Leen los `datos` que ya arma cada plantilla (`respuestas.js`, `maiz.js`), el resultado
  del recomendador o del modelo de riesgo, y la climatología. Para el SIAP usan la misma serie que el texto
  (`serie()` de `maiz.js` para el maíz; los mismos grupos de `cropFacts()` para los demás cultivos), así los números coinciden.
- `routes/asistente.js`: solo se agregó `...conGraficas(...)` a cada respuesta que ya traía datos. El texto no cambió.
- `test/graficas.test.js`: 11 pruebas; en 9 tipos de pregunta comprueban que los números de la gráfica aparecen en el texto.

## Límites

- El maíz usa toneladas por hectárea **sembrada** (cuenta pérdidas); los otros cultivos usan el rendimiento del SIAP por hectárea
  **cosechada**. Cada gráfica usa la misma medida que su texto.
- Son datos del estado (SIAP) o de una zona amplia (NASA POWER), no medidos en la parcela.
- El modelo de lenguaje puede decir números distintos a la gráfica: la gráfica es dato real, su texto no siempre.
- Suelo, insumos, costos, plagas, semillas y ciclo del maíz no traen gráfica (no hay serie que mostrar).
- Sin pronóstico (sin internet) no hay gráfica de la semana.
