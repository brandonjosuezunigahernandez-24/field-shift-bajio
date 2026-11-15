import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
// MapLibre (~1 MB) se carga aparte, cuando la pantalla ya se ve.
const ParcelMap = lazy(() => import('../map/ParcelMap.jsx'));
import FarmSummary from '../map/FarmSummary.jsx';
import PanelPasos from '../components/PanelPasos.jsx';
import PerfilForm from '../components/PerfilForm.jsx';
import Ubicacion from '../components/Ubicacion.jsx';
import { useParcelaContext } from '../context/ParcelaContext.jsx';
import SoilCard from '../components/SoilCard.jsx';
import { climatePeriod, withYears } from '../lib/parcelaClima.js';
import { weatherFromCode } from '../weather.js';
import { YearControl } from '../year.jsx';

// Puntos que solo dicen hacia dónde volar: ahí todavía hay que dibujar la parcela.
// Los de ejemplo (GET /api/ejemplos) traen su propio id y ya son una parcela.
const SIN_PARCELA = new Set(['direccion', 'gps', 'coordenadas', 'personalizada', 'dibujada']);

// Mientras se ubica y dibuja: desde arriba y sin clima, para que cada toque caiga donde es.
const ESCENA_DIBUJO = { vista: 'aerea', nasa: null, clima: 'apagado', lejos: false };

// Cada tarjeta pone el mapa como le toca (ParcelMap DEFAULT_SCENE): el agricultor no elige nada.
const TARJETAS = [
  { id: 'terreno', titulo: 'Tu terreno', escena: { vista: 'relieve', nasa: null, clima: 'apagado', lejos: false } },
  { id: 'hoy', titulo: 'El clima ahorita', escena: { vista: 'relieve', nasa: null, clima: 'hoy', lejos: false } },
  { id: 'lluvia', titulo: 'La lluvia de {n} años', escena: { vista: 'relieve', nasa: null, clima: 'anio', lejos: false } },
  { id: 'suelo', titulo: 'Tu suelo', escena: { vista: 'relieve', nasa: null, clima: 'apagado', lejos: false } },
  { id: 'verdor', titulo: 'El verdor visto desde el satélite', escena: { vista: 'aerea', nasa: 'ndvi', clima: 'apagado', lejos: true } },
  { id: 'humedad', titulo: 'La humedad de la tierra', escena: { vista: 'aerea', nasa: 'smap', clima: 'apagado', lejos: true } },
  { id: 'perfil', titulo: 'Cuéntame de tu parcela', escena: { vista: 'relieve', nasa: null, clima: 'hoy', lejos: false } },
];

// Screen 1: the map on one side, always in sight, and one panel on the other (PanelPasos). First the panel guides
// the farmer to find and draw the plot (the map's own tools are drawn inside the panel); then it shows one step at a
// time, and each step sets the map (view, NASA picture, weather). The last step is the profile (old step 2).
// Climate and soil are real (/api/clima + /api/suelo), the weather right now is Open-Meteo.
export default function Parcela() {
  const { point, loading, clima, suelo, parcelas, addParcela, updateParcela, removeParcela, setCultivo, choosePoint, year, pronostico } =
    useParcelaContext();
  const listo = parcelas.length > 0 || (point != null && !SIN_PARCELA.has(point.id));
  const [cambiar, setCambiar] = useState(false);
  const [activa, setActiva] = useState(0); // la única tarjeta que se ve; manda en el mapa
  const [slot, setSlot] = useState(null); // where ParcelMap draws its tools (parcel list, drawing, GPS)
  const [dibujando, setDibujando] = useState(false); // corners are being placed on the map

  // Otro lugar (o volver a dibujar desde cero): los pasos empiezan otra vez.
  useEffect(() => {
    setActiva(0);
  }, [listo, point?.id]);

  // Al empezar a marcar esquinas, que se vean las herramientas (el botón de guardar) dentro del panel.
  useEffect(() => {
    if (dibujando) slot?.scrollIntoView({ block: 'nearest' });
  }, [dibujando, slot]);

  const tarjeta = TARJETAS[activa];
  const lugar = (point?.nombre ?? 'Tu parcela').replace(/\.$/, '');
  // Borrar una parcela o cambiar de lugar no se puede deshacer: se pregunta antes.
  const borrarParcela = (id) => {
    if (window.confirm('¿Borrar esta parcela? No se puede deshacer.')) removeParcela(id);
  };
  const elegirLugar = (nuevo) => {
    if (parcelas.length && !window.confirm('Si cambias de lugar se borran las parcelas que dibujaste. ¿Quieres seguir?')) return;
    setCambiar(false);
    choosePoint(nuevo);
  };

  const climaData = clima?.data;
  const soil = suelo?.data;
  const actual = pronostico?.disponible ? pronostico.actual ?? null : null;

  function cuerpo(id) {
    switch (id) {
      case 'terreno':
        return parcelas.length ? (
          <div className="v3d">
            <FarmSummary parcelas={parcelas} />
          </div>
        ) : (
          <p>
            Parcela de ejemplo en <strong>{lugar}</strong>. Si quieres usar la tuya, toca sus esquinas en el mapa.
          </p>
        );
      case 'hoy': {
        if (pronostico === null) return <p className="fs-note">Cargando el clima de ahorita…</p>;
        if (!actual) return <p className="fs-note">No pude saber el clima de ahorita (¿sin internet?). El mapa muestra el clima del año.</p>;
        const w = weatherFromCode(actual.codigo_clima, actual.lluvia_mm ?? 0);
        return (
          <>
            <p className="fs-dato">
              <span aria-hidden="true">{w.icon}</span> {w.label}
              {actual.temp_c != null && <strong> · {Math.round(actual.temp_c)} °C</strong>}
            </p>
            {actual.lluvia_mm > 0 && <p>Está lloviendo: {actual.lluvia_mm} mm en este momento.</p>}
            <p className="fs-note">Así se ve ahora el cielo sobre tu parcela en el mapa. Fuente: Open-Meteo, {actual.hora?.slice(11, 16)} h.</p>
          </>
        );
      }
      case 'lluvia':
        if (clima?.error) return <p className="fs-note" role="alert">{clima.error}</p>;
        if (!climaData) return <p className="fs-note">{loading ? 'Cargando la lluvia de cada año…' : 'Sin datos de lluvia.'}</p>;
        return (
          <>
            <p className="fs-dato">
              <strong>{Math.round(climaData.lluvia_pv_mediana_mm)} mm</strong> llueven de junio a septiembre en un año normal.
            </p>
            <p>
              En <strong>{climaData.anios_secos.length} de {climaData.lluvia_pv_anual.length} años</strong> llovió mucho menos (año seco).
              Mueve el año y mira cómo cambian el clima y tus cultivos en el mapa.
            </p>
            <div className="v3d">
              <YearControl id="anio-tarjeta" year={year} clima={climaData} />
            </div>
            <p className="fs-note">Fuente: NASA POWER, lluvia real de cada año desde el 2000.</p>
          </>
        );
      case 'suelo':
        if (suelo?.error) return <p className="fs-note" role="alert">{suelo.error}</p>;
        if (!soil) return <p className="fs-note">{loading ? 'Cargando tu suelo…' : 'Sin datos de suelo.'}</p>;
        if (soil.sin_datos) return <p className="fs-note">{soil.aviso}</p>;
        return (
          <>
            {soil.ph != null && (
              <p className="fs-dato">
                pH <strong>{soil.ph.toFixed(1)}</strong> · {phLabel(soil.ph)}
              </p>
            )}
            <p>
              Arcilla {soil.arcilla_pct ?? '—'} % · arena {soil.arena_pct ?? '—'} % · limo {soil.limo_pct ?? '—'} %
              {soil.carbono_organico_g_kg != null && <> · materia orgánica (carbono) {soil.carbono_organico_g_kg} g/kg</>}
            </p>
            <p className="fs-note">Promedio de 0 a 30 cm de hondo. Fuente: SoilGrids (ISRIC), cuadros de 250 m.</p>
            {/* Soil type, layers down to 1 m and NASA soil wetness (official data, see SoilCard). */}
            <div className="v3d">
              <SoilCard suelo={soil} clima={climaData} anio={year?.anio} />
            </div>
          </>
        );
      case 'verdor':
        return (
          <>
            <p>Alejamos el mapa para ver la región. Entre más verde, más planta viva había a media temporada de lluvias.</p>
            <p className="fs-note">Fuente: NASA GIBS, verdor (NDVI) de MODIS Terra, 12 de agosto de 2024, cuadros de 250 m.</p>
          </>
        );
      case 'humedad':
        return (
          <>
            <p>Qué tan mojada estaba la tierra donde viven las raíces en plena temporada de lluvias, en tu región.</p>
            <p className="fs-note">Fuente: NASA GIBS, humedad del suelo SMAP, 12 de agosto de 2024, cuadros de 9 km.</p>
          </>
        );
      case 'perfil':
        return (
          <>
            <PerfilForm />
            <p className="fs-note">Cuando termines, toca «Ver mis rotaciones».</p>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <Header
        sub="NASA SPACE APPS 2026 · APOYO A DECISIONES"
        pills={
          <>
            <span className="fs-pill">
              <span className="fs-dot" aria-hidden="true"></span>NASA POWER {climatePeriod(climaData)}
            </span>
            <span className="fs-pill">
              <span className="fs-dot d2" aria-hidden="true"></span>SoilGrids ISRIC
            </span>
            <span className="fs-pill is-white">
              <i className="bi bi-mic" aria-hidden="true"></i>Whisper STT listo
            </span>
          </>
        }
      />

      <main className="fs-container fs-app">
        <div className="fs-flujo">
          <div className="fs-flujo-mapa v3d v3d-embed v3d-hero" role="application" aria-label="Mapa de satélite de tu parcela">
            <Suspense fallback={<p className="status">Cargando el mapa…</p>}>
              <ParcelMap
                point={point}
                parcelas={parcelas}
                suelo={soil ?? null}
                clima={climaData ?? null}
                year={year}
                escena={listo ? tarjeta.escena : ESCENA_DIBUJO}
                actual={actual}
                herramientasEn={slot}
                onDibujando={setDibujando}
                onAddParcela={addParcela}
                onUpdateParcela={updateParcela}
                onRemoveParcela={borrarParcela}
                onSetCultivo={setCultivo}
              />
            </Suspense>
          </div>

          {listo ? (
            <PanelPasos
              lugar={
                <>
                  <i className="bi bi-geo-alt-fill" aria-hidden="true"></i> {lugar}
                </>
              }
              accion={
                <button type="button" className="fs-panel-link" aria-expanded={cambiar} onClick={() => setCambiar(!cambiar)}>
                  {cambiar ? 'Cerrar' : 'Cambiar de lugar'}
                </button>
              }
              paso={activa}
              total={TARJETAS.length}
              titulo={dibujando ? 'Marca tu parcela en el mapa' : withYears(tarjeta.titulo, climaData)}
              onAnterior={() => setActiva(activa - 1)}
              onSiguiente={() => setActiva(activa + 1)}
              bloqueado={dibujando}
              final={
                <Link className="fs-btn fs-btn-primary" to="/rotacion">
                  Ver mis rotaciones<i className="bi bi-arrow-right" aria-hidden="true"></i>
                </Link>
              }
            >
              {cambiar && <Ubicacion onPick={elegirLugar} selectedId={point?.id} />}
              {dibujando ? (
                <p>Toca cada esquina de tu parcela en el mapa. Cuando termines, toca el botón verde de «Guardar»; si no, «Cancelar».</p>
              ) : (
                cuerpo(tarjeta.id)
              )}
              {/* The map's own tools: in «Tu terreno» (parcel list, draw another) and while drawing. */}
              <div ref={setSlot} className="fs-herramientas v3d v3d-embed" hidden={!dibujando && tarjeta.id !== 'terreno'} />
            </PanelPasos>
          ) : (
            <PanelPasos titulo="¿Dónde está tu parcela?">
              <ol className="fs-guia">
                <li>
                  <b>Busca tu pueblo</b> o toca una parcela de ejemplo.
                  <Ubicacion onPick={elegirLugar} selectedId={point?.id} />
                </li>
                <li>
                  <b>Marca tu parcela en el mapa.</b>
                  <div ref={setSlot} className="fs-herramientas v3d v3d-embed" />
                </li>
                <li>
                  <b>Toca «Usar esta parcela»</b> y te vamos mostrando lo que sabemos de ella.
                </li>
              </ol>
              <p className="fs-note">
                En Guanajuato, 63.9 % de la superficie agrícola es de temporal (622,938 ha; Censo Agropecuario 2022, INEGI).
              </p>
            </PanelPasos>
          )}
        </div>
      </main>
    </>
  );
}

function phLabel(ph) {
  if (ph < 6) return 'ácido';
  if (ph <= 7.3) return 'óptimo';
  if (ph <= 7.8) return 'neutro';
  return 'alcalino';
}
