import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import RainChart from '../components/charts/RainChart.jsx';
import { getPrueba } from '../api/client.js';
import { CROP_IDS, CROP_NAMES } from '../crops.js';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import { rainSeriesFrom } from '../lib/parcelaClima.js';
import { cropYearState, yearState } from '../three/parcelState.js';
import { YearControl } from '../year.jsx';
// MapLibre (~1 MB) se carga aparte, cuando la pantalla ya se ve. Es el mismo mapa de «1. Parcela», solo para ver.
const ParcelMap = lazy(() => import('../map/ParcelMap.jsx'));

const VER = { vista: 'relieve', nasa: null, lejos: false };
// Cada tarjeta pone el mapa como le toca, igual que en «1. Parcela».
const TARJETAS = [
  { id: 'plan', titulo: 'Compara 3 rotaciones', escena: { ...VER, clima: 'apagado' } },
  { id: 'alcanzo', titulo: '¿Le hubiera alcanzado la lluvia?', escena: { ...VER, clima: 'anio' } },
  { id: 'lluvia', titulo: 'La lluvia de 25 años', escena: { ...VER, clima: 'anio' } },
  { id: 'cultivos', titulo: 'Qué tan bien le va a cada cultivo', escena: { ...VER, clima: 'apagado' } },
  { id: 'dudas', titulo: 'Lo que no sabemos', escena: { ...VER, clima: 'apagado' } },
  { id: 'llevar', titulo: 'Llévate tu plan', escena: { ...VER, clima: 'apagado' } },
];
const MES = { 6: 'junio', 7: 'julio', 11: 'noviembre' };
const fmt = (n) => Math.round(n).toLocaleString('es-MX');
const pct = (p) => Math.round(p * 100);
const veces = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// A titled list that opens on tap: keeps the card short (evidence, gaps and what to check locally).
function Lista({ titulo, items, abierta = false }) {
  if (!items?.length) return null;
  return (
    <details className="fs-lista" open={abierta}>
      <summary>
        {titulo} ({items.length})
      </summary>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Screen 2: the same satellite map as screen 1 (read only) with the plan's crops on the drawn parcels,
// next to one card at a time (Anterior/Siguiente). Plan and ranking: POST /api/recomendar (server/engine).
// How each crop would have done in each real year: GET /api/recomendar/prueba (the engine's backtest).
export default function Rotacion() {
  const ctx = useParcelaContext();
  const { point, clima, suelo, recomendacion, ensurePoint, recomendar, parcelas, year, agua } = ctx;
  const [paso, setPaso] = useState(0); // año del plan elegido (0, 1, 2)
  const [estrategiaId, setEstrategiaId] = useState('recomendada'); // cuál de las 3 rotaciones se ve (y manda en el mapa)
  const [activa, setActiva] = useState(0); // la única tarjeta que se ve
  const [prueba, setPrueba] = useState(null);
  const tarjetaRef = useRef(null);
  const navegado = useRef(false);
  const labels = selectionLabels(ctx);

  useEffect(() => {
    if (!ensurePoint() && point) recomendar();
  }, [point, ensurePoint, recomendar, ctx.agua, ctx.prioridad]);

  // Cada cultivo contra los años reales de esta parcela (una vez por lugar).
  useEffect(() => {
    if (!point) return undefined;
    let vivo = true;
    setPrueba(null);
    getPrueba(point.lat, point.lon).then((p) => vivo && setPrueba(p), () => {});
    return () => {
      vivo = false;
    };
  }, [point?.lat, point?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // El encabezado es fijo y su alto cambia: el mapa fijo va justo debajo (igual que en «1. Parcela»).
  useEffect(() => {
    const header = document.querySelector('.fs-header');
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => document.documentElement.style.setProperty('--fs-head', `${header.offsetHeight}px`);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!navegado.current) return;
    navegado.current = false;
    tarjetaRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [activa]);
  const ir = (i) => {
    navegado.current = true;
    setActiva(i);
  };

  const rec = recomendacion?.data;
  const outside = recomendacion?.outsideRegion === true;
  const climaData = clima?.data;
  // The 3 rotations of the engine (today, recommended, another goal). An older server only sends `rotacion`.
  const estrategias = rec?.estrategias?.length ? rec.estrategias : rec ? [{ id: 'recomendada', nombre: 'Tu plan de 3 años', rotacion: rec.rotacion }] : [];
  const estrategia = estrategias.find((e) => e.id === estrategiaId) ?? estrategias.find((e) => e.id === 'recomendada') ?? estrategias[0];
  const plan = estrategia?.rotacion ?? [];
  const pasoPlan = plan[Math.min(paso, plan.length - 1)];
  const nombre = (id) => (id ? rec?.cultivos.find((c) => c.id === id)?.nombre ?? CROP_NAMES[id] ?? id : 'Sin sembrar');
  const elegir = (id) => {
    setEstrategiaId(id);
    setPaso(0);
  };

  // Al elegir un año del plan, las parcelas dibujadas pasan al cultivo de ese año (se ve en el mapa).
  const planCrop = pasoPlan?.cultivo;
  useEffect(() => {
    if (planCrop && CROP_IDS.includes(planCrop)) {
      ctx.setParcelas((list) => list.map((p) => (p.cultivo === planCrop ? p : { ...p, cultivo: planCrop })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCrop]);

  // Cómo se ve cada parcela en el año elegido: su cultivo contra SU necesidad de agua (riego no se seca).
  const siembras = useMemo(() => Object.fromEntries((rec?.cultivos ?? []).map((c) => [c.id, c.mes_siembra])), [rec]);
  const base = useMemo(() => yearState(climaData, year.anio), [climaData, year.anio]);
  const estadoDe = (cultivo) => cropYearState(base, prueba?.cultivos?.find((c) => c.id === cultivo), year.anio, agua, siembras[cultivo]);
  const plantasPorParcela = useMemo(
    () => Object.fromEntries(parcelas.map((p) => [p.id, (({ growth, tint }) => ({ growth, tint }))(estadoDe(p.cultivo))])),
    [parcelas, base, prueba, agua, siembras] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rain = useMemo(() => rainSeriesFrom(climaData), [climaData]);
  const tarjeta = TARJETAS[activa];

  function sinPlan() {
    if (outside) return <p className="fs-note">{recomendacion.error}</p>;
    if (recomendacion?.error) {
      return (
        <>
          <p className="fs-note" role="alert">No pude calcular tu plan: {recomendacion.error}</p>
          <button type="button" className="fs-btn fs-btn-sec" onClick={recomendar}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>Intentar de nuevo
          </button>
        </>
      );
    }
    return <p className="fs-note">Calculando tu plan con el clima y el suelo de tu parcela…</p>;
  }

  function cuerpo(id) {
    switch (id) {
      case 'plan': {
        if (!rec) return sinPlan();
        const r = estrategia.resumen;
        return (
          <>
            {estrategias.length > 1 && (
              <div className="fs-estrategias" role="group" aria-label="Rotación que se ve en el mapa">
                {estrategias.map((e) => (
                  <button key={e.id} type="button" className="fs-estrategia" aria-pressed={e.id === estrategia.id} onClick={() => elegir(e.id)}>
                    <span className="fs-estrategia-nombre">
                      {e.nombre}
                      {e.supuesto ? ' (supuesto)' : ''}
                    </span>
                    <span className="fs-estrategia-seq">{e.rotacion.map((s) => nombre(s.cultivo)).join(' → ')}</span>
                    {e.resumen?.riesgo != null && (
                      <span className="fs-estrategia-riesgo">
                        Le falta lluvia en {pct(e.resumen.riesgo)} % de las temporadas
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {estrategia.porque && <p>{estrategia.porque}</p>}
            {r && (
              <ul className="fs-resumen" aria-label="Resumen de esta rotación">
                {r.riesgo != null && (
                  <li>
                    <b>{pct(r.riesgo)} %</b> de temporadas sin lluvia suficiente (con 25 años puede ser de {pct(r.riesgo_rango[0])} a {pct(r.riesgo_rango[1])} %)
                  </li>
                )}
                <li>
                  <b>{r.leguminosas}</b> {r.leguminosas === 1 ? 'temporada' : 'temporadas'} de leguminosa{r.leguminosas ? ' (deja nitrógeno en el suelo)' : ''}
                </li>
                <li>
                  <b>{veces(r.familias, 'familia', 'familias')}</b> de cultivo
                  {r.familia_repetida ? `, repite familia ${veces(r.familia_repetida, 'vez', 'veces')} seguidas` : ', sin repetir familia seguida'}
                </li>
                <li>
                  <b>{fmt(r.lluvia_necesaria_mm)} mm</b> de agua necesitan sus cultivos en 3 años
                </li>
                {r.ingreso_bruto_mxn_ha != null && (
                  <li>
                    <b>${fmt(r.ingreso_bruto_mxn_ha)}</b> por hectárea en 3 años (ingreso bruto del SIAP, sin costos)
                  </li>
                )}
              </ul>
            )}
            <div className="fs-years" role="group" aria-label="Año del plan">
              {plan.map((s, i) => (
                <button key={`${s.anio}-${s.temporada}-${i}`} type="button" className="fs-year" aria-pressed={i === paso} onClick={() => setPaso(i)}>
                  <span className="fs-year-top">
                    <span className="fs-year-tag">
                      Año {s.anio}
                      {s.temporada === 'OI' ? ' · otoño-invierno' : ''}
                    </span>
                  </span>
                  <b>{nombre(s.cultivo)}</b>
                </button>
              ))}
            </div>
            {pasoPlan && (
              <>
                <p>{pasoPlan.porque}</p>
                {siembras[pasoPlan.cultivo] && pasoPlan.temporada === 'PV' && (
                  <p className="fs-note">Siembra sugerida: {MES[siembras[pasoPlan.cultivo]]}, el mes en que mejor le va aquí.</p>
                )}
              </>
            )}
            <Lista titulo="Lo bueno de esta rotación" items={estrategia.beneficios} abierta />
            <Lista titulo="Con qué datos lo sabemos" items={estrategia.evidencia} />
            <Lista titulo="Qué no sabemos" items={estrategia.huecos} />
            <Lista titulo="Revísalo con tu técnico" items={estrategia.revisar} />
            {!parcelas.length && <p className="fs-note">Dibuja tu parcela en «1. Parcela» para verla en el mapa con su cultivo.</p>}
          </>
        );
      }
      case 'alcanzo': {
        if (!climaData) return <p className="fs-note">{clima?.error ?? 'Cargando 25 años de lluvia…'}</p>;
        const cultivos = [...new Set((parcelas.length ? parcelas.map((p) => p.cultivo) : [planCrop]).filter(Boolean))];
        return (
          <>
            <p>Mueve el año y mira cómo se hubiera dado tu cultivo con la lluvia real de ese año.</p>
            <div className="v3d">
              <YearControl id="anio-simulador" year={year} clima={climaData} />
            </div>
            <ul className="facts">
              {cultivos.map((c) => {
                const s = estadoDe(c);
                if (s.riego) return <li key={c}>{CROP_NAMES[c] ?? c}: con riego, la lluvia no lo limita.</li>;
                if (!s.minimo_mm) return <li key={c}>{CROP_NAMES[c] ?? c}: {prueba ? 'no tengo su prueba año por año.' : 'cargando…'}</li>;
                return (
                  <li key={c}>
                    A tu <strong>{(CROP_NAMES[c] ?? c).toLowerCase()}</strong> le llovieron <strong>{fmt(s.lluvia_ciclo_mm)} mm</strong> en su ciclo
                    (sembrado en {MES[s.mes_siembra]}); necesita al menos {fmt(s.minimo_mm)} mm:{' '}
                    <strong>{s.alcanzo ? 'sí le alcanzó' : 'no le alcanzó'}</strong>.
                  </li>
                );
              })}
            </ul>
            <p className="fs-note">Fuente: NASA POWER, lluvia real de cada año. Lo que necesita cada cultivo es aproximado, falta confirmarlo.</p>
          </>
        );
      }
      case 'lluvia':
        if (!rain.real) return <p className="fs-note">{clima?.error ?? 'Cargando 25 años de lluvia…'}</p>;
        return (
          <>
            <p className="fs-dato">
              <strong>{fmt(climaData.lluvia_pv_mediana_mm)} mm</strong> llueven de junio a septiembre en un año normal.
            </p>
            <p>
              En <strong>{climaData.anios_secos.length} de {climaData.lluvia_pv_anual.length} años</strong> llovió menos de {rain.umbral} mm (año seco).
            </p>
            <RainChart anios={rain.anios} valores={rain.valores} umbral={rain.umbral} />
            <p className="fs-note">Fuente: NASA POWER, {climaData.periodo.inicio}–{climaData.periodo.fin}.</p>
          </>
        );
      case 'cultivos':
        if (!rec) return sinPlan();
        return (
          <>
            <ol className="fs-rank">
              {rec.cultivos.map((c) => (
                <li key={c.id}>
                  <div className="fs-rank-row">
                    <b>
                      {c.nombre}{' '}
                      <span>
                        ·{' '}
                        {agua === 'riego'
                          ? 'con riego'
                          : `${pct(c.riesgo)} % de años sin lluvia suficiente${c.riesgo_rango ? ` (puede ser de ${pct(c.riesgo_rango[0])} a ${pct(c.riesgo_rango[1])} %)` : ''}`}
                      </span>
                    </b>
                    <em>{c.puntaje}/100</em>
                  </div>
                  <div className="fs-track" role="img" aria-label={`${c.nombre}: ${c.puntaje} de 100`}>
                    <div className="fs-fill" style={{ width: `${c.puntaje}%`, background: '#23854A' }}></div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="fs-note">Puntaje de 0 a 100 con el clima y el suelo de tu parcela y lo que te importa más.</p>
            <Link className="fs-btn fs-btn-sec" to="/cultivo">
              <i className="bi bi-search" aria-hidden="true"></i>¿Y otro cultivo? Pruébalo en tu parcela
            </Link>
          </>
        );
      case 'dudas':
        if (!rec) return sinPlan();
        return (
          <>
            <p>Esto te ayuda a comparar. Antes de decidir, ten en cuenta lo que los datos no saben de tu parcela:</p>
            <ul className="facts">
              {(rec.incertidumbre ?? []).map((u) => (
                <li key={u.tema}>{u.tema === 'técnico' ? <strong>{u.texto}</strong> : u.texto}</li>
              ))}
            </ul>
            <p className="fs-note">Fuentes: NASA POWER, SoilGrids, SIAP y requerimientos de cultivo aproximados (estilo FAO Ecocrop, por verificar).</p>
          </>
        );
      case 'llevar':
        return (
          <>
            <p>Guarda tu plan para enseñarlo o imprimirlo, o pregúntale al asistente lo que quieras de él.</p>
            <div className="fs-tarjeta-nav">
              <button type="button" className="fs-btn fs-btn-sec" onClick={() => window.print()}>
                <i className="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>Guardar en PDF
              </button>
              <Link className="fs-btn fs-btn-primary" to="/analisis">
                <i className="bi bi-chat-dots" aria-hidden="true"></i>Preguntarle al asistente
              </Link>
            </div>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <Header
        sub="SIMULACIÓN DE ROTACIÓN · VISTA 3D"
        pills={
          <>
            <span className="fs-pill">{labels.lugar}</span>
            <span className="fs-pill is-white">{labels.manejo}</span>
          </>
        }
      />

      <main className="fs-container">
        <section className="fs-card fs-up fs-hero-map" aria-labelledby="t-sim">
          <div className="fs-card-head">
            <div>
              <div className="fs-eyebrow">Tu parcela en 3D</div>
              <h1 className="fs-card-title" id="t-sim">
                {pasoPlan ? `Año ${pasoPlan.anio}: ${nombre(pasoPlan.cultivo)}` : point?.nombre ?? 'Tu parcela'}
              </h1>
            </div>
          </div>

          <div className="fs-flujo">
            <div className="fs-flujo-mapa v3d v3d-embed v3d-hero" role="application" aria-label="Mapa de satélite de tu parcela con su cultivo">
              <Suspense fallback={<p className="status">Cargando el mapa…</p>}>
                <ParcelMap
                  soloVer
                  point={point}
                  parcelas={parcelas}
                  suelo={suelo?.data ?? null}
                  clima={climaData ?? null}
                  year={year}
                  escena={tarjeta.escena}
                  plantasPorParcela={plantasPorParcela}
                />
              </Suspense>
            </div>

            <section key={tarjeta.id} ref={tarjetaRef} className="fs-card fs-tarjeta fs-up" aria-labelledby="t-tarjeta">
              <div className="fs-tarjeta-head">
                <span className="fs-eyebrow">
                  {activa + 1} de {TARJETAS.length}
                </span>
                <h2 className="fs-card-title xs" id="t-tarjeta">
                  {tarjeta.titulo}
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
          </div>
        </section>
      </main>
    </>
  );
}
