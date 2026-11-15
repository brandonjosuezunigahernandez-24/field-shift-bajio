import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
// MapLibre (~1 MB) se carga aparte, cuando la pantalla ya se ve.
const ParcelMap = lazy(() => import('../map/ParcelMap.jsx'));
import PerfilForm from '../components/PerfilForm.jsx';
import Ubicacion from '../components/Ubicacion.jsx';
import { useParcelaContext } from '../context/ParcelaContext.jsx';
import { climatePeriod } from '../lib/parcelaClima.js';

// Screen 1: where the plot is, the map to draw it (MapLibre, with NASA GIBS layers) and the farmer profile.
// Climate and soil are real (/api/clima + /api/suelo). The assistant is the floating dock (AsistenteDock).
export default function Parcela() {
  const { point, loading, clima, suelo, parcelas, addParcela, updateParcela, removeParcela, setCultivo, choosePoint, year } = useParcelaContext();

  const soil = suelo?.data;
  const ph = soil && !soil.sin_datos && soil.ph != null ? `${soil.ph.toFixed(1)} · ${phLabel(soil.ph)}` : soil?.sin_datos ? 'sin dato' : '—';
  const climaData = clima?.data;
  const dryLabel = climaData ? `${climaData.anios_secos.length} de ${climaData.lluvia_pv_anual.length} años secos` : '—';

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
        <section className="fs-banner fs-up" aria-label="Contexto">
          <div className="fs-banner-l">
            <span className="fs-banner-num">63.9%</span>
            <div>
              <p className="fs-banner-t1">de la superficie agrícola de Guanajuato es de temporal</p>
              <p className="fs-banner-t2">622,938 ha · Censo Agropecuario 2022, INEGI. En Querétaro la sequía redujo la siembra de temporal hasta 40%.</p>
            </div>
          </div>
          <span className="fs-banner-pill" aria-live="polite">
            {point ? `Punto activo: ${point.lat.toFixed(2)}° N, ${Math.abs(point.lon).toFixed(2)}° W` : 'Punto activo: sin seleccionar'}
          </span>
        </section>

        <section className="fs-card fs-up fs-d1 fs-hero-map" aria-labelledby="t-mapa">
          <div className="fs-card-head">
            <div>
              <div className="fs-eyebrow">Paso 1 · Tu parcela</div>
              <h1 className="fs-card-title" id="t-mapa">¿Dónde está tu parcela?</h1>
              <p className="fs-hero-sub">Escribe tu pueblo o dirección, usa tu ubicación o las coordenadas. Después dibuja tu parcela sobre la imagen de satélite y mírala levantarse en 3D.</p>
            </div>
          </div>

          <Ubicacion onPick={choosePoint} selectedId={point?.id} />

          <div className="v3d v3d-embed v3d-hero" role="application" aria-label="Mapa de satélite para dibujar tu parcela">
            <Suspense fallback={<p className="status">Cargando el mapa…</p>}>
              <ParcelMap
                point={point}
                parcelas={parcelas}
                suelo={suelo?.data ?? null}
                clima={clima?.data ?? null}
                year={year}
                onAddParcela={addParcela}
                onUpdateParcela={updateParcela}
                onRemoveParcela={removeParcela}
                onSetCultivo={setCultivo}
              />
            </Suspense>
          </div>

          <div className="fs-stats" aria-live="polite">
            <span>Lluvia jun–sep <strong>{climaData ? `${Math.round(climaData.lluvia_pv_mediana_mm)} mm` : loading ? '…' : '—'}</strong></span>
            <span>Años secos <strong>{loading ? '…' : dryLabel}</strong></span>
            <span>pH del suelo (0–30 cm) <strong>{loading ? '…' : ph}</strong></span>
          </div>
          {clima?.error && <p className="fs-note" role="alert">{clima.error}</p>}
          {soil?.sin_datos && <p className="fs-note">{soil.aviso}</p>}
        </section>

        <div className="fs-row">
          <div className="fs-col fs-side-col fs-full">
            <section className="fs-card fs-up fs-d2" aria-labelledby="t-perfil">
              <div>
                <div className="fs-eyebrow">Paso 2 · Perfil del agricultor</div>
                <h2 className="fs-card-title sm" id="t-perfil">Cuéntame de tu parcela</h2>
              </div>
              <PerfilForm />
              <Link className="fs-btn fs-btn-primary lg fs-btn-block" to="/rotacion">
                <i className="bi bi-cpu" aria-hidden="true"></i>Simular rotación a 3 años y vista 3D
              </Link>
            </section>
          </div>
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
