# Space Apps 2026 · Project page text (copy and paste)

Texto para el formulario del proyecto en spaceappschallenge.org (Mi equipo → Project → Edit), campo por campo.
Todo va en inglés, como piden las reglas. Lo que está entre `[corchetes]` lo llena el equipo antes de enviar.

Antes de dar «Submit for Judging», antes del **domingo 15 de noviembre a las 23:59 (hora de Querétaro)**:
- [ ] Todos los integrantes, máximo 6, registrados en la sede de Querétaro (ninguno en lista de espera).
- [ ] Demo: un video de **30 segundos o menos**, con subtítulos en inglés si se habla español, **o** **7 diapositivas o
      menos** en inglés. Link público sin login, probado en una ventana privada.
- [ ] El repo es público (ya lo es) y `main` tiene el README en inglés.
- [ ] Sin logos de la NASA en el video ni en las diapositivas, y sin personas menores de 18 años.
- [ ] Las dos casillas finales del formulario marcadas.

---

## Project Name

Field Shift Bajío

## High-Level Project Summary

Field Shift Bajío helps rain-fed farmers in central Mexico choose crop rotations using the real dry years of their own
plot instead of an average. A farmer draws the plot on a satellite map and says what matters most: earning more, caring
for the soil, using less water or risking less. The tool then compares three rotations side by side: what they sow today
(usually maize every year), the best one for their goal, and the best one for another goal.

Each comparison uses 26 years of NASA POWER rain at the plot, SoilGrids soil, official Mexican yields and prices (SIAP)
and crop requirements. Each rotation says why it was suggested, what evidence supports it, what it improves, what we do
not know and what a local agronomist should review. In the Bajío, 63.9 % of Guanajuato's farmland depends on rain alone,
and one failed summer can cost a family its harvest. The tool supports, never replaces, the farmer's judgment.

## Link to Project Demo

[link público al video de 30 s o a las 7 diapositivas]

## Link to Final Project

https://github.com/brandonjosuezunigahernandez-24/field-shift-bajio

## Detailed Project Description

**What it does.** Field Shift Bajío is a web app, in Spanish for its users, with four screens.

1. *Your plot.*
   - The farmer finds their village, then draws the plot on Esri satellite imagery. They can tap the corners, walk them
     with the phone's GPS, or tap once inside the field and let the app propose the outline.
   - The plot rises in 3D relief from NASA SRTM elevation.
   - Cards open one at a time, and each one moves the map: the weather right now; 26 years of rain from NASA POWER with
     the dry years marked; the soil from SoilGrids; and the region's vegetation (MODIS NDVI) and root-zone soil
     moisture (SMAP) from NASA GIBS.
   - A few plain questions follow: rain-fed or irrigated, the main goal, the last crop and the one in the ground now.
2. *3D simulator.*
   - **Three rotations compared side by side**, including today's:
     - seasons without enough rain, with an uncertainty range;
     - seasons with damaging frost or heat;
     - legume seasons;
     - repeated crop families;
     - water the crops need;
     - gross income.
   - Choosing a rotation and a year shows that crop growing on the farmer's plot.
   - A year slider replays 2000–2025 and shows whether each year's real rain would have been enough.
   - A card called "What we don't know" lists the limits of the data.
3. *AI assistant*, by text or voice. It answers "what should I sow?" with the same engine and the same numbers as
   the screen.
4. *Try a crop*: any crop against the plot's 26 real years, sown in June or July.

**How it works.** The plot's center is sent to a Node/Express server. The server gets monthly NASA POWER data
(2000–2025) for that point, SoilGrids soil (down to 1 m, with the soil type) and the SIAP state data.

A rule engine scores each crop with three checks:
- the temperature of its cycle months against its range;
- the rain of its cycle against its needs (rain-fed only);
- the soil pH.

It counts the **real years in which the rain of the crop's own cycle fell below its minimum**, trying June and July
sowing. It then weights the farmer's goal.

The rotation rules:
- no crop family in back-to-back seasons;
- at least one legume in three years;
- winter crops only with irrigation;
- no repeat of the family the farmer just grew.

Uncertainty is part of the answer:
- Each risk is shown with its 90 % Wilson interval for 26 years ("12 of 26 years, it could be 31 % to 62 %").
- Each rotation shows how much the result changes if a crop needed 10 % less or more rain.
- The notes also cover the resolution of NASA POWER and SoilGrids, and that SIAP prices are state averages.

The assistant never makes its own recommendation. It calls the same engine. A local model (Gemma 3 with Ollama) only
words some answers, and a checker rejects any number that is not in the plot's data.

**Evidence that it is grounded.** In Celaya, NASA POWER summer rain against SIAP losses in Guanajuato (2018–2024)
correlates at −0.70 for maize and −0.79 for beans: less rain, more loss.

We also trained a small ridge regression on 64 municipalities (1,018 rows of SIAP losses × NASA POWER summer climate).
We tested it by leaving whole years out and compared it against each municipality's historical average:
- **Querétaro maize:** 29 % less error than the average.
- **Guanajuato maize:** barely better, so it is labeled low confidence.
- **Beans and sorghum:** no model beat the average, so none is used.

The code has 333 server tests and 60 client tests that run offline on stored real responses.

**Benefits.**
- A farmer sees, in their own words and numbers, what switching from maize every year to a rotation with beans and
  sorghum would have meant in their real dry years. In Celaya that is 46 % of seasons short of rain versus 15 %, with
  two legume seasons that leave nitrogen in the soil.
- The comparison with today's rotation makes the trade-offs visible, including income from official data.
- The tool works offline with stored data for the demo plots.
- It speaks plain Spanish, and every number says where it came from.

**What we hope to achieve.** A tool that extension agents and farmer groups in the Bajío can use at the field's
edge, and that can be extended to other rain-fed regions with their own crops and markets.

**Tools.**
- **Code:** JavaScript; React, Vite and react-router; Node.js and Express.
- **Maps and 3D:** MapLibre GL JS, three.js and @react-three/fiber, Chart.js, Bootstrap, and Blender (scripted 3D crop
  models).
- **AI inside the app:** Ollama with Gemma 3, and transformers.js with Whisper.
- **Development:** GitHub, and Claude Code as a coding assistant.

**Limitations we state openly.**
- The crop requirements come from FAO (Ecocrop and Training Manual No. 3) but are general ranges for each species, not
  local varieties; the water need of chickpea and broccoli is still approximate.
- NASA POWER is a grid cell of about 50 km, not a field measurement.
- Frost and heat are coarse: they come from the coldest and hottest hour of each month in the NASA POWER cell.
- Recommendations are calibrated only for Guanajuato and Querétaro.

## Use of Super Intelligence (SI)

- We used **Claude Code** (Anthropic) as a coding assistant during the event, to write and review code and tests. The
  idea, the design and every decision came from the team. All changes went through the team's
  review, and the README declares this use.
- Inside the app:
  - **Gemma 3** (Google, run locally with Ollama) words some assistant answers using only the plot's data; our code
    checks every number it writes.
  - **Whisper** (OpenAI `whisper-base`, run locally with transformers.js) turns the farmer's voice into text.
  - The crop recommendation itself is calculated by our rule engine, not by an AI model.
- The 3D models and textures are generated by our own code, not by an image-generation model.

[Si el video o las diapositivas usan imágenes o voz generadas con IA, decirlo aquí y ponerles una marca de agua visible.]

## NASA Data

- **NASA POWER**, monthly point API 2000–2025, community AG: T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, ALLSKY_SFC_SW_DWN and
  GWETROOT. It is the core of the tool. From it come:
  - the rain of each crop's cycle in each real year;
  - the dry years and the year-by-year test;
  - the temperature fit, and the years with damaging frost or heat (T2M_MIN, T2M_MAX);
  - the uncertainty ranges;
  - the training data of the loss model.
- **NASA GIBS** layers on the map: MODIS Terra NDVI (16-day), MODIS Terra corrected reflectance (true color) and SMAP L4
  root-zone soil moisture, plus Blue Marble. They give regional context only.
- **SRTM** elevation (through AWS Terrain Tiles), for the 3D relief of the plot.

## Space Agency Partner Data and Other References

No Space Agency Partner data was used.

Other data and resources:
- SoilGrids 2.0, ISRIC (CC BY 4.0): Poggio et al. (2021), *SOIL* 7, 217–240.
- SIAP *Cierre de la producción agrícola* 2018–2024 (Mexico, open data).
- INEGI: Agricultural Census 2022 and Marco Geoestadístico (state boundaries).
- Esri World Imagery and World Imagery (Clarity), World Boundaries and Places, World Transportation. Imagery: Esri,
  Maxar, Earthstar Geographics and the GIS user community.
- Open-Meteo (CC BY 4.0), current weather and forecast.
- OpenStreetMap / Nominatim (ODbL), address search.
- Wikipedia in Spanish (CC BY-SA), linked support texts.
- FAO Ecocrop (optimal temperature and pH of each crop) and FAO Irrigation Water Management Training Manual No. 3,
  Table 14 (water per growing cycle).

Open-source software: React, Vite, react-router, Express, MapLibre GL JS, three.js, @react-three/fiber,
@react-three/drei, Chart.js, Bootstrap, Bootstrap Icons, transformers.js, Ollama and Gemma 3. Fonts: Plus Jakarta Sans
and JetBrains Mono (Google Fonts). Full credits are in the repository README.
