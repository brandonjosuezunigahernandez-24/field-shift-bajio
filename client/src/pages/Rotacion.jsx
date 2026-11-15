import { useEffect, useMemo, useState } from 'react';
import Vista3DPanel from '../components/Vista3DPanel.jsx';
import { CROP_IDS } from '../crops.js';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import RainChart from '../components/charts/RainChart.jsx';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import FS_DATOS from '../data/datosDemo.js';
import { kpisFrom, rainSeriesFrom, soilLegendFrom } from '../lib/parcelaClima.js';

// Stalk look per crop for the CSS 3D stage. Sorgo, frijol and maíz come from the design; the
// rest are approximations in the same palette.
const VISUALES = {
  sorgo: { insignia: 'Alta tolerancia a sequía', tallo: FS_DATOS.rotacion[0].tallo, descripcion: FS_DATOS.rotacion[0].descripcion },
  frijol: { insignia: '+45 kg/ha de nitrógeno', tallo: FS_DATOS.rotacion[1].tallo, descripcion: FS_DATOS.rotacion[1].descripcion },
  maiz: { insignia: 'Suelo regenerado', tallo: FS_DATOS.rotacion[2].tallo, descripcion: FS_DATOS.rotacion[2].descripcion },
  garbanzo: { insignia: 'Leguminosa de poca agua', tallo: { alto: 28, ancho: 13, de: '#14532D', a: '#8FD1A0', glow: 'rgba(143,209,160,.6)' }, descripcion: 'El garbanzo se conforma con poca lluvia y, como leguminosa, deja nitrógeno en los primeros centímetros del suelo.' },
  cebada: { insignia: 'Ciclo corto', tallo: { alto: 40, ancho: 7, de: '#2E6B2A', a: '#C9E77A', glow: 'rgba(201,231,122,.55)' }, descripcion: 'La cebada cierra su ciclo rápido y aprovecha el frío del invierno; con riego cabe en otoño-invierno.' },
  trigo: { insignia: 'Mejor con riego', tallo: { alto: 44, ancho: 7, de: '#2E6B2A', a: '#E0D97A', glow: 'rgba(224,217,122,.55)' }, descripcion: 'El trigo pide agua pareja durante el macollo y el llenado de grano; en temporal depende de un buen septiembre.' },
  brocoli: { insignia: 'Exige riego', tallo: { alto: 24, ancho: 18, de: '#1B6B3A', a: '#4FBF6E', glow: 'rgba(79,191,110,.6)' }, descripcion: 'El brócoli es de riego y ciclo corto; aporta valor comercial pero no aguanta un temporal fallido.' },
};
const VISUAL_DEFAULT = { insignia: 'Cultivo de la rotación', tallo: { alto: 40, ancho: 9, de: '#1B6B3A', a: '#9CC24A', glow: 'rgba(156,194,74,.5)' }, descripcion: '' };

const SEASON = { PV: 'temporal', OI: 'otoño-invierno' };

// Screen 2: 3D stage, 3-year plan, yearly rain chart, crop ranking and the voice dock.
// Rotation and ranking come from POST /api/recomendar (the mock while the engine is pending);
// if the call fails the design's demo plan is shown with a note. Rain, KPIs and soil are real.
export default function Rotacion() {
  const ctx = useParcelaContext();
  const { point, clima, suelo, recomendacion, ensurePoint, recomendar } = ctx;
  const [year, setYear] = useState(0);
  const labels = selectionLabels(ctx);

  useEffect(() => {
    if (!ensurePoint() && point) recomendar();
  }, [point, ensurePoint, recomendar, ctx.agua, ctx.prioridad]);

  const rec = recomendacion?.data;
  // Al cambiar de año del plan, las parcelas dibujadas pasan al cultivo de ese año (se ve en el 3D).
  const planCrop = rec?.rotacion?.[Math.min(year, rec.rotacion.length - 1)]?.cultivo;
  useEffect(() => {
    if (planCrop && CROP_IDS.includes(planCrop)) {
      ctx.setParcelas((list) => list.map((p) => (p.cultivo === planCrop ? p : { ...p, cultivo: planCrop })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCrop]);
  const real = !!rec;
  const climaData = clima?.data;
  const sueloData = suelo?.data;
  const nextYear = new Date().getFullYear() + 1;

  // Years of the plan: [{ anio, etiqueta, pts, cultivo, texto, titulo3d, insignia, tallo, descripcion }]
  const rotacion = useMemo(() => {
    if (!rec) return FS_DATOS.rotacion;
    return rec.rotacion.map((step, i) => {
      const crop = rec.cultivos.find((c) => c.id === step.cultivo);
      const vis = VISUALES[step.cultivo] || VISUAL_DEFAULT;
      const nombre = crop?.nombre ?? step.cultivo;
      return {
        anio: step.anio,
        etiqueta: `AÑO ${step.anio} · ${nextYear + step.anio - 1}${step.temporada === 'OI' ? ' · OI' : ''}`,
        pts: crop ? Math.round(crop.puntaje) : '—',
        cultivo: nombre,
        texto: step.porque,
        titulo3d: `Año ${step.anio} · ${nombre}`,
        insignia: vis.insignia,
        tallo: vis.tallo,
        descripcion: vis.descripcion || step.porque,
        temporada: SEASON[step.temporada] || step.temporada,
      };
    });
  }, [rec, nextYear]);

  const ranking = useMemo(() => {
    if (!rec) return FS_DATOS.ranking;
    const colors = ['#14532D', '#1B6B3A', '#23854A', '#3BA55C', '#6CC283', '#8FD1A0', '#B5E2BF'];
    return rec.cultivos.map((c, i) => ({
      cultivo: c.nombre ?? c.id,
      etiqueta: c.riesgo < 0.15 ? 'muy bajo riesgo' : c.riesgo < 0.3 ? 'bajo riesgo' : c.riesgo < 0.5 ? 'riesgo moderado' : 'alto riesgo',
      pts: Math.round(c.puntaje),
      color: colors[Math.min(i, colors.length - 1)],
    }));
  }, [rec]);

  const kpis = useMemo(() => kpisFrom(climaData, sueloData), [climaData, sueloData]);
  const rain = useMemo(() => rainSeriesFrom(climaData), [climaData]);
  const soilLegend = useMemo(() => soilLegendFrom(sueloData), [sueloData]);
  const current = rotacion[Math.min(year, rotacion.length - 1)];
  const placeName = point?.nombre ?? 'Celaya';

  const why = useMemo(() => {
    const dry = climaData ? climaData.anios_secos.length : 6;
    const total = climaData ? climaData.lluvia_pv_anual.length : 25;
    const umbral = climaData ? Math.round(climaData.umbral_seco_mm) : 520;
    const periodo = climaData ? `${climaData.periodo.inicio}–${climaData.periodo.fin}` : '2000–2024';
    const [c1, c2, c3] = rotacion;
    return (
      <>
        Según NASA POWER ({periodo}), en <strong>{dry} de los últimos {total} años</strong> llovió menos de {umbral} mm de junio a septiembre en {placeName}.
        {c1 && c2 && c3 ? (
          <>
            {' '}Empezar con <strong>{c1.cultivo}</strong> protege tu inversión contra la sequía, <strong>{c2.cultivo}</strong> {c2.texto.charAt(0).toLowerCase() + c2.texto.slice(1).replace(/\.$/, '')} y deja la tierra lista para <strong>{c3.cultivo}</strong> en el tercer año.
          </>
        ) : null}
      </>
    );
  }, [climaData, rotacion, placeName]);

  return (
    <>
      <Header
        sub="SIMULACIÓN DE ROTACIÓN · GEMELO 3D"
        pills={
          <>
            <span className="fs-pill">{labels.lugar}</span>
            <span className="fs-pill is-white">{labels.manejo}</span>
          </>
        }
      />

      <main className="fs-container">
        <div className="fs-row">
          <section className="fs-card fs-3d-col fs-up" aria-labelledby="t-3d">
            <div className="fs-card-head">
              <div>
                <div className="fs-eyebrow">Gemelo digital 3D · SoilGrids</div>
                <h1 className="fs-card-title" id="t-3d">{current.titulo3d}</h1>
              </div>
              <span className="fs-badge-soft">{current.insignia}</span>
            </div>

            <Vista3DPanel />
            <p className="fs-3d-desc" aria-live="polite">{current.descripcion}</p>
          </section>

          <section className="fs-card fs-plan-col fs-up fs-d1" aria-labelledby="t-plan">
            <div className="fs-card-head">
              <div>
                <div className="fs-eyebrow">Recomendación personalizada</div>
                <h2 className="fs-card-title" id="t-plan">Tu plan de rotación a 3 años</h2>
              </div>
              <button type="button" className="fs-btn fs-btn-pill" onClick={() => window.print()}>
                <i className="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>Exportar ficha PDF
              </button>
            </div>

            {recomendacion?.error && (
              <p className="fs-note" role="status">
                {recomendacion.error} Mientras tanto se muestra el plan de ejemplo del diseño.
              </p>
            )}

            <div className="fs-years" role="group" aria-label="Año de la rotación">
              {rotacion.map((y, idx) => (
                <button key={`${y.anio}-${idx}`} type="button" className="fs-year" aria-pressed={idx === year} onClick={() => setYear(idx)}>
                  <span className="fs-year-top">
                    <span className="fs-year-tag">{y.etiqueta}</span>
                    <span className="fs-year-pts">{y.pts} pts</span>
                  </span>
                  <b>{y.cultivo}</b>
                  <small>{y.texto}</small>
                </button>
              ))}
            </div>

            <div className="fs-why">
              <span className="fs-why-ico">
                <i className="bi bi-flower1" aria-hidden="true"></i>
              </span>
              <div>
                <h3>¿Por qué esta rotación funciona en tu parcela?</h3>
                <p>{why}</p>
              </div>
            </div>

            <div className="fs-kpis">
              {kpis.map((k) => (
                <div key={k.etiqueta} className="fs-kpi">
                  <span>{k.etiqueta}</span>
                  <b>{k.valor}</b>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="fs-row mt-4">
          <section className="fs-card fs-rain-col fs-up fs-d2" aria-labelledby="t-lluvia">
            <div className="fs-card-head">
              <div>
                <div className="fs-eyebrow">NASA POWER · PRECTOTCORR</div>
                <h2 className="fs-card-title xs" id="t-lluvia">
                  Lluvia de junio a septiembre en {placeName}, {rain.anios[0]}–{rain.anios[rain.anios.length - 1]}
                </h2>
              </div>
              <div className="fs-legend">
                <span>
                  <i className="fs-sq" style={{ background: '#23854A' }}></i>Año normal
                </span>
                <span>
                  <i className="fs-sq dry"></i>Año seco (menos de {rain.umbral} mm)
                </span>
              </div>
            </div>
            <RainChart anios={rain.anios} valores={rain.valores} umbral={rain.umbral} />
            <p className="fs-note">
              {rain.real
                ? `Datos reales de NASA POWER para el punto elegido (${climaData.origen === 'fixture' ? 'copia de respaldo sin internet' : climaData.origen === 'cache' ? 'guardados de una consulta anterior' : 'recién consultados'}). Umbral: 80 % de la mediana.`
                : 'Valores ilustrativos mientras carga el clima del punto elegido.'}
            </p>
          </section>

          <section className="fs-card fs-rank-col fs-up fs-d3" aria-labelledby="t-rank">
            <div>
              <div className="fs-eyebrow">Reglas FAO Ecocrop · Bajío</div>
              <h2 className="fs-card-title xs" id="t-rank">Calificación de cultivos para esta parcela</h2>
            </div>
            <ol className="fs-rank">
              {ranking.map((r, i) => (
                <li key={r.cultivo}>
                  <div className="fs-rank-row">
                    <b>
                      {r.cultivo} <span>· {r.etiqueta}</span>
                    </b>
                    <em>{r.pts}/100</em>
                  </div>
                  <div className="fs-track" role="img" aria-label={`${r.cultivo}: ${r.pts} de 100`}>
                    <div className="fs-fill" style={{ width: `${r.pts}%`, background: r.color, animationDelay: `${(0.3 + i * 0.07).toFixed(2)}s` }}></div>
                  </div>
                </li>
              ))}
            </ol>
            {!real && <p className="fs-note">Calificación de ejemplo del diseño; la real sale del motor de reglas (fase 2).</p>}
            <Link className="fs-btn fs-btn-sec mt-auto" to="/cultivo">
              <i className="bi bi-search" aria-hidden="true"></i>¿Y otro cultivo? Pruébalo en tu parcela
            </Link>
          </section>
        </div>

        <section className="fs-dock fs-up fs-d4" aria-labelledby="t-dock">
          <div className="fs-dock-l">
            <span className="fs-dock-ico">
              <i className="bi bi-soundwave" aria-hidden="true"></i>
            </span>
            <div>
              <b id="t-dock">¿Tienes dudas sobre tu rotación?</b>
              <p>Habla al micrófono: Whisper transcribe tu voz y el asistente responde con los datos de tu parcela.</p>
            </div>
          </div>
          <div className="fs-dock-r">
            <div className="fs-dock-bar">
              <button type="button" className="fs-mic lg is-rec" aria-label="Micrófono grabando" aria-pressed="true">
                <i className="bi bi-mic" aria-hidden="true"></i>
              </button>
              <div className="fs-dock-box">
                <span className="fs-wave" aria-hidden="true">
                  <i></i><i></i><i></i><i></i>
                </span>
                <span>{FS_DATOS.preguntaDock}</span>
              </div>
              <Link className="fs-btn fs-dock-btn" to="/analisis" aria-label="Preguntar">
                <span className="lbl">Preguntar</span>
                <i className="bi bi-send" aria-hidden="true"></i>
              </Link>
            </div>
            <div className="fs-dock-status">
              <span className="fs-dot" aria-hidden="true"></span>Escuchando · Whisper transcribiendo en vivo (simulado)
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
