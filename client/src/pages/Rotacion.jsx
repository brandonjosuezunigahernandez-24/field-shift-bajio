import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import RainChart from '../components/charts/RainChart.jsx';
import ComparaRotaciones from '../components/ComparaRotaciones.jsx';
import PanelPasos from '../components/PanelPasos.jsx';
import AvisoEjemplo from '../components/AvisoEjemplo.jsx';
import { getPrueba } from '../api/client.js';
import { CROP_IDS, CROP_NAMES } from '../crops.js';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import { rainSeriesFrom, withYears } from '../lib/parcelaClima.js';
import { cropYearState, yearState } from '../three/parcelState.js';
import { YearControl } from '../year.jsx';
// MapLibre (~1 MB) se carga aparte, cuando la pantalla ya se ve. Es el mismo mapa de «1. Parcela», solo para ver.
const ParcelMap = lazy(() => import('../map/ParcelMap.jsx'));

const VER = { vista: 'relieve', nasa: null, lejos: false };
// Cada tarjeta pone el mapa como le toca, igual que en «1. Parcela».
const TARJETAS = [
  { id: 'plan', titulo: 'Tus 3 rotaciones', escena: { ...VER, clima: 'apagado' } },
  { id: 'comparar', titulo: 'Compáralas lado a lado', escena: { ...VER, clima: 'apagado' } },
  { id: 'alcanzo', titulo: '¿Le hubiera alcanzado la lluvia?', escena: { ...VER, clima: 'anio' } },
  { id: 'lluvia', titulo: 'La lluvia de {n} años', escena: { ...VER, clima: 'anio' } },
  { id: 'cultivos', titulo: 'Qué tan bien le va a cada cultivo', escena: { ...VER, clima: 'apagado' } },
  { id: 'dudas', titulo: 'Lo que no sabemos', escena: { ...VER, clima: 'apagado' } },
  { id: 'llevar', titulo: 'Llévate tu plan', escena: { ...VER, clima: 'apagado' } },
];
const MES = { 6: 'junio', 7: 'julio', 11: 'noviembre' };
const fmt = (n) => Math.round(n).toLocaleString('es-MX');
const pct = (p) => Math.round(p * 100);
// Frost and heat of a crop's cycle in the real years (c.helada, c.calor): only the ones that did happen.
const extremosTexto = (c) =>
  [
    c.helada?.anios.length > 0 && `helada que daña en ${c.helada.anios.length} de ${c.helada.anios_total} años`,
    c.calor?.anios.length > 0 && `calor que daña en ${c.calor.anios.length} de ${c.calor.anios_total} años`,
  ]
    .filter(Boolean)
    .map((t) => ` · ${t}`)
    .join('');

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

// Screen 2: the same satellite map as screen 1 (read only) with the plan's crops on the drawn parcels,
// next to one step at a time (PanelPasos: Anterior and Siguiente never move). Plan and ranking: POST /api/recomendar (server/engine).
// How each crop would have done in each real year: GET /api/recomendar/prueba (the engine's backtest).
export default function Rotacion() {
  const ctx = useParcelaContext();
  const { point, clima, suelo, recomendacion, ensurePoint, recomendar, parcelas, year, agua } = ctx;
  const [paso, setPaso] = useState(0); // año del plan elegido (0, 1, 2)
  const [estrategiaId, setEstrategiaId] = useState('recomendada'); // cuál de las 3 rotaciones se ve (y manda en el mapa)
  const [activa, setActiva] = useState(0); // la única tarjeta que se ve
  const [prueba, setPrueba] = useState(null);
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

  const rec = recomendacion?.data;
  const outside = recomendacion?.outsideRegion === true;
  const climaData = clima?.data;
  // The 3 rotations of the engine (today, recommended, another goal). An older server only sends `rotacion`.
  const estrategias = rec?.estrategias?.length ? rec.estrategias : rec ? [{ id: 'recomendada', nombre: 'Tu plan de 3 años', rotacion: rec.rotacion }] : [];
  const estrategia = estrategias.find((e) => e.id === estrategiaId) ?? estrategias.find((e) => e.id === 'recomendada') ?? estrategias[0];
  const plan = estrategia?.rotacion ?? [];
  const pasoPlan = plan[Math.min(paso, plan.length - 1)];
  const nombre = (id) => (id ? rec?.cultivos.find((c) => c.id === id)?.nombre ?? CROP_NAMES[id] ?? id : 'Sin sembrar');
  const corto = (id) => (id ? nombre(id).split(' ')[0] : 'Sin sembrar'); // "Maíz grano" -> "Maíz"
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
        return (
          <>
            {estrategias.length > 1 && (
              <>
                <p className="fs-paso-guia">Toca una para verla en el mapa.</p>
                <div className="fs-estrategias" role="radiogroup" aria-label="Rotación que se ve en el mapa">
                  {estrategias.map((e) => {
                    const on = e.id === estrategia.id;
                    return (
                      <button key={e.id} type="button" role="radio" aria-checked={on} className="fs-estrategia" onClick={() => elegir(e.id)}>
                        <span className="fs-estrategia-nombre">
                          <i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'}`} aria-hidden="true"></i>
                          {e.nombre}
                        </span>
                        <span className="fs-estrategia-seq">{e.rotacion.map((s) => corto(s.cultivo)).join(' → ')}</span>
                        {e.supuesto && <span className="fs-estrategia-nota">Supuesto: lo más sembrado aquí</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {estrategia.porque && <p className="fs-estrategia-porque">{estrategia.porque}</p>}
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
            <div className="fs-listas">
              <Lista titulo="Lo bueno de esta rotación" items={estrategia.beneficios} />
              <Lista titulo="Con qué datos lo sabemos" items={estrategia.evidencia} />
              <Lista titulo="Qué no sabemos" items={estrategia.huecos} />
              <Lista titulo="Revísalo con tu técnico" items={estrategia.revisar} />
            </div>
            {!parcelas.length && <p className="fs-note">Dibuja tu parcela en «1. Parcela» para verla en el mapa con su cultivo.</p>}
          </>
        );
      }
      case 'comparar':
        if (!rec) return sinPlan();
        return (
          <>
            <ComparaRotaciones estrategias={estrategias} activa={estrategia.id} agua={agua} />
            <p className="fs-note">Para ver otra en verde y en el mapa, elígela en «Tus 3 rotaciones».</p>
          </>
        );
      case 'alcanzo': {
        if (!climaData) return <p className="fs-note">{clima?.error ?? 'Cargando la lluvia de cada año…'}</p>;
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
            <p className="fs-note">Fuente: NASA POWER, lluvia real de cada año. Lo que necesita cada cultivo sale de la FAO (rangos generales de la especie, no de una variedad del Bajío); el agua del garbanzo y del brócoli sigue aproximada.</p>
          </>
        );
      }
      case 'lluvia':
        if (!rain.real) return <p className="fs-note">{clima?.error ?? 'Cargando la lluvia de cada año…'}</p>;
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
                        {extremosTexto(c)}
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
            <p className="fs-note">Fuentes: NASA POWER, SoilGrids, SIAP y requerimientos de cultivo de la FAO (Ecocrop y Manual No. 3; el agua del garbanzo y del brócoli sigue aproximada).</p>
          </>
        );
      case 'llevar':
        return (
          <>
            <p>Guarda tu plan para enseñarlo o imprimirlo, o pregúntale al asistente lo que quieras de él.</p>
            <button type="button" className="fs-btn fs-btn-sec fs-btn-block" onClick={() => window.print()}>
              <i className="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>Guardar en PDF
            </button>
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

      <main className="fs-container fs-app">
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

          <PanelPasos
            lugar={
              <>
                <i className="bi bi-geo-alt-fill" aria-hidden="true"></i> {(point?.nombre ?? 'Tu parcela').replace(/\.$/, '')}
                {pasoPlan?.cultivo ? ` · en el mapa: año ${pasoPlan.anio}, ${corto(pasoPlan.cultivo).toLowerCase()}` : ''}
              </>
            }
            paso={activa}
            total={TARJETAS.length}
            titulo={withYears(tarjeta.titulo, climaData)}
            onAnterior={() => setActiva(activa - 1)}
            onSiguiente={() => setActiva(activa + 1)}
            final={
              <Link className="fs-btn fs-btn-primary" to="/analisis">
                <i className="bi bi-chat-dots" aria-hidden="true"></i>Ir al asistente
              </Link>
            }
          >
            <AvisoEjemplo />
            {cuerpo(tarjeta.id)}
          </PanelPasos>
        </div>
      </main>
    </>
  );
}
