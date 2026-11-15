# 38. Tarjetas nuevas verificadas y uso de las tarjetas en el modelo

Rama `agente/tarjetas`. Fecha: 15 nov 2026. Modelo: gemma3:4b (Ollama compartido con otros agentes).

## Qué pasaba
Con el set de 45 preguntas abiertas, gemma daba 34/45 útiles. En 15 preguntas decía «No lo sé con mis datos» porque no había ninguna tarjeta que las respaldara. Se negaba en 3 que sí tenían tarjeta (quemar rastrojo, plagas del frijol, ventaja del riego). Además a veces soltaba frases flojas («La erosión frena la erosión») o usaba la tarjeta del maíz para contestar sobre el frijol.

## Qué cambió
- **`server/llm/conocimiento.json`**: pasó de 16 a 48 tarjetas, con **32 nuevas**. También se reescribió `temporal-riego`, que ahora tiene fuente de la SADER.
  - Cada tarjeta trae `fuente: {nombre, url}`, `estados` y `verificado`. Las 16 viejas toman su `fuente` del primer enlace de `respaldo`.
  - Hay **35 tarjetas con `verificado: true`** (23 de las nuevas). El resto quedó como `parcial`, con una nota que explica qué no confirma la página.
  - Ninguna tarjeta trae dosis, productos químicos ni marcas.
- **`server/llm/prompt.js`, en `tarjetas()`**:
  - (a) **Filtro por cultivo**: si la pregunta nombra un cultivo, no entran las tarjetas de otro cultivo. Así una pregunta del frijol ya no recibe la tarjeta del maíz.
  - (b) Las palabras clave cuentan doble en el vector. Con tarjetas largas, el texto diluía el tema.
  - (c) Se ignoran las palabras de la pregunta que ninguna tarjeta usa. Antes «¿Qué plagas le caen al frijol?» no traía ninguna tarjeta por culpa de «caen».
  - (d) La 2.ª tarjeta solo entra si se parece al menos al 60 % de la 1.ª.
  - En el prompt de sistema, una frase cambió: «Si un texto habla del tema aunque use otras palabras (soca = rastrojo, barbechar = mover la tierra), contesta con él y no digas que no sabes.»
- **`server/llm/responder.js`, función `floja()`**: marca una respuesta como floja si tiene una frase de 8 palabras o menos que repite una raíz («La erosión frena la erosión»), o si no agrega ni 3 raíces nuevas a la pregunta y no trae números.
  - Si la respuesta es floja, se usa la **tarjeta tal cual, citada** (es el respaldo que ya existía, con `origen: 'plantilla'`).
  - Si el modelo se niega, se respeta la negativa, porque la tarjeta puede no venir al caso.
- **Set `server/test/eval/modelo-abierto.json`**: pasó de 45 a 80 preguntas (35 nuevas).
  - `conjunto: "prueba"` marca las preguntas 66 a 80, que **no se usaron para ajustar** nada.
  - `camino: "codigo"` marca 10 preguntas que contesta una plantilla a propósito: 21, 27, 31, 39 y 41 (las 5 del cambio 34) y 53, 58, 61, 62 y 77. Esas ya no cuentan como fallas del modelo.
  - Etiquetas corregidas para que coincidan con las tarjetas que existen (se aplicaron igual al «antes» y al «después»):
    - 52 (curvas a nivel), 65 (análisis de suelo) y 69 (abono verde) pasan a `sin_dato`, porque no hay tarjeta verificada de esos temas.
    - 44 (sorgo para el ganado) pasa a `tarjeta`.
    - En la 7 (quemar rastrojo) también vale «nutrientes», que es lo que dice la SADER.
- **`server/scripts/evaluar-modelo.js`**: da el resumen por conjunto, aparta las preguntas `camino=codigo` y cuenta las que «se niega aunque hay tarjeta».
- **Pruebas `server/test/tarjetas.test.js`** (no necesitan Ollama): revisan que cada tarjeta tenga fuente y url https, estados y palabras clave sin acentos. También que no haya dosis ni marcas, que se recupere la tarjeta del cultivo correcto (frijol contra maíz o sorgo), que los temas nuevos encuentren su tarjeta, y cómo se comportan `floja()` y el respaldo. `node --test` da 201/201.

## Resultados (gemma3:4b, en serie, sin internet, parcela de Celaya)
El «antes» es el código de `22c8f0a` corrido sobre las 80 preguntas, recalificado con las mismas etiquetas finales que el «después» (`check()` del script). No cuentan las 10 preguntas `camino=codigo`.

| | Antes | Después |
|---|---|---|
| **Desarrollo** (56): útil | 34/56 (61 %) | 35/56 (63 %) |
| · se niega aunque hay tarjeta | 12 | 1 |
| · respaldo o plantilla | 5 (9 %) | 5 (9 %) |
| **Prueba** (14, no usadas para ajustar): útil | **1/14 (7 %)** | **7/14 (50 %)** |
| · se niega aunque hay tarjeta | 5 | 1 |
| · respaldo o plantilla | 7 (50 %) | 5 (36 %) |
| Solo las 40 originales que llegan al modelo | 32/40 (80 %) | 28/40 (70 %) |
| Tiempo del modelo, medio / p90 | 1.4 / 1.6 s | 1.7 / 2.1 s |
| Tokens de entrada (media) | ~450 | ~600 |

**Cómo leer esto:**
- La ganancia grande está en el **conjunto de prueba** (7 % → 50 %) y en las **negativas con tarjeta** (17 → 2 en total).
- En las 40 preguntas originales se bajó 4. Al compararlas una por una:
  - 3 son cambios de redacción que el regex no acepta. Ejemplos: «se siembran con riego» sin decir «invierno», y «el nitrógeno queda en el suelo» sin «parte».
  - 1 es una negativa nueva (#29, «sorgo o frijol para una tierra pobre»).
  - 1 contestó con el pH de SoilGrids en vez de la tarjeta (#15).
  - Entre una corrida y otra, con temperatura 0 y el Ollama compartido, cambian unas 7 de 56 preguntas. Diferencias de ±3 son ruido.
- El tiempo sube unos 0.3 s porque las tarjetas nuevas son más largas (4 a 5 frases).

**Lo que sigue fallando y no es del modelo.** Estas preguntas las desvía el enrutado (`respuestas.js` o `intencion-ml.js`, que no son míos) a una plantilla que no viene al caso:
- 48 y 68, sobre la canícula: contesta con la lluvia del verano.
- 51, juntar agua de lluvia: contesta con la lluvia del verano.
- 54, gorgojo: contesta con el ingreso del SIAP.
- 59, Monitor de Sequía: contesta con los años secos.
- 71, que se lave la tierra: contesta «no quemes».
- 75, la milpa: contesta con el ingreso del SIAP.
- 76, escoger la semilla criolla: contesta «no tengo variedades».
- 79, encharcamiento: contesta con la lluvia.

Las tarjetas ya existen; solo falta que el enrutado deje pasar esas preguntas al modelo.

## Ejemplos antes / después (respuestas reales)
| Pregunta | Antes | Después |
|---|---|---|
| ¿Qué es la gallina ciega? (prueba) | «No lo sé con mis datos. Pregúntale a un técnico…» | «Es una larva que vive en el suelo y se come las raíces [Base local]. Es una plaga importante en el maíz del Bajío.» |
| ¿Qué pasa si le prendo lumbre al rastrojo? (prueba) | «No lo sé con mis datos…» | «Es mejor aprovechar el rastrojo para nutrir la tierra [Base local]. Si tienes que quemarlo, avisa a tu municipio antes.» |
| ¿A quién le aviso si veo una plaga rara? (prueba) | «No lo sé con mis datos…» | «Llame al teléfono gratuito del SENASICA: 800 987 987 9 y al correo alerta.fitosanitaria@senasica.gob.mx [Base local].» |
| ¿Sirven los silos herméticos? (prueba) | «Solo contesto sobre tu parcela…» (fuera de tema) | «Sí: los silos metálicos herméticos protegen el grano de las plagas sin necesidad de químicos [Base local]…» |
| ¿Cada cuánto tengo que barbechar? | «No lo sé con mis datos…» | «Mover la tierra lo menos posible es uno de los principios [Base local]. Prueba barbechar menos y dejar el rastrojo encima.» |
| ¿Qué es la milpa? | «No lo sé con mis datos…» | «Es una forma de sembrar maíz, frijol y calabaza [Base local]. Es mejor que solo sembrar maíz y da más variedad de alimentos.» |

## Tarjetas nuevas
| id | verificado | fuente | estados |
|---|---|---|---|
| quemar-rastrojo | sí | [SADER, #MiParcelaNoSeQuema](https://www.gob.mx/agricultura/acciones-y-programas/miparcelanosequema) | Guanajuato, Querétaro |
| labranza-conservacion | sí | [CIMMYT, ¿Qué es la agricultura de conservación?](https://www.cimmyt.org/es/noticias/que-es-la-agricultura-de-conservacion/) | Guanajuato, Querétaro |
| suelo-cansado | sí | [CIMMYT, ¿Qué es la agricultura de conservación?](https://www.cimmyt.org/es/noticias/que-es-la-agricultura-de-conservacion/) | Guanajuato, Querétaro |
| erosion | parcial | [CIMMYT, ¿Qué es la agricultura de conservación?](https://www.cimmyt.org/es/noticias/que-es-la-agricultura-de-conservacion/) | Guanajuato, Querétaro |
| composta | sí | [SEMARNAT, Composta casera](https://www.gob.mx/semarnat/articulos/composta-casera-mejora-plantas-y-suelos-a-costos-economicos-con-materiales-accesibles) | Guanajuato, Querétaro |
| estiercol | parcial | [SEMARNAT, Composta casera](https://www.gob.mx/semarnat/articulos/composta-casera-mejora-plantas-y-suelos-a-costos-economicos-con-materiales-accesibles) | Guanajuato, Querétaro |
| cosecha-agua | sí | [SADER, La cosecha de agua en zonas áridas](https://www.gob.mx/agricultura/articulos/cosecha-agua-195001) | Guanajuato, Querétaro |
| salitre | parcial | [IMTA (blog en iagua), Drenaje parcelario para mitigar el ensalitramiento](https://www.iagua.es/blogs/imta/drenaje-parcelario-y-bombeo-energia-alternativa-mitigar-ensalitramiento-suelos) | Guanajuato, Querétaro |
| canicula | sí | [SMN, CONAGUA (Comunicado de prensa 0533-23)](https://www.gob.mx/cms/uploads/attachment/file/842799/Comunicado_de_Prensa_0533-23.pdf) | Guanajuato, Querétaro |
| monitor-sequia | sí | [SMN, CONAGUA](https://smn.conagua.gob.mx/es/climatologia/monitor-de-sequia/monitor-de-sequia-en-mexico) | Guanajuato, Querétaro |
| heladas-tempranas | sí | [INIFAP, Agenda Técnica Agrícola Guanajuato 2017](https://vun.inifap.gob.mx/VUN_MEDIA/BibliotecaWeb/_media/_agendas/4129_4826_Agenda_T%C3%A9cnica_Guanajuato_2017.pdf) | Guanajuato |
| temporal-tardio | sí | [Mesa Técnica Agroclimática Estado de México (SMN, CIMMYT, INIFAP y otros), Boletín Agroclimático No. 2, 2022](https://secampo.edomex.gob.mx/sites/secampo.edomex.gob.mx/files/files/Publicaciones/boletines/Boletin_Agroclimatico_No02.pdf) | Guanajuato, Querétaro |
| frijol-siembra | sí | [INIFAP, Agenda Técnica Agrícola Guanajuato 2017](https://vun.inifap.gob.mx/VUN_MEDIA/BibliotecaWeb/_media/_agendas/4129_4826_Agenda_T%C3%A9cnica_Guanajuato_2017.pdf) | Guanajuato |
| frijol-flores | sí | [INIFAP Campo Experimental Bajío, Rev. Mex. Cienc. Agríc. 2014 (variedad Junio León)](https://cienciasagricolas.inifap.gob.mx/index.php/agricolas/article/download/1125/980) | Guanajuato, Querétaro |
| semilla-pudre | parcial | [INIFAP, Agenda Técnica Agrícola Guanajuato 2017](https://vun.inifap.gob.mx/VUN_MEDIA/BibliotecaWeb/_media/_agendas/4129_4826_Agenda_T%C3%A9cnica_Guanajuato_2017.pdf) | Guanajuato |
| sorgo-cosecha | parcial | [UNAM FES Cuautitlán, tesis 'Evaluación de técnicas para determinar madurez fisiológica del sorgo para los Valles Altos de México' (1983)](https://ru.dgb.unam.mx/bitstream/20.500.14330/TES01000037830/3/0037830.pdf) | Guanajuato, Querétaro |
| sorgo-forraje | sí | [FAO, Cultivos para heno: cereales y gramíneas forrajeras (Cap. V)](https://www.fao.org/4/x7660s/x7660s09.htm) | Guanajuato, Querétaro |
| milpa | sí | [CIMMYT](https://www.cimmyt.org/es/noticias/milpa-un-sistema-fundamental-para-la-seguridad-alimentaria/) | Guanajuato, Querétaro |
| semilla-criolla | parcial | [SADER (Secretaría de Agricultura), 'Maíces nativos: el legado milenario de México'](https://www.gob.mx/agricultura/es/articulos/maices-nativos-el-legado-milenario-de-mexico?idiom=es) | Guanajuato, Querétaro |
| cogollero | sí | [SENASICA, Ficha técnica Gusano cogollero (DGSV-CNRF, 2021)](https://www.gob.mx/cms/uploads/attachment/file/635236/Gusano_cogollero_en_ma_z_y_arroz.pdf) | Guanajuato, Querétaro |
| plagas-frijol | sí | [SENASICA, Ficha técnica Conchuela del frijol (DGSV-CNRF)](https://www.gob.mx/cms/uploads/attachment/file/600966/Conchuela_del_frijol.pdf) | Guanajuato, Querétaro |
| gallina-ciega | parcial | [SENASICA, Ficha técnica CB-04 Hongos entomopatógenos para el combate de la gallina ciega (2023)](https://www.gob.mx/cms/uploads/attachment/file/913439/2023_FT_04_HONGOS_ENTOMOPAT_GENOS_PARA_EL_COMBATE_DE_LA_GALLINA_CIEGA.pdf) | Guanajuato, Querétaro |
| malezas | sí | [INIFAP (S. Alvarado Mendoza), 6° Seminario Puebla: Manejo integrado de maleza en el cultivo de maíz con un enfoque agroecológico](https://www.gob.mx/cms/uploads/attachment/file/677460/Manejo_integrado_de_malezas_en_el_cultivo_de_ma_z_con_enfoque_agroecologico.pdf) | Guanajuato, Querétaro |
| sanidad-vegetal-contacto | sí | [SENASICA, Boletín de Alerta Fitosanitaria Gallina ciega en Guanajuato, No. 17 (julio 2025)](https://dj.senasica.gob.mx//Contenido/files/boletin/2025/gallcie/Guanajuato/julio/BoletinSAF_GallC_PV_Guanajuato2025_No17_4ae7e98c-2812-4699-a0c3-72dd4236af48.pdf) | Guanajuato |
| sanidad-vegetal-contacto-qro | sí | [SENASICA, Boletín de Alerta Fitosanitaria Gusano cogollero en Querétaro, No. 11 (2025)](https://dj.senasica.gob.mx//Contenido/files/boletin/2025/guscog/Querétaro/julio/BoletinSAF_GC_PV_Querétaro2025_No11_eaad1ce8-3fc1-4d5b-9db0-a7d3cf83afef.pdf) | Querétaro |
| monitoreo-plagas | parcial | [Comité Estatal de Sanidad Vegetal de Puebla, 2° Seminario: Monitoreo e incorporación de labores culturales para el control de gusano cogollero y chapulín en maíz](https://www.gob.mx/cms/uploads/attachment/file/675821/2__Seminario_Monitoreo_e_incorporaci_n_de_labores_culturales_para_el_control_de_gusano_cogollero_y_chapul_n_en_el_cultivo_de_ma_z.pdf) | Guanajuato, Querétaro |
| silo-hermetico | sí | [CIMMYT, Tips para el almacenamiento de granos con silos metálicos herméticos (2025)](https://www.cimmyt.org/es/noticias/tips-para-el-almacenamiento-de-granos-con-silos-metalicos-hermeticos/) | Guanajuato, Querétaro |
| gorgojo | sí | [CIMMYT, Tecnologías herméticas ayudan a preservar la diversidad del maíz nativo](https://www.cimmyt.org/es/noticias/tecnologias-hermeticas-ayudan-a-preservar-la-diversidad-del-maiz-nativo/) | Guanajuato, Querétaro |
| secado-grano | sí | [CIMMYT, El papel del secado de grano en el almacenamiento hermético poscosecha](https://www.cimmyt.org/es/noticias/el-papel-del-secado-de-grano-en-el-almacenamiento-hermetico-poscosecha/) | Guanajuato, Querétaro |
| mazorca-podrida | parcial | [CIMMYT, Productores identifican hongos que causan pudrición de mazorca](https://www.cimmyt.org/es/noticias/productores-identifican-hongos-que-causan-pudricion-de-mazorca/) | Guanajuato, Querétaro |
| granos-danados-animales | sí | [CIMMYT, ¿Por qué no se le deben dar granos dañados a los animales?](https://www.cimmyt.org/es/noticias/por-que-no-se-le-deben-dar-granos-danados-a-los-animales/) | Guanajuato, Querétaro |
| pulgon-amarillo | sí | [UAM Xochimilco, reporte de servicio sobre la campaña contra pulgón amarillo del sorgo en Querétaro](https://repositorio.xoc.uam.mx/jspui/retrieve/9c8d5f41-c322-4afd-adc3-b49cfbd1af85/251479.pdf) | Querétaro |

## Lo no verificado o con límites
- **Parcial (9):** `erosion` (la definición y lo de la pendiente no vienen en la página), `estiercol` (la página no dice si va mejor composteado o fresco), `salitre` (el caso es de riego en Sonora), `semilla-pudre` (solo habla de encharcamiento), `sorgo-cosecha` (tesis UNAM de 1983, sin dato de humedad), `semilla-criolla`, `gallina-ciega` (no dice cómo detectarla), `monitoreo-plagas` (es de Puebla) y `mazorca-podrida` (la página no dice que se separen las mazorcas). También quedan parciales `temporal-riego` (la SADER no dice que el otoño-invierno requiera riego) y `cereales-invierno` (su url es la de los datos abiertos del SIAP que usa `scripts/siap-descargar.js`; no es una página leída).
- **Solo Guanajuato:** `heladas-tempranas`, `frijol-siembra` y `semilla-pudre` salen de la Agenda Técnica INIFAP de Guanajuato. `temporal-tardio` es del Estado de México.
- **No se escribieron** (no se encontró fuente legible): curvas a nivel y bordos (los PDF de FAO y CONAZA no se pudieron leer), abonos verdes, análisis de suelo, amaranto, daño por helada y selección de semilla.
- Las tarjetas las redactaron 2 subagentes y este agente. Todos leyeron las páginas con WebFetch, pero **nadie del equipo las ha revisado todavía**.
- El ejemplo del prompt («soca = rastrojo, barbechar = mover la tierra») usa palabras de dos preguntas de desarrollo (46 y 47). Por eso la mejora en desarrollo puede estar inflada; el conjunto de prueba no las usa.
- Las tarjetas hablan de «usted»; el modelo lo pasa a «tú» casi siempre.

## Cómo reproducir
```
cd server && node --test
node scripts/evaluar-modelo.js --json salida.json   # 80 preguntas, unos 2-3 min; resumen TODO / DESARROLLO / PRUEBA
```
