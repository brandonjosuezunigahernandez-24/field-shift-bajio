# Publicar Field Shift Bajío

Hay dos ligas:

| | Para qué | Dónde | Gemma y voz |
|---|---|---|---|
| **Liga fija** | Que el jurado la vea cuando quiera, aunque la laptop esté apagada | Vercel (front) + Render (servidor) | No |
| **Liga de la demo** | La presentación en vivo, igual que en la laptop | Túnel de Cloudflare desde la laptop | Sí |

**Sin gemma el chat sigue respondiendo.** El código contesta el 97 % de las preguntas con los datos. Las preguntas de tarjeta
(«¿cómo evito el gorgojo?») muestran la tarjeta tal cual, con su fuente, en vez de la redacción de gemma. Gemma (Ollama) y la
voz (Whisper) necesitan una computadora con memoria y procesos que se queden prendidos: Vercel no los tiene.

## A · Liga fija

### 1. Servidor en Render
1. Entra a <https://render.com> con tu cuenta de GitHub.
2. *New* → *Web Service* → elige el repo `field-shift-bajio`.
3. Llena así:
   - **Name:** `field-shift-bajio-api` (la liga queda `https://field-shift-bajio-api.onrender.com`; es la que usa
     `client/vercel.json`. Si el nombre está ocupado, usa otro y cambia esa liga en `client/vercel.json`.)
   - **Root Directory:** `server`
   - **Runtime:** Node · **Build Command:** `npm ci` · **Start Command:** `npm start`
   - **Environment Variables:** `NODE_VERSION` = `22` y `OLLAMA_PRECALENTAR` = `0`
   - **Plan:** Starter (unos 7 USD al mes) para el jurado. El gratis se duerme a los 15 minutos sin visitas y la primera
     visita tarda como un minuto; si usas el gratis, abre la liga un rato antes.
4. *Create Web Service*. Cuando diga *Live*, prueba: `https://field-shift-bajio-api.onrender.com/api/ejemplos` debe mostrar
   las 3 parcelas de ejemplo.

### 2. Página en Vercel
1. Entra a <https://vercel.com> con tu cuenta de GitHub.
2. *Add New…* → *Project* → importa el repo `field-shift-bajio`.
3. **Root Directory:** `client`. Vercel detecta Vite solo (build `npm run build`, salida `dist`).
4. *Deploy*. Queda en `https://<proyecto>.vercel.app`.

`client/vercel.json` manda `/api/...` al servidor de Render. Así la página llama al API igual que en la laptop, sin tocar
código. Las 4 pantallas abren aunque recargues en `/analisis`.

Cada `git push` a `main` vuelve a publicar los dos solos.

### Lo que no funciona igual en la liga fija
- **Botón «Hablar»:** Render tendría que descargar Whisper (~150 MB). En el plan gratis puede quedarse sin memoria y el botón
  da error; lo demás sigue igual.
- **Votos «¿Te sirvió?»:** se guardan en el disco de Render, que se borra al reiniciar.
- **Parcelas nuevas con SoilGrids lento:** igual que en la laptop, puede tardar o usar el suelo guardado del mismo cuadro
  de 250 m.

## B · Liga de la demo (desde la laptop)
1. Una sola vez, instala cloudflared: `winget install Cloudflare.cloudflared`.
2. Prende todo como siempre:
   - Ollama,
   - `cd server && npm start`,
   - `cd client && npm run dev`.
3. En otra terminal: `cloudflared tunnel --url http://localhost:5173`
4. Copia la liga `https://….trycloudflare.com` que imprime y ábrela en cualquier celular o computadora.

La liga cambia cada vez que corres el túnel y deja de funcionar al apagar la laptop o cerrar la terminal.
`client/vite.config.js` ya permite los dominios `.trycloudflare.com`.

## Cómo comprobar que quedó
- **Render:** `/api/ejemplos` muestra las 3 parcelas.
- **Vercel:**
  - abre `/analisis` directo y recarga: no debe dar 404;
  - toca «Celaya, Gto. · maíz, 5 ha» y pregunta «¿Qué me conviene sembrar?».
- **Túnel:** «¿Cómo evito el gorgojo en el maíz guardado?» lo contesta gemma (tarda 1 a 2 s), y «Hablar» funciona.
