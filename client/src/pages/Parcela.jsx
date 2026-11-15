import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
// MapLibre (~1 MB) se carga aparte, cuando la pantalla ya se ve.
const ParcelMap = lazy(() => import('../map/ParcelMap.jsx'));
import PerfilForm from '../components/PerfilForm.jsx';
import Ubicacion from '../components/Ubicacion.jsx';
import { useParcelaContext } from '../context/ParcelaContext.jsx';
import { EXAMPLE_POINTS } from '../config/examplePoints.js';
import { MAP_LAYERS } from '../config/mapLayers.js';
import FS_DATOS from '../data/datosDemo.js';
import { reducedMotion } from '../lib/fs.js';

const CAPAS = [
  { id: 'sat', label: 'Satélite' },
  { id: 'ndvi', label: 'MODIS NDVI' },
  { id: 'smap', label: 'Humedad SMAP' },
];

// Screen 1: plot on the map, farmer profile and the (simulated) assistant chat.
// Map, climate and soil are real (Leaflet + /api/clima + /api/suelo). The chat and the microphone
// are the design's simulation until /api/asistente exists.
export default function Parcela() {
  const { point, loading, clima, suelo, parcelas, addParcela, updateParcela, removeParcela, setCultivo, choosePoint, year } = useParcelaContext();
  const [capa, setCapa] = useState('sat');
  const navigate = useNavigate();

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
              <span className="fs-dot" aria-hidden="true"></span>NASA POWER 2000–2024
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

          <Ubicacion onPick={choosePoint} />

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

// Design section 7.4. Locked until a plot is chosen; the microphone types the demo sentence
// character by character (Whisper simulation).
function Chat({ point, onAsk }) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  function toggleMic() {
    if (timer.current) {
      stop();
      return;
    }
    setRecording(true);
    setText('');
    const txt = FS_DATOS.textoWhisper;
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setText(txt.slice(0, i));
      if (i >= txt.length) stop();
    }, reducedMotion() ? 0 : 32);
  }
  function stop() {
    clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
  }

  const locked = !point;

  return (
    <section className="fs-card fs-chat fs-up fs-d3" aria-labelledby="t-chat">
      <div className="fs-chat-head">
        <div className="fs-chat-who">
          <span className="fs-ico-box">
            <i className="bi bi-robot" aria-hidden="true"></i>
          </span>
          <div>
            <h2 className="fs-chat-name m-0" id="t-chat">Asistente agrónomo IA</h2>
            <div className="fs-chat-sub">LLM + Whisper (voz a texto)</div>
          </div>
        </div>
        <span className={`fs-badge ${locked ? 'off' : 'on'}`}>{locked ? 'Bloqueado' : 'Parcela vinculada'}</span>
      </div>

      <div className="fs-history" aria-live="polite">
        <div className="fs-bubble">
          <span className="who">FieldShift AI</span>¡Hola! Cuéntame con tus palabras cómo es tu tierra o qué sembraste el año pasado. Puedes escribir o tocar el micrófono para hablar.
        </div>
        {point && (
          <div className="d-flex flex-column gap-2 fs-up" key={`${point.lat},${point.lon}`}>
            <div className="fs-bubble alt">
              <span className="who">FieldShift AI</span>Ya tengo los datos de <strong>{point.boton}</strong>: 25 años de lluvia de NASA POWER y el suelo de SoilGrids. ¿Qué quieres saber?
            </div>
            <div className="fs-chips">
              <Link className="fs-btn fs-btn-pill" to="/analisis">¿Cuándo siembro frijol?</Link>
              <Link className="fs-btn fs-btn-pill" to="/analisis">¿Qué tan seco es mi rancho?</Link>
              <Link className="fs-btn fs-btn-pill" to="/cultivo">¿Se daría otro cultivo aquí?</Link>
            </div>
          </div>
        )}
      </div>

      <form
        className="fs-inputbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked) onAsk();
        }}
      >
        <button type="button" className={`fs-mic${recording ? ' is-rec' : ''}`} aria-label="Hablar con el micrófono" aria-pressed={recording} disabled={locked} onClick={toggleMic}>
          <i className="bi bi-mic" aria-hidden="true"></i>
        </button>
        <span className={`fs-wave fs-chat-wave${recording ? ' is-on' : ''}`} aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i>
        </span>
        <label htmlFor="chat-input" className="visually-hidden">Escribe tu pregunta</label>
        <input
          id="chat-input"
          className="fs-input"
          type="text"
          placeholder={locked ? 'Primero selecciona una parcela' : 'Pregunta o dicta al micrófono…'}
          disabled={locked}
          aria-describedby={locked ? 'lock-msg' : undefined}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="fs-send" aria-label="Enviar pregunta" disabled={locked}>
          <i className="bi bi-send" aria-hidden="true"></i>
        </button>
      </form>
      <p className="fs-note">Whisper transcribe español regional directo al cuadro de texto. (Simulado: la ruta del asistente llega después.)</p>

      <div className={`fs-lock${locked ? '' : ' is-hidden'}`} hidden={!locked}>
        <span className="fs-lock-ico">
          <i className="bi bi-lock" aria-hidden="true"></i>
        </span>
        <b>El asistente se activa al elegir tu parcela</b>
        <p id="lock-msg">Así responde con la lluvia, la humedad y el suelo reales de tu punto, no con promedios.</p>
        <span className="fs-shimmer" aria-hidden="true"></span>
      </div>
    </section>
  );
}
