import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
// MapLibre (~1 MB) se carga aparte, cuando la pantalla ya se ve.
const ParcelMap = lazy(() => import('../map/ParcelMap.jsx'));
import FarmSummary from '../map/FarmSummary.jsx';
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

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Screen 1: first the farmer finds and draws the plot; then one card at a time (Anterior/Siguiente),
// next to the map that stays in sight, and each card sets the map (view, NASA picture, weather). The last card is the profile (old step 2).
// Climate and soil are real (/api/clima + /api/suelo), the weather right now is Open-Meteo.
export default function Parcela() {
  const { point, loading, clima, suelo, parcelas, addParcela, updateParcela, removeParcela, setCultivo, choosePoint, year, pronostico } =
    useParcelaContext();
  const listo = parcelas.length > 0 || (point != null && !SIN_PARCELA.has(point.id));
  const [cambiar, setCambiar] = useState(false);
  const [activa, setActiva] = useState(0); // la única tarjeta que se ve; manda en el mapa
  const tarjetaRef = useRef(null);
  const navegado = useRef(false);

  // Otro lugar (o volver a dibujar desde cero): las tarjetas empiezan otra vez.
  useEffect(() => {
    setActiva(0);
  }, [listo, point?.id]);

  // El encabezado es fijo y su alto cambia (en celular ocupa dos renglones): el mapa fijo va justo debajo.
  useEffect(() => {
    const header = document.querySelector('.fs-header');
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => document.documentElement.style.setProperty('--fs-head', `${header.offsetHeight}px`);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Al cambiar de tarjeta con los botones, que se vea su inicio (el mapa queda fijo arriba o al lado).
  useEffect(() => {
    if (!navegado.current) return;
    navegado.current = false;
    tarjetaRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [activa]);

  const ir = (i) => {
    navegado.current = true;
    setActiva(i);
  };
  const tarjeta = TARJETAS[activa];

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
            Parcela de ejemplo en <strong>{point.nombre}</strong>. Si quieres usar la tuya, toca sus esquinas en el mapa.
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
            <Link className="fs-btn fs-btn-primary lg fs-btn-block" to="/rotacion">
              <i className="bi bi-cpu" aria-hidden="true"></i>Simular rotación a 3 años y vista 3D
            </Link>
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

      <main className="fs-container">
        {!listo && (
          <section className="fs-banner fs-up" aria-label="Contexto">
            <div className="fs-banner-l">
              <span className="fs-banner-num">63.9%</span>
              <div>
                <p className="fs-banner-t1">de la superficie agrícola de Guanajuato es de temporal</p>
                <p className="fs-banner-t2">622,938 ha · Censo Agropecuario 2022, INEGI. En Querétaro la sequía redujo la siembra de temporal hasta 40%.</p>
              </div>
            </div>
          </section>
        )}

        <section className="fs-card fs-up fs-d1 fs-hero-map" aria-labelledby="t-mapa">
          <div className="fs-card-head">
            <div>
              <div className="fs-eyebrow">{listo ? 'Tu parcela' : 'Paso 1 · Tu parcela'}</div>
              <h1 className="fs-card-title" id="t-mapa">
                {listo ? point?.nombre ?? 'Tu parcela' : '¿Dónde está tu parcela?'}
              </h1>
              {!listo && (
                <p className="fs-hero-sub">
                  Escribe tu pueblo o dirección, usa tu ubicación o las coordenadas. Después toca las esquinas de tu parcela
                  sobre la imagen de satélite y te vamos mostrando lo que sabemos de ella.
                </p>
              )}
            </div>
            {listo && (
              <button type="button" className="fs-btn fs-btn-sec" aria-expanded={cambiar} onClick={() => setCambiar(!cambiar)}>
                <i className="bi bi-geo-alt" aria-hidden="true"></i>Cambiar de lugar
              </button>
            )}
          </div>

          {(!listo || cambiar) && (
            <Ubicacion
              onPick={(lugar) => {
                setCambiar(false);
                choosePoint(lugar);
              }}
              selectedId={point?.id}
            />
          )}

          <div className={listo ? 'fs-flujo' : 'fs-flujo is-solo'}>
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
                  onAddParcela={addParcela}
                  onUpdateParcela={updateParcela}
                  onRemoveParcela={removeParcela}
                  onSetCultivo={setCultivo}
                />
              </Suspense>
            </div>

            {listo && (
              <section key={tarjeta.id} ref={tarjetaRef} className="fs-card fs-tarjeta fs-up" aria-labelledby="t-tarjeta">
                <div className="fs-tarjeta-head">
                  <span className="fs-eyebrow">
                    {activa + 1} de {TARJETAS.length}
                  </span>
                  <h2 className="fs-card-title xs" id="t-tarjeta">
                    {withYears(tarjeta.titulo, climaData)}
                  </h2>
                  <span className="fs-tarjeta-pasos" aria-hidden="true">
                    {TARJETAS.map((t, i) => (
                      <span key={t.id} className={i <= activa ? 'is-on' : undefined} />
                    ))}
                  </span>
                </div>
                {cuerpo(tarjeta.id)}
                <div className="fs-tarjeta-nav">
                  {activa > 0 && (
                    <button type="button" className="fs-btn fs-btn-sec" onClick={() => ir(activa - 1)}>
                      <i className="bi bi-arrow-left" aria-hidden="true"></i>Anterior
                    </button>
                  )}
                  {activa < TARJETAS.length - 1 && (
                    <button type="button" className="fs-btn fs-btn-primary" onClick={() => ir(activa + 1)}>
                      Siguiente<i className="bi bi-arrow-right" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
        </section>
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
