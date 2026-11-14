# 09 · Datos del SIAP (rendimiento y precio medio rural)

**Qué:** revisión de si los datos agrícolas oficiales se pueden bajar y usar para el catálogo de cultivos y los costos (Nivel 3-4 de `docs/plan-features.md`). **Todavía no hay código ni datos en el repo**: esto es el resultado de la prueba.

**Hallazgo: sí existen y son útiles.**
- Página oficial: https://nube.agricultura.gob.mx/datosAbiertos/Agricola.php ("Datos Abiertos Agrícolas 1980-2024", enlazada desde la página del SIAP en gob.mx).
- Un CSV **por año con información por municipio** (`Cierre_agricola_mun_AAAA.csv`), con enlaces de la forma `https://nube.agricultura.gob.mx/index.php?view=10AE434F-A2158368-A120BC5A-EDF4AFAA&ANIO=2023`.
- Columnas: año, estado, municipio, **ciclo** (Primavera-Verano, Otoño-Invierno, Perennes), **modalidad** (Riego / Temporal), cultivo, **superficie sembrada, cosechada y siniestrada**, volumen de producción, **rendimiento**, **precio medio rural** y valor de la producción. Codificación ISO-8859 (latin1).
- Con esto se puede medir **riesgo real** (superficie siniestrada) y **ingreso** por cultivo, ciclo y modalidad, y entrenar el modelo de rendimiento según clima del plan `docs/ml-plan.md`.

**Problemas encontrados (importan):**
- **La descarga se corta.** El servidor anuncia 6.7 MB para 2023 pero solo llegaron 1.86 MB; no admite reanudar. El archivo recibido solo traía estados del 1 al 14 (Aguascalientes… Jalisco): **Guanajuato sí, Querétaro no**. Un segundo intento tardó más de 5 minutos. Hay que reintentar con calma y revisar que el archivo llegue completo antes de usarlo.
- Con datos **parciales de Guanajuato 2023** (un solo año) se vio, por ejemplo: maíz de temporal ~214 mil ha sembradas con rendimiento bajo (1.4 t/ha) frente a maíz de riego (9.6 t/ha). **Es un solo año y un archivo incompleto: no sacar conclusiones todavía.**
- "Jitomate" en el SIAP se llama **"Tomate rojo (jitomate)"**; los nombres de cultivo hay que mapearlos a mano.

**Corrección a mis tarjetas locales por estos datos:** había escrito que el brócoli se siembra "casi siempre en otoño-invierno". En Guanajuato 2023 hay prácticamente la misma superficie en primavera-verano (12.7 mil ha) que en otoño-invierno (12.4 mil ha), ambas con riego. Ya está corregido en `conocimiento.json`. Moraleja: **los textos que escribí de memoria deben contrastarse así con datos oficiales**.

**Siguiente paso:** script que descargue 2012-2024 con reintentos, valide que el archivo llegue completo y filtre Guanajuato y Querétaro y los cultivos de `CLAUDE.md`, guardando un JSON chico en `server/data/` (el crudo no se sube al repo).
