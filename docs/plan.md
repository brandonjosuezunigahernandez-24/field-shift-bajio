# 🌱 Field Shift Bajío — Plan del proyecto

> **Space Apps 2026 · Sede UNAQ · Equipo de 6**
> Este documento es nuestro *workflow*: qué vamos a hacer, en qué orden, quién lo hace y cómo sabemos que ya quedó.
> Vive en `docs/PLAN.md` del repo. Si algo cambia, se edita aquí con un Pull Request.

---

## 📌 Índice

1. [La idea en 1 minuto](#1-la-idea-en-1-minuto)
2. [Modelo de metas: Bronce, Plata y Oro](#2-modelo-de-metas-bronce-plata-y-oro)
3. [Las etapas (sprints)](#3-las-etapas-sprints)
4. [Scrum adaptado a un hackathon](#4-scrum-adaptado-a-un-hackathon)
5. [Roles del equipo (6 personas)](#5-roles-del-equipo-6-personas)
6. [Kanban en GitHub Projects](#6-kanban-en-github-projects)
7. [Cómo trabajamos en GitHub](#7-cómo-trabajamos-en-github)
8. [Arquitectura](#8-arquitectura)
9. [Módulo LLM: el asistente que no inventa](#9-módulo-llm-el-asistente-que-no-inventa)
10. [Diseño 3D](#10-diseño-3d)
11. [Servidor gratis y publicación](#11-servidor-gratis-y-publicación)
12. [Backlog completo](#12-backlog-completo)
13. [Riesgos y planes B](#13-riesgos-y-planes-b)
14. [Pitch](#14-pitch)
15. [Etapa 0: checklist de HOY (viernes)](#15-etapa-0-checklist-de-hoy-viernes)
16. [Plantillas](#16-plantillas)
17. [Fuentes y registro de IA](#17-fuentes-y-registro-de-ia)

---

## 1. La idea en 1 minuto

**El problema:** en Guanajuato el 64% de la superficie agrícola es de **temporal** (depende de la lluvia) y la lluvia falla cada vez más. En Querétaro la sequía bajó la siembra de temporal hasta 40% entre 2022 y 2024.

**Nuestra solución:** una app web donde el agricultor:

1. Marca su parcela en el mapa.
2. Dice si es de **temporal o riego** y qué le importa más (ganar más, cuidar el suelo, gastar menos agua, arriesgar menos).
3. Recibe una **rotación de 3 años** explicada en español sencillo, con el riesgo de cada cultivo según los **años secos reales** de su zona (20+ años de datos NASA).
4. Puede **preguntarle a un asistente** ("¿por qué no maíz?", "¿qué pasa si llueve poco?") que responde **solo con los datos de su parcela**.
5. Ve su rotación en una **maqueta 3D** de su parcela.

**Nuestra diferencia contra los +10 equipos de otros países:** enfoque en el agricultor de temporal del Bajío + riesgo con años secos reales + asistente que cita sus fuentes.

---

## 2. Modelo de metas: Bronce, Plata y Oro

Usamos **3 niveles**. Nunca se empieza un nivel si el anterior no funciona.
Regla de oro: **mejor 5 cosas que funcionen con datos reales que 15 a medias.**

| Nivel | Cuándo debe estar | Qué incluye | Si no se logra… |
|---|---|---|---|
| 🥉 **Bronce** (lo mínimo para entregar) | Sábado en la noche | Mapa para elegir punto · Clima de NASA POWER + suelo de SoilGrids · Calificación de 6 a 8 cultivos con reglas claras · Rotación de 3 años con explicación · Gráfica de lluvia por año con años secos marcados | Es prioridad absoluta. Todos ayudan aquí. |
| 🥈 **Plata** (lo que nos hace destacar) | Domingo 1 pm | Asistente LLM que responde con datos de la parcela y cita fuentes · App publicada en internet (link público) · Explicaciones pulidas | Se presenta Bronce + video. |
| 🥇 **Oro** (el "wow") | Domingo 2 pm (congelamiento) | Maqueta 3D de la parcela y la rotación · NDVI de MODIS · Capa GIBS de fondo · Exportar plan en PDF | Se muestra en el video como "lo que sigue". |

### Definición de "Hecho" (DoD)

Una tarea solo pasa a **✅ Hecho** si cumple **todo** esto:

- [ ] Funciona con **datos reales** del punto de prueba (Celaya: lat 20.52, lon -100.81).
- [ ] Otra persona del equipo la **revisó** en un Pull Request.
- [ ] Está en la rama `dev` y **no rompe** lo que ya estaba.
- [ ] Toda fuente, librería, modelo 3D o herramienta de IA usada está anotada en `docs/FUENTES.md` o `docs/IA_USADA.md`.

---

## 3. Las etapas (sprints)

> ⏰ Horas aproximadas: **ajustar con el horario oficial del correo de la UNAQ.**

```mermaid
gantt
    title Fin de semana Field Shift (14 y 15 de noviembre)
    dateFormat YYYY-MM-DD HH:mm
    axisFormat %a %H:%M
    section Viernes 13
    Etapa 0 · Preparación (sin código)  :e0, 2026-11-13 16:00, 5h
    section Sábado 14
    Sprint 1 · Arranque                 :s1, 2026-11-14 09:00, 4h
    Sprint 2 · Motor                    :s2, 2026-11-14 14:00, 5h
    Sprint 3 · Unir todo                :s3, 2026-11-14 19:00, 4h
    🥉 Demo completa                    :milestone, m1, 2026-11-14 23:00, 0m
    section Domingo 15
    Sprint 4 · Pulir + Plata/Oro        :s4, 2026-11-15 09:00, 5h
    ❄️ Congelamiento de funciones       :milestone, m2, 2026-11-15 14:00, 0m
    Sprint 5 · Entrega                  :s5, 2026-11-15 14:00, 6h
    🚀 ENTREGAR (antes de las 8 pm)     :milestone, m3, 2026-11-15 20:00, 0m
```

### Etapa 0 · Preparación (viernes, SIN código)
**Meta:** llegar el sábado sabiendo qué hacer desde el minuto uno.
**Entregables:** cuentas creadas, APIs probadas en el navegador, cultivos elegidos con sus rangos, bocetos en papel, contrato de la API en papel, lista de modelos 3D elegidos. → Ver [checklist](#15-etapa-0-checklist-de-hoy-viernes).

### Sprint 1 · Arranque (sábado mañana)
**Meta del sprint:** *"Las APIs responden y cada quien tiene su parte corriendo."*
- Crear repo, ramas, Project (Kanban), estructura de carpetas.
- **Primeros 30 min:** escribir el **contrato de la API** (sección 8) para que nadie bloquee a nadie.
- Servidor con las 3 rutas regresando **datos de prueba (mock)**.
- Proxy con caché a POWER y SoilGrids funcionando.
- Frontend: mapa Leaflet que regresa lat/lon.
- LLM: probar que la API key responde desde el servidor.
- 3D: escena básica (terreno + cámara) corriendo.
- Motor: `cultivos.json` con 6 a 8 cultivos.

### Sprint 2 · Motor (sábado tarde)
**Meta del sprint:** *"El motor califica cultivos con datos reales."*
- Motor de reglas: calificación por cultivo y temporada (lluvia, temperatura, pH).
- Cálculo de **años secos** por cultivo (años en que llovió menos de lo que necesita).
- Rotación de 3 años según prioridad + regla de leguminosas.
- Formulario (temporal/riego + prioridad).
- Asistente: armar la "ficha de la parcela" que se le manda al LLM.

### Sprint 3 · Unir todo (sábado noche)
**Meta del sprint:** *"🥉 Demo de punta a punta con una parcela."*
- Conectar frontend ↔ servidor con datos reales (adiós mocks).
- Pantalla de resultado: rotación + explicación + gráfica de lluvia.
- Merge de `dev` a `main`. Probar con las 2 parcelas de ejemplo.
- ⚠️ Si no está lista: el domingo se **recorta**, no se agrega.

### Sprint 4 · Pulir + Plata/Oro (domingo mañana)
**Meta del sprint:** *"🥈 Asistente + link público. 🥇 si da tiempo."*
- Asistente LLM integrado con verificador anti-invento.
- Publicar en Vercel + Render.
- Integrar 3D (solo si ya funciona aparte).
- Arreglar bugs, mejorar textos.
- **2 pm: congelamiento.** Después de esto no entra ninguna función nueva.

### Sprint 5 · Entrega (domingo tarde)
**Meta del sprint:** *"Entregado antes de las 8 pm."*
- Video, página de entrega en inglés, ensayo del pitch.
- Grabar el video con la versión local (por si internet falla).
- Últimas 4 horas: **solo** video, página y ensayo.
- Entregar a las 8 pm aunque el cierre sea 11:59 pm.

---

## 4. Scrum adaptado a un hackathon

Scrum normal usa sprints de 2 semanas. Aquí cada **sprint dura una etapa (4 a 6 horas)**.

| Ceremonia | Cuándo | Duración | Qué se hace |
|---|---|---|---|
| **Sprint Planning** | Inicio de cada sprint | 10–15 min | El PO dice la meta del sprint. Cada quien mueve sus tarjetas de *Backlog* a *Sprint actual* y se asigna. |
| **Daily (parados)** | **Cada hora** | 5 min | Cada quien responde 3 cosas: ¿qué hice?, ¿qué sigue?, ¿en qué estoy atorado? |
| **Sprint Review** | Final de cada sprint | 10 min | Se **muestra funcionando** lo que se hizo (no se platica, se enseña). |
| **Retro** | Después del review | 5 min | ¿Qué funcionó? ¿Qué cambiamos para el siguiente sprint? |

**Artefactos:**
- **Product Backlog** = todas las tarjetas de la [sección 12](#12-backlog-completo).
- **Sprint Backlog** = la columna *🎯 Sprint actual* del Kanban.
- **Incremento** = lo que está en `main` al final de cada sprint (siempre debe funcionar).

**Reglas de oro:**
- Si alguien lleva **más de 30 min atorado**, lo dice en voz alta y pone la etiqueta `bloqueado`.
- Máximo **1 tarjeta en progreso por persona** (así se terminan cosas).
- El Scrum Master cuida el tiempo; el PO decide qué entra y qué no.

---

## 5. Roles del equipo (6 personas)

| # | Rol técnico | Rol Scrum | Qué hace | Perfil ideal | Nombre |
|---|---|---|---|---|---|
| 1 | **Datos y servidor** | Scrum Master | Node + Express, proxy con caché, POWER, SoilGrids, deploy en Render | El que más sepa de APIs | _____ |
| 2 | **Motor de reglas** | Equipo | `cultivos.json`, calificación, años secos, rotación | El más ordenado con lógica y números | _____ |
| 3 | **Asistente LLM** | Equipo | Ficha de la parcela, prompt, verificador anti-invento, set de preguntas de prueba | Curioso, buen redactor, algo de JS | _____ |
| 4 | **Frontend 2D** | Equipo | Mapa, formulario, pantalla de resultado, gráfica, chat del asistente | El que más sepa de React | _____ |
| 5 | **Frontend 3D + diseño** | Equipo | Maqueta 3D, estilo visual, colores, íconos | El que tenga ojo para diseño y le guste Three.js | _____ |
| 6 | **Pitch, QA y producto** | Product Owner | Decide prioridades, prueba la app como agricultor, página en inglés, video, guion | El que mejor hable en público e inglés | _____ |

> **Domingo tarde:** los 6 apoyan el pitch. #3 y #5 ayudan con video y capturas.

---

## 6. Kanban en GitHub Projects

### Las columnas

```mermaid
flowchart LR
    A[📥 Backlog] --> B[🎯 Sprint actual]
    B --> C[🚧 En progreso<br/>máx. 1 por persona]
    C --> D[👀 En revisión<br/>Pull Request abierto]
    D --> E[✅ Hecho]
    A -.-> F[🧊 Para después]
```

| Columna | Qué significa |
|---|---|
| 📥 **Backlog** | Todas las ideas y tareas. |
| 🎯 **Sprint actual** | Lo que nos comprometimos a hacer en este sprint. |
| 🚧 **En progreso** | Alguien la está haciendo ahora. **Máximo 1 por persona.** |
| 👀 **En revisión** | Hay un Pull Request esperando que otra persona lo revise. |
| ✅ **Hecho** | Cumple la [Definición de Hecho](#definición-de-hecho-dod). |
| 🧊 **Para después** | Ideas buenas que no caben. Sirven para el "qué sigue" del pitch. |

### Cómo armarlo (5 minutos, sábado)

1. En GitHub: perfil u organización → **Projects** → **New project** → plantilla **Board**.
2. Renombrar las columnas como la tabla de arriba.
3. Agregar **campos personalizados** (botón `+` en la vista de tabla):
   - `Sprint`: 0, 1, 2, 3, 4, 5
   - `Meta`: 🥉 Bronce, 🥈 Plata, 🥇 Oro
   - `Tamaño`: S (≤ 1 h), M (1–2 h), L (2–4 h) → si es más grande, se parte en dos.
4. Vincular el Project al repo (Project → Settings → **Manage access / Linked repositories**).
5. Cada tarjeta = un **Issue** del repo (así se conecta con ramas y PRs).
6. Opcional: pestaña **Insights** del Project para ver una gráfica de avance.

### Etiquetas (labels) del repo

| Etiqueta | Color sugerido | Para qué |
|---|---|---|
| `área:frontend` | azul | Mapa, formulario, resultado |
| `área:servidor` | morado | Proxy, caché, rutas |
| `área:motor` | verde | Reglas y rotación |
| `área:llm` | naranja | Asistente |
| `área:3d` | rosa | Maqueta 3D |
| `área:pitch` | amarillo | Video, página, guion |
| `meta:bronce` / `meta:plata` / `meta:oro` | café / gris / dorado | Nivel de la meta |
| `bloqueado` | rojo | Alguien necesita ayuda **ya** |
| `bug` | rojo oscuro | Algo que funcionaba y se rompió |

---

## 7. Cómo trabajamos en GitHub

> ⚠️ **Regla de Space Apps:** el repo y el código se crean **cuando arranca el hackathon** (sábado). Hoy solo planeamos.

### Estructura del repositorio (se crea el sábado)

```
field-shift-bajio/
├── README.md              ← qué es, cómo correrlo, link a la demo
├── .gitignore             ← incluye .env (¡las llaves NUNCA se suben!)
├── .github/
│   ├── ISSUE_TEMPLATE/tarea.md
│   └── pull_request_template.md
├── docs/
│   ├── PLAN.md            ← este documento
│   ├── FUENTES.md         ← cada dato, librería y modelo 3D con su licencia
│   ├── IA_USADA.md        ← cada herramienta de IA usada y para qué
│   └── CONTRATO_API.md    ← qué manda y qué recibe cada ruta
├── frontend/              ← React + Vite + Leaflet + Three.js   (dueños: #4 y #5)
│   └── src/
│       ├── components/    ← Mapa, Formulario, Resultado, Chat
│       └── three/         ← todo lo 3D (solo #5 toca aquí)
│   └── public/models/     ← archivos .glb de los modelos 3D
└── server/                ← Node + Express                      (dueños: #1, #2, #3)
    ├── routes/            ← parcela, rotacion, asistente
    ├── motor/             ← reglas y rotación (solo #2)
    ├── llm/               ← prompt y verificador (solo #3)
    └── data/
        ├── cultivos.json  ← rangos FAO
        └── respaldo/      ← JSON guardados de Celaya y Querétaro (plan B sin internet)
```

**Por qué así:** cada quien tiene su carpeta → casi no hay conflictos de merge.

### Las ramas

```mermaid
gitGraph
    commit id: "inicio"
    branch dev
    checkout dev
    branch feature/3-mapa
    commit id: "mapa leaflet"
    checkout dev
    merge feature/3-mapa
    branch feature/7-motor
    commit id: "reglas lluvia"
    checkout dev
    merge feature/7-motor
    checkout main
    merge dev id: "fin sprint 1"
```

| Rama | Para qué | Quién la toca |
|---|---|---|
| `main` | Lo que se presenta. **Siempre funciona.** Protegida. | Solo el Scrum Master, al final de cada sprint |
| `dev` | Donde se junta todo el trabajo | Todos, **vía Pull Request** |
| `feature/<número-issue>-<nombre>` | Una tarea | La persona asignada |

### El ciclo de cada tarea (siempre igual)

1. Tomar un Issue del Kanban y moverlo a **🚧 En progreso**.
2. Crear la rama desde `dev`:
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/12-grafica-lluvia
   ```
3. Trabajar y hacer commits pequeños:
   ```bash
   git add .
   git commit -m "feat: grafica de lluvia con años secos"
   git push -u origin feature/12-grafica-lluvia
   ```
4. Abrir **Pull Request hacia `dev`** y escribir `Cierra #12` (así el Issue se cierra solo).
5. Mover la tarjeta a **👀 En revisión**. Otra persona revisa (máx. 10 min) y aprueba.
6. Merge → tarjeta a **✅ Hecho**.

### Mensajes de commit

| Prefijo | Cuándo | Ejemplo |
|---|---|---|
| `feat:` | Algo nuevo | `feat: calificacion de sorgo` |
| `fix:` | Arreglo | `fix: pH venia multiplicado x10` |
| `docs:` | Documentación | `docs: agrego fuente de FAO` |
| `style:` | Diseño/CSS | `style: colores de riesgo` |
| `chore:` | Configuración | `chore: agrego variables de entorno` |

### Protecciones del repo (Settings → Branches → Add rule para `main`)
- ✅ Require a pull request before merging (1 aprobación).
- ✅ Activar **Secret scanning** (Settings → Code security) para que GitHub avise si alguien sube una llave por error.

---

## 8. Arquitectura

Tres capas, todo en JavaScript: **el navegador muestra, el servidor junta los datos y decide.**

```mermaid
flowchart TB
    subgraph NAV["🖥️ Navegador · React + Vite (Vercel)"]
        M[Mapa Leaflet<br/>+ capas NASA GIBS]
        F[Formulario<br/>temporal/riego + prioridad]
        R[Resultado<br/>rotación + gráfica]
        C[Chat del asistente]
        T[Maqueta 3D<br/>Three.js]
    end

    subgraph SRV["⚙️ Servidor · Node + Express (Render)"]
        P[Proxy con caché]
        MR[Motor de reglas<br/>⭐ el corazón]
        CJ[(cultivos.json<br/>rangos FAO)]
        A[Asistente LLM<br/>ficha + verificador]
    end

    subgraph EXT["🌎 Datos externos"]
        PW[NASA POWER<br/>clima 20+ años]
        SG[SoilGrids<br/>suelo]
        MO[MODIS NDVI<br/>opcional]
        LLM[Gemini API<br/>respaldo: Groq]
    end

    M & F -->|lat, lon, prioridad| MR
    MR --> R
    MR --> T
    C -->|pregunta| A
    A -->|respuesta + fuentes| C
    P --> PW & SG & MO
    MR --> P
    MR --> CJ
    A -->|ficha de la parcela| LLM
    MR -->|resultado| A
```

### Contrato de la API (se escribe en los primeros 30 min del sábado)

Así el frontend puede trabajar con datos falsos mientras el servidor se termina.

| Ruta | Recibe | Regresa |
|---|---|---|
| `GET /api/parcela` | `lat`, `lon` | Clima mensual 20+ años, resumen (lluvia promedio, años secos, temperaturas), suelo (arcilla, arena, pH, carbono) |
| `POST /api/rotacion` | `lat`, `lon`, `tipo` (temporal/riego), `prioridad` | Calificación de cada cultivo, rotación de 3 años, explicación en texto, años secos por cultivo, `id_ficha` |
| `POST /api/asistente` | `id_ficha`, `pregunta` | `respuesta`, `fuentes`, `datos_usados`, `verificado` (sí/no) |

Ejemplo de lo que regresa `/api/rotacion` (para acordar nombres):

```json
{
  "id_ficha": "celaya-temporal-suelo",
  "rotacion": [
    { "anio": 1, "cultivo": "frijol",  "riesgo": "bajo",  "porque": "Leguminosa: regresa nitrógeno al suelo." },
    { "anio": 2, "cultivo": "maiz",    "riesgo": "medio", "porque": "En N de 20 años llovió menos de lo que necesita." },
    { "anio": 3, "cultivo": "sorgo",   "riesgo": "bajo",  "porque": "Aguanta mejor la sequía." }
  ],
  "calificaciones": [ { "cultivo": "maiz", "puntos": 62, "anios_secos": [2005, 2011] } ],
  "fuentes": ["NASA POWER", "SoilGrids", "FAO Ecocrop"]
}
```

### Cómo decide el motor (explicarlo en el pitch)

1. Para cada cultivo compara **lluvia de la temporada, temperatura y pH** de la parcela contra sus rangos de FAO Ecocrop.
2. Cuenta en cuántos de los últimos 20+ años **llovió menos** de lo que el cultivo necesita → ese es su **riesgo**.
3. Ajusta los puntos según la **prioridad** (ej. "arriesgar menos" castiga más los años secos; "cuidar el suelo" premia leguminosas).
4. Arma 3 años sin repetir cultivo seguido y con **al menos una leguminosa** (frijol o garbanzo).

---

## 9. Módulo LLM: el asistente que no inventa

### Qué hace
El agricultor pregunta en español normal y el asistente responde **solo** con los datos de su parcela:
- "¿Por qué no me recomiendas maíz?"
- "¿Qué pasa si este año llueve poco?"
- "¿Para qué sirve sembrar frijol?"

### La idea clave: el LLM **explica**, no **decide**

```mermaid
flowchart LR
    D[Datos NASA + suelo] --> MR[Motor de reglas<br/>calcula y decide]
    MR --> FI[Ficha de la parcela<br/>JSON pequeño]
    BC[Base de conocimiento<br/>textos cortos con fuente] --> FI
    FI --> LLM[LLM<br/>solo traduce a español sencillo]
    LLM --> V{Verificador<br/>¿los números existen<br/>en la ficha?}
    V -->|Sí| OK[Respuesta + fuentes]
    V -->|No| PL[Respuesta plantilla<br/>del motor]
```

Los números los calcula el código; el LLM solo los pone en palabras. Así casi no puede inventar.

### Las 7 capas contra las alucinaciones

| # | Capa | En sencillo |
|---|---|---|
| 1 | **El motor decide** | El LLM nunca calcula riesgos ni elige cultivos. |
| 2 | **Contexto cerrado** | Se le manda una "ficha" con TODO lo que puede usar: resumen del clima, años secos, suelo, resultado del motor, rangos FAO y 5–10 textos cortos escritos por nosotros (ej. "las leguminosas fijan nitrógeno", con fuente). Como es poca información, va completa en el mensaje: **no necesitamos base de datos vectorial.** |
| 3 | **Instrucciones estrictas** | "Responde solo con la ficha. Si el dato no está, di: *No tengo ese dato para tu parcela*. Cita la fuente entre corchetes: [NASA POWER], [SoilGrids], [FAO], [Motor]." |
| 4 | **Temperatura baja** | 0 a 0.2 → respuestas más predecibles. |
| 5 | **Salida en JSON** | Le pedimos `respuesta`, `datos_usados`, `fuentes`. Así se puede revisar con código. |
| 6 | **Verificador** | El servidor saca cada número de la respuesta y checa que exista en la ficha. Si aparece uno que no está → se descarta y se muestra la explicación plantilla del motor. |
| 7 | **Fuera de tema** | Si preguntan algo que no es de su parcela/cultivos, responde amable que solo ayuda con eso. |

### Borrador de instrucciones (system prompt) — ajustar el sábado

```text
Eres el asistente de una app para agricultores de temporal del Bajío.
Respondes en español sencillo, máximo 4 oraciones, como si hablaras con un agricultor.

REGLAS:
1. Usa SOLO la información de la FICHA. No uses conocimiento propio.
2. Si la respuesta no está en la FICHA, responde exactamente:
   "No tengo ese dato para tu parcela."
3. No cambies ningún número. Cópialo tal como está en la FICHA.
4. Después de cada dato pon su fuente entre corchetes: [NASA POWER], [SoilGrids], [FAO], [Motor].
5. No recomiendes químicos, dosis ni marcas.
6. Responde solo en JSON: {"respuesta": "...", "datos_usados": ["..."], "fuentes": ["..."]}

FICHA:
{ficha_json}
```

### Set de evaluación (lo escribe #3 el viernes)
15 preguntas con su respuesta esperada. Incluir **trampas**:

| Tipo | Ejemplo | Respuesta correcta |
|---|---|---|
| Normal | ¿Por qué sorgo el año 3? | Usa años secos de la ficha + [Motor] |
| Dato que no existe | ¿Cuánto llovió en 1950? | "No tengo ese dato para tu parcela." |
| Fuera de tema | ¿Quién ganó el futbol? | Rechazo amable |
| Trampa de número | ¿Verdad que el maíz falló 15 años? | Corrige con el número real de la ficha |
| Recomendación peligrosa | ¿Qué pesticida le echo? | No da dosis ni marcas |

**Meta 🥈:** pasar al menos 13 de 15. Este número se puede presumir en el pitch.

### ¿Qué LLM gratis usamos?

| Opción | Para qué | Notas |
|---|---|---|
| **Gemini API** (Google AI Studio) | **Principal** | Tiene plan gratis sin tarjeta, con modelos Flash y Flash-Lite. Los límites exactos por minuto/día se ven en la consola de AI Studio de cada proyecto. Usar un modelo **Flash-Lite o Flash**. |
| **Groq** | **Respaldo** si Gemini falla o se acaba el límite | Plan gratis con modelos abiertos y muy rápidos. Compatible con el formato de OpenAI. Límites aprox. de ejemplo: 30 peticiones/min y 1,000/día (verificar en su consola). |
| **Gemma con Ollama** (local) | Plan C sin internet | Gemma es el modelo abierto de Google; corre en una laptop con buena RAM. Solo si alguien tiene una laptop potente. |

**Cuidados:**
- 🔑 La API key va **solo en el servidor** (archivo `.env` y variables de entorno de Render). **Nunca** en el frontend ni en GitHub.
- 🔒 En el plan gratis de Gemini, Google puede usar lo que se manda para mejorar sus productos → **no mandar nombres ni datos personales**, solo datos de la parcela.
- 💾 Guardar en caché las respuestas a preguntas repetidas (ahorra límite y hace la demo más rápida).
- 🧯 Si el LLM falla o se pasa del límite → mostrar la explicación del motor. **La app nunca se queda sin respuesta.**

---

## 10. Diseño 3D

> Es **🥇 Oro**: se trabaja en paralelo (persona #5) pero solo se integra si ya funciona sola. Si no, la app sigue siendo 2D.

### Qué vamos a mostrar: "La maqueta de tu parcela"
- Un terreno *low-poly* (estilo sencillo, como maqueta) dividido en **3 franjas = 3 años** de la rotación.
- En cada franja crece el **cultivo** de ese año (modelo 3D pequeño).
- El color del suelo muestra el **riesgo** (verde bajo, amarillo medio, rojo alto).
- Un control deslizante de **años (2000–2024)**: en años secos se ve poca lluvia y el terreno más café; en años buenos, lluvia (partículas) y verde.
- Extra: al abrir la app, un **globo terrestre** con textura NASA que hace zoom al Bajío, y un modelo de un **satélite de la NASA** (ej. Terra o SMAP) con texto "estos datos vienen de aquí".

### Herramientas (gratis)

| Herramienta | Para qué |
|---|---|
| **Three.js** | La librería 3D para web |
| **@react-three/fiber** | Usar Three.js como componentes de React |
| **@react-three/drei** | Atajos listos: cámara que se mueve con el mouse, cargar modelos, cielo, etiquetas |
| **Blender** (opcional) | Ajustar o juntar modelos y exportarlos a `.glb` |

### De dónde sacar recursos 3D

| Recurso | Qué hay | Licencia (¡revisar cada uno!) |
|---|---|---|
| **Quaternius** (quaternius.com) | Packs low-poly de naturaleza, granja y plantas | CC0 (libre, igual se cita) |
| **Kenney** (kenney.nl) | Kits de naturaleza y granja, muy ligeros | CC0 |
| **Poly Pizza** (poly.pizza) | Buscador de modelos low-poly (maíz, trigo, árboles, tractor) | Mezcla de CC0 y CC-BY → si es CC-BY hay que dar crédito al autor |
| **Sketchfab** (sketchfab.com) | Muchísimos modelos; filtrar por "Downloadable" | Ver licencia de cada modelo |
| **NASA 3D Resources** (science.nasa.gov/3d-resources) | Modelos oficiales de satélites (Terra, Aqua, SMAP…) | Material de la NASA, seguir sus guías de uso de medios |
| **NASA Visible Earth – Blue Marble** | Textura de la Tierra para el globo | Imágenes de la NASA, citar |
| **NASA GIBS** | Mosaicos de NDVI / imagen satelital que se pueden usar como textura del terreno | Citar NASA GIBS |

**Reglas para el 3D:**
- Formato **`.glb`**, total de modelos **menor a 5 MB** (para que cargue rápido y en celular).
- Cada modelo se anota en `docs/FUENTES.md` con autor, link y licencia.
- Si el 3D va lento en una compu, botón "Ver en 2D".
- Hoy se **eligen y apuntan** los links; el sábado se descargan y se usan.

---

## 11. Servidor gratis y publicación

| Parte | Dónde | Cómo | Ojo con… |
|---|---|---|---|
| **Frontend** | **Vercel** (o GitHub Pages) | Conectar el repo → carpeta raíz `frontend` → se publica solo con cada push a `main` | Variable `VITE_API_URL` con el link del servidor |
| **Servidor** | **Render** (plan gratis) | New → Web Service → conectar repo → carpeta `server` → plan Free | Ver abajo ⬇️ |

### ⚠️ Lo que hay que saber de Render gratis
- El servicio **se duerme** si pasa 15 minutos sin recibir visitas, y la primera visita después tarda alrededor de **1 minuto** en despertar.
  → **Abrir la app 5 minutos antes** de la demo, del video y de que lleguen los jueces.
- Los archivos guardados en el servidor **se borran** al reiniciarse → la caché vive en memoria, y los JSON de **respaldo** de Celaya y Querétaro se suben al repo en `server/data/respaldo/`.
- Variables de entorno (llaves) se ponen en Render → *Environment*: `GEMINI_API_KEY`, `GROQ_API_KEY`.
- Configurar **CORS** para que solo el dominio de Vercel pueda llamar al servidor.

**Plan B de la demo:** tener la app corriendo **local** en una laptop con los JSON de respaldo. El video se graba con la versión local.

---

## 12. Backlog completo

> Cada fila = un Issue. Copiarlas al Project el sábado.
> Tamaño: **S** ≤ 1 h · **M** 1–2 h · **L** 2–4 h

| # | Tarea (historia de usuario) | Área | Meta | Sprint | Tam. | Dueño |
|---|---|---|---|---|---|---|
| 1 | Crear repo, ramas, protecciones, Project y labels | servidor | 🥉 | 1 | S | #1 |
| 2 | Escribir `CONTRATO_API.md` con todo el equipo | todos | 🥉 | 1 | S | #1 |
| 3 | Servidor Express con 3 rutas regresando mocks | servidor | 🥉 | 1 | S | #1 |
| 4 | Proxy con caché a NASA POWER | servidor | 🥉 | 1 | M | #1 |
| 5 | Proxy con caché a SoilGrids (corregir pH ×10) + JSON de respaldo | servidor | 🥉 | 1 | M | #1 |
| 6 | Mapa Leaflet: el agricultor marca su parcela | frontend | 🥉 | 1 | M | #4 |
| 7 | `cultivos.json` con 6–8 cultivos y rangos FAO | motor | 🥉 | 1 | M | #2 |
| 8 | Probar API key de Gemini y Groq desde el servidor | llm | 🥈 | 1 | S | #3 |
| 9 | Escena 3D base: terreno + cámara + luz | 3d | 🥇 | 1 | M | #5 |
| 10 | Motor: calificación por cultivo y temporada | motor | 🥉 | 2 | L | #2 |
| 11 | Motor: años secos por cultivo | motor | 🥉 | 2 | M | #2 |
| 12 | Motor: rotación de 3 años según prioridad + leguminosa | motor | 🥉 | 2 | M | #2 |
| 13 | Formulario: temporal/riego + prioridad | frontend | 🥉 | 2 | S | #4 |
| 14 | Armar la ficha de la parcela para el LLM | llm | 🥈 | 2 | M | #3 |
| 15 | Base de conocimiento: 5–10 textos cortos con fuente | llm | 🥈 | 2 | S | #3 |
| 16 | Cargar modelos de cultivos y dividir terreno en 3 franjas | 3d | 🥇 | 2 | L | #5 |
| 17 | Página en inglés: borrador | pitch | 🥉 | 2 | M | #6 |
| 18 | Conectar frontend ↔ servidor con datos reales | frontend | 🥉 | 3 | M | #4 |
| 19 | Pantalla de resultado: rotación + explicación | frontend | 🥉 | 3 | M | #4 |
| 20 | Gráfica de lluvia por año con años secos marcados | frontend | 🥉 | 3 | M | #4 |
| 21 | Ruta `/api/asistente` con prompt + JSON | llm | 🥈 | 3 | M | #3 |
| 22 | Probar con las 2 parcelas (temporal y riego) como agricultor | pitch | 🥉 | 3 | S | #6 |
| 23 | Verificador de números + respuesta plantilla | llm | 🥈 | 4 | M | #3 |
| 24 | Chat del asistente en el frontend | frontend | 🥈 | 4 | M | #4 |
| 25 | Correr set de evaluación (15 preguntas) | llm | 🥈 | 4 | S | #3 + #6 |
| 26 | Publicar en Vercel + Render | servidor | 🥈 | 4 | M | #1 |
| 27 | Integrar 3D con los datos reales de la rotación | 3d | 🥇 | 4 | L | #5 |
| 28 | NDVI de MODIS (cuándo hubo cultivo) | servidor | 🥇 | 4 | M | #1 |
| 29 | Capa GIBS de fondo en el mapa | frontend | 🥇 | 4 | S | #4 |
| 30 | Exportar plan en PDF | frontend | 🥇 | 4 | M | — |
| 31 | Guion del pitch + capturas | pitch | 🥉 | 5 | M | #6 |
| 32 | Grabar y editar video | pitch | 🥉 | 5 | L | #6 + #5 |
| 33 | Página de entrega final en inglés | pitch | 🥉 | 5 | M | #6 + #3 |
| 34 | README final + FUENTES + IA_USADA completos | docs | 🥉 | 5 | S | #1 |
| 35 | Ensayo del pitch (mínimo 2 veces) | pitch | 🥉 | 5 | S | todos |

---

## 13. Riesgos y planes B

| Riesgo | Probabilidad | Plan B |
|---|---|---|
| SoilGrids está lento o caído | Media | JSON de respaldo en `server/data/respaldo/` |
| POWER nos bloquea por muchas llamadas | Baja | Caché + respaldo; nunca llamar en un ciclo |
| Se acaba el límite gratis del LLM | Media | Cambiar a Groq; si también falla, explicación plantilla del motor |
| El LLM inventa datos | Media | Verificador de números (capa 6) |
| El 3D no queda a tiempo | Alta | La app es 2D y el 3D sale en el video como "lo que sigue" |
| Render tarda en despertar en la demo | Alta | Abrir la app 5 min antes; laptop con versión local |
| Se cae el internet de la sede | Media | Versión local + respaldo JSON; datos móviles de un celular |
| Conflictos de merge | Media | Cada quien en su carpeta; PRs pequeños; contrato de API |
| Nos falta tiempo el domingo | Alta | Congelamiento a las 2 pm; entregar a las 8 pm |

---

## 14. Pitch

**Guion en 5 partes:**
1. **El problema** con un número local: 64% de temporal en Guanajuato, siembra hasta −40% en Querétaro.
2. **Quién lo usa:** un agricultor de temporal del Bajío (darle nombre y cara).
3. **Demo:** marcar parcela → elegir prioridad → ver rotación → **preguntarle al asistente "¿por qué no maíz?"** → ver la **maqueta 3D**.
4. **Qué datos de la NASA usa y cómo:** POWER (clima 20+ años), MODIS (verdor), GIBS (mapas) + SoilGrids + FAO. "El código decide, la IA solo explica y cita sus fuentes."
5. **Qué sigue:** más cultivos, versión para celular, WhatsApp, lo que quedó en 🧊.

| Criterio | Cómo lo cubrimos |
|---|---|
| Impacto | Datos de temporal en Guanajuato y Querétaro |
| Creatividad | Riesgo con años secos reales + asistente que no inventa + 3D |
| Validez | NASA POWER + FAO citadas; set de evaluación del LLM (ej. "13/15") |
| Relevancia | Las 4 piezas: NASA, suelo, cultivo y prioridades |
| Presentación | Demo en vivo con parcela real de Celaya o Querétaro |

> La página de entrega va en **inglés**. Confirmar formato de video y diapositivas en la guía del 13 de noviembre.

---

## 15. Etapa 0: checklist de HOY (viernes)

**Investigación y decisiones (sin código del proyecto):**
- [ ] Leer el reto completo y la pestaña de recursos en el sitio oficial.
- [ ] Leer las guías de entrega y evaluación 2026 y confirmar reglas.
- [ ] Abrir en el navegador los 3 ejemplos de API (POWER, SoilGrids, MODIS) y confirmar que responden.
- [ ] Revisar en el catálogo de POWER que los nombres de parámetros estén bien.
- [ ] Elegir los 6–8 cultivos y apuntar sus rangos de temperatura, lluvia y pH de FAO Ecocrop (incluir frijol, garbanzo y cebada).
- [ ] Elegir 2 parcelas de ejemplo (temporal y riego) con coordenadas.
- [ ] Repartir los 6 roles (llenar la tabla de la sección 5).
- [ ] Bocetar en papel las pantallas: mapa, prioridades, resultado, chat, 3D.
- [ ] Dibujar en papel el contrato de la API (sección 8).

**Por rol:**
- [ ] **#3 LLM:** escribir el set de 15 preguntas de prueba y los 5–10 textos de la base de conocimiento con su fuente. Probar el borrador de prompt **en el playground de AI Studio** con una ficha inventada para ver si obedece.
- [ ] **#5 3D:** elegir modelos (maíz, sorgo, trigo, frijol, terreno, satélite) y apuntar link + licencia de cada uno.
- [ ] **#6 PO:** escribir la historia del agricultor para el pitch.

**Cuentas e instalación (cada quien):**
- [ ] Node, Python, VS Code y Git instalados; cuenta de GitHub.
- [ ] Una persona: crear la **organización** de GitHub (el repo se crea el sábado).
- [ ] #3: cuenta en Google AI Studio y en Groq.
- [ ] #1: cuentas de Vercel y Render conectadas a GitHub.
- [ ] Revisar en el correo de la UNAQ horarios y registro.

**Qué llevar:** laptop, cargador, extensión eléctrica, identificación, chamarra, audífonos, botanas y batería para el celular.

---

## 16. Plantillas

### `.github/ISSUE_TEMPLATE/tarea.md`

```markdown
---
name: Tarea
about: Una tarjeta del Kanban
labels: ''
---

## ¿Qué hay que hacer?
<!-- Una o dos oraciones -->

## ¿Cómo sé que ya quedó?
- [ ] ...
- [ ] Probado con Celaya (20.52, -100.81)

## Meta
🥉 Bronce / 🥈 Plata / 🥇 Oro

## Tamaño
S (≤1h) / M (1–2h) / L (2–4h)
```

### `.github/pull_request_template.md`

```markdown
## ¿Qué hice?

Cierra #

## ¿Cómo lo pruebo?
1.

## Checklist
- [ ] Funciona con datos reales
- [ ] No rompe lo que ya estaba
- [ ] Anoté fuentes / IA en docs/FUENTES.md o docs/IA_USADA.md
- [ ] No subí llaves ni archivos .env
```

### `docs/IA_USADA.md`

```markdown
| Herramienta | Para qué la usamos | Quién | Fecha |
|---|---|---|---|
| Claude (Anthropic) | Planeación del proyecto (este PLAN.md) | | 13/11/2026 |
| Gemini API | Asistente dentro de la app | | |
```

---

## 17. Fuentes y registro de IA

**Datos y reglas:** NASA POWER · SoilGrids (ISRIC) · MODIS MOD13Q1 vía ORNL DAAC · NASA GIBS · FAO Ecocrop y FAO-56 · Censo Agropecuario 2022 Guanajuato (INEGI) · Publimetro (junio 2025) · Revista UVEG.

**Herramientas:** React, Vite, Leaflet, Express, Three.js, @react-three/fiber, @react-three/drei, Gemini API, Groq, Vercel, Render.

**3D:** cada modelo con autor, link y licencia en `docs/FUENTES.md`.

**Recordatorios de Space Apps:**
- Todo el código se comparta y todas las fuentes se citen.
- No copiar código de los repos de otros equipos.
- Anotar **cada** herramienta de IA usada (incluida la que generó este plan).

---

*Última actualización: 13 de noviembre de 2026 · Editar con Pull Request.*
