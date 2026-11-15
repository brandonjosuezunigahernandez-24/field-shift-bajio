import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import RainChart from '../components/charts/RainChart.jsx';
import { getPrueba, postRecomendar } from '../api/client.js';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import { readHistory, reducedMotion, saveHistory } from '../lib/fs.js';

// Screen 4: "would this crop work on my plot?". It asks the same rule engine as the 3D screen
// (POST /api/recomendar -> server/engine) for this plot, with the water option chosen here, and shows
// the tested crop's score, risk and reasons next to the plot's plan.
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
// "maiz", "Maíz grano" or "brocoli" -> the engine's crop.
const findCrop = (text, cultivos) => {
  const q = norm(text);
  return q ? cultivos.find((c) => c.id === q || q.startsWith(c.id) || norm(c.nombre).startsWith(q)) : undefined;
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export default function Cultivo() {
  const ctx = useParcelaContext();
  const { point, ensurePoint, prioridad, agua: aguaPerfil } = ctx;
  const labels = selectionLabels(ctx);
  const [params] = useSearchParams();

  const [usedDefault, setUsedDefault] = useState(false);
  const [agua, setAgua] = useState(aguaPerfil === 'riego' ? 'riego' : 'temporal');
  const [rec, setRec] = useState(null); // null while loading, { data } or { error }
  const [prueba, setPrueba] = useState(null); // every rain-fed crop against the real years, or null
  const [query, setQuery] = useState(params.get('c') ?? ''); // ?c=frijol opens the test directly
  const [probado, setProbado] = useState(params.get('c') ?? ''); // text the farmer tested
  const [history, setHistory] = useState(readHistory);
  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const verdictRef = useRef(null);

  useEffect(() => {
    if (ensurePoint()) setUsedDefault(true);
  }, [ensurePoint]);

  useEffect(() => {
    if (!point) return;
    let live = true;
    setRec(null);
    postRecomendar({ lat: point.lat, lon: point.lon, agua, prioridad }).then(
      (data) => live && setRec({ data }),
      (err) => live && setRec({ error: err.message, outsideRegion: err.outsideRegion === true })
    );
    return () => {
      live = false;
    };
  }, [point, agua, prioridad]);

  // The year-by-year test is an extra: if it fails, the rest of the screen still works.
  useEffect(() => {
    if (!point) return;
    let live = true;
    setPrueba(null);
    getPrueba(point.lat, point.lon).then((p) => live && setPrueba(p), () => {});
    return () => {
      live = false;
    };
  }, [point]);

  const data = rec?.data;
  const cultivos = data?.cultivos ?? [];
  const crop = findCrop(probado, cultivos);
  const missing = Boolean(data && norm(probado) && !crop);
  const placeName = point?.nombre ?? 'Celaya, Gto.';

  useEffect(() => {
    if (!crop) return;
    setHistory(saveHistory(crop.nombre));
    verdictRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [crop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function probar(nombre) {
    setQuery(nombre);
    setProbado(nombre);
  }

  function onSubmit(e) {
    e.preventDefault();
    setProbado(query);
  }

  // Outside Guanajuato and Querétaro there is no recommendation, but GET /api/clima and /api/suelo still describe the plot.
  const clima = data?.clima ?? ctx.clima?.data;
  const suelo = data?.suelo ?? ctx.suelo?.data;
  const sinDato = 'sin dato';
  const tempPV = clima ? mean(clima.temp_media_mensual.filter((m) => clima.meses_pv.includes(m.mes) && m.t_media_c != null).map((m) => m.t_media_c)) : null;
  const contexto = clima
    ? [
        ['bi-cloud-rain', 'Lluvia jun–sep, año normal', `${Math.round(clima.lluvia_pv_mediana_mm)} mm`],
        ['bi-thermometer-half', 'Temp. media jun–sep', tempPV == null ? sinDato : `${tempPV.toFixed(1)} °C`],
        ['bi-sun', 'Años secos', `${clima.anios_secos.length} / ${clima.lluvia_pv_anual.length}`],
        ['bi-droplet', 'pH 0–30 cm', suelo?.ph == null ? sinDato : suelo.ph.toFixed(1)],
        ['bi-layers', 'Arcilla 0–30 cm', suelo?.arcilla_pct == null ? sinDato : `${Math.round(suelo.arcilla_pct)}%`],
        ['bi-hourglass-split', 'Arena 0–30 cm', suelo?.arena_pct == null ? sinDato : `${Math.round(suelo.arena_pct)}%`],
      ]
    : [];

  return (
    <>
      <Header
        sub="PRUEBA DE CULTIVO · MOTOR DE REGLAS"
        pills={
          <>
            <span className="fs-pill">{labels.lugar}</span>
            <span className="fs-pill is-white">{labels.manejo}</span>
          </>
        }
      />

      <main className="fs-container">
        <div className="fs-row">
          <section className="fs-card fs-test-in fs-up" aria-labelledby="t-probar">
            <div>
              <div className="fs-eyebrow">Paso 4 · Prueba de cultivo</div>
              <h1 className="fs-card-title" id="t-probar">¿Funcionaría este cultivo en tu parcela?</h1>
              <p className="fs-parcel-line">
                <i className="bi bi-geo-alt" aria-hidden="true"></i>
                <span>{placeName}</span> · <span className="fs-mono">{point ? `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}` : '—'}</span>
                <Link to="/">Cambiar parcela</Link>
              </p>
              {usedDefault && <p className="fs-note">No elegiste parcela en el paso 1; usamos Celaya como ejemplo.</p>}
            </div>

            <form className="fs-test-form" onSubmit={onSubmit} noValidate>
              <label htmlFor="cultivo" className="fs-q mb-0">Escribe el cultivo que quieres probar</label>
              <div className="fs-test-bar">
                <span className="fs-test-ico" aria-hidden="true">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  id="cultivo"
                  ref={inputRef}
                  className="fs-input fs-test-input"
                  type="text"
                  list="lista-cultivos"
                  autoComplete="off"
                  placeholder="Por ejemplo: frijol, sorgo, maíz…"
                  aria-describedby="err-cultivo"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <datalist id="lista-cultivos">
                  {cultivos.map((c) => (
                    <option key={c.id} value={c.nombre}></option>
                  ))}
                </datalist>
                <button type="submit" className="fs-btn fs-btn-primary" disabled={!norm(query)}>
                  <i className="bi bi-cpu" aria-hidden="true"></i>
                  <span className="lbl">Analizar</span>
                </button>
              </div>
              <p className="fs-test-err" id="err-cultivo" role="alert" hidden={!missing}>
                No tengo «{probado}» entre los cultivos que el motor evalúa {agua === 'riego' ? 'con riego' : 'de temporal'}
                {agua === 'temporal' ? '. Con riego entran también los de otoño-invierno.' : '.'}
              </p>
            </form>

            <div>
              <p className="fs-q" id="q-manejo">Manejo del agua para la prueba</p>
              <div className="fs-seg" role="group" aria-labelledby="q-manejo">
                <button type="button" aria-pressed={agua === 'temporal'} onClick={() => setAgua('temporal')}>Temporal · solo lluvia</button>
                <button type="button" aria-pressed={agua === 'riego'} onClick={() => setAgua('riego')}>Con riego</button>
              </div>
            </div>

            {cultivos.length > 0 && (
              <div className="fs-quick">
                <span className="fs-demo-l">Cultivos que evalúa el motor:</span>
                <div className="fs-chips">
                  {cultivos.map((c) => (
                    <button key={c.id} type="button" className="fs-btn fs-btn-pill" onClick={() => probar(c.nombre)}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.length > 0 && (
              <div className="fs-quick">
                <span className="fs-demo-l">Probados recientemente:</span>
                <div className="fs-chips">
                  {history.map((nombre) => (
                    <button key={nombre} type="button" className="fs-btn fs-btn-pill" onClick={() => probar(nombre)}>
                      <i className="bi bi-clock-history" aria-hidden="true"></i>
                      {nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="fs-card fs-test-ctx fs-up fs-d1" aria-labelledby="t-ctx">
            <div className="fs-card-head">
              <div>
                <div className="fs-eyebrow">Datos de tu parcela</div>
                <h2 className="fs-card-title xs" id="t-ctx">Contra esto se compara el cultivo</h2>
              </div>
              <span className="fs-badge-soft">{agua === 'riego' ? 'Con riego' : 'Temporal'}</span>
            </div>
            {rec?.error && !rec.outsideRegion && <p className="fs-test-err" role="alert">{rec.error}</p>}
            {!rec && <p className="fs-note">Calculando con el motor de reglas…</p>}
            <div className="fs-ctx-grid">
              {contexto.map((d) => (
                <div key={d[1]} className="fs-ctx">
                  <span className="fs-ctx-ico">
                    <i className={`bi ${d[0]}`} aria-hidden="true"></i>
                  </span>
                  <span>
                    <small>{d[1]}</small>
                    <b>{d[2]}</b>
                  </span>
                </div>
              ))}
            </div>
            {clima && <p className="fs-note fs-mono">{(data?.fuentes ?? [clima.fuente, suelo?.fuente].filter(Boolean)).join(' · ')}</p>}
          </section>
        </div>

        <div id="resultado" className="mt-4" aria-live="polite" ref={resultRef}>
          {rec?.outsideRegion ? (
            <div className="fs-empty fs-up fs-d2" role="status">
              <span className="fs-empty-ico">
                <i className="bi bi-geo-alt" aria-hidden="true"></i>
              </span>
              <b>Por ahora solo probamos cultivos en Guanajuato y Querétaro</b>
              <p>{rec.error}</p>
            </div>
          ) : crop ? (
            <Resultado
              crop={crop}
              data={data}
              prueba={prueba}
              agua={agua}
              placeName={placeName}
              verdictRef={verdictRef}
              onProbar={probar}
              onOtro={() => {
                setQuery('');
                inputRef.current?.focus();
                window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
              }}
            />
          ) : (
            <div className="fs-empty fs-up fs-d2">
              <span className="fs-empty-ico">
                <i className="bi bi-flower1" aria-hidden="true"></i>
              </span>
              <b>Escribe un cultivo o elige uno de la lista</b>
              <p>Te diremos qué tan bien queda en tu parcela, por qué, y cómo se compara con tu plan.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Resultado({ crop, data, prueba, agua, placeName, verdictRef, onProbar, onOtro }) {
  const { cultivos, rotacion } = data;
  const byId = Object.fromEntries(cultivos.map((c) => [c.id, c]));
  const lugar = cultivos.findIndex((c) => c.id === crop.id) + 1;
  const enPlan = rotacion.some((s) => s.cultivo === crop.id);
  // shortcut: a plan slot shows the crop's best-season score (only brócoli has two seasons); add per-slot scores to the engine if that matters.
  const comp = [{ nombre: crop.nombre, sub: 'tu prueba', total: crop.puntaje, yo: true }].concat(
    rotacion.map((s) => ({ nombre: byId[s.cultivo]?.nombre ?? s.cultivo, sub: `año ${s.anio} · ${s.temporada}`, total: byId[s.cultivo]?.puntaje ?? 0 }))
  );
  const mejores = cultivos.filter((c) => c.puntaje > crop.puntaje).slice(0, 3);
  const cls = enPlan ? 'si' : 'con';

  return (
    <>
      <div className="fs-row">
        <section className={`fs-verdict ${cls} fs-up`} aria-labelledby="t-ver">
          <div className="fs-verdict-top">
            <Anillo total={crop.puntaje} cls={cls} />
            <div>
              <div className="fs-eyebrow">Veredicto · temporada {crop.temporada}</div>
              <h2 id="t-ver" ref={verdictRef} tabIndex={-1}>
                <i className={`bi ${enPlan ? 'bi-check2-circle' : 'bi-exclamation-circle'}`} aria-hidden="true"></i>
                {enPlan ? 'Ya está en tu plan' : 'No entró en tu plan de 3 años'}
              </h2>
              <p className="fs-verdict-crop">
                {crop.nombre} en {placeName} · {agua === 'riego' ? 'con riego' : 'temporal'}
              </p>
            </div>
          </div>
          <p className="fs-verdict-sum">
            Queda en el lugar {lugar} de {cultivos.length} cultivos para tu parcela, con {crop.puntaje} de 100
            {agua === 'temporal' ? ` y riesgo de año seco de ${Math.round(crop.riesgo * 100)} %.` : '.'}
          </p>
          <div className="fs-verdict-cmp">
            <span className="fs-eyebrow">Comparado con tu plan</span>
            {comp.map((k, i) => (
              <div key={`${k.nombre}-${k.sub}`} className={`fs-cmp${k.yo ? ' yo' : ''}`}>
                <span>
                  {k.nombre} <small>{k.sub}</small>
                </span>
                <em>{k.total}</em>
                <div className="fs-track">
                  <div className="fs-fill" style={{ width: `${k.total}%`, animationDelay: `${(0.3 + i * 0.08).toFixed(2)}s` }}></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="fs-card fs-alt-col fs-up fs-d1" aria-labelledby="t-alt">
          <div>
            <div className="fs-eyebrow">Alternativas para tu parcela</div>
            <h2 className="fs-card-title xs" id="t-alt">Con mejor puntaje que {crop.nombre.toLowerCase()}</h2>
          </div>
          <div className="fs-alts">
            {mejores.length ? (
              mejores.map((a) => (
                <button key={a.id} type="button" className="fs-alt" onClick={() => onProbar(a.nombre)}>
                  <span className="fs-alt-top">
                    <b>{a.nombre}</b>
                    <em>{a.puntaje}</em>
                  </span>
                  <span className="fs-track">
                    <span className="fs-fill" style={{ width: `${a.puntaje}%` }}></span>
                  </span>
                  <span className="fs-alt-bot">
                    <small>
                      Temporada {a.temporada} · Probar <i className="bi bi-arrow-right" aria-hidden="true"></i>
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className="fs-note">Es el cultivo con mejor puntaje para tu parcela con lo que pediste.</p>
            )}
          </div>
        </section>
      </div>

      {agua === 'temporal' && prueba?.cultivos.some((c) => c.id === crop.id) ? (
        <Historia key={crop.id} crop={crop} prueba={prueba} />
      ) : (
        agua === 'riego' && (
          <p className="fs-note mt-3">Con riego la lluvia no limita al cultivo, así que la prueba año por año solo se muestra en temporal.</p>
        )
      )}

      <section className="fs-card mt-4 fs-up fs-d2" aria-labelledby="t-fac">
        <div>
          <div className="fs-eyebrow">Por qué · con los datos de tu parcela</div>
          <h2 className="fs-card-title xs" id="t-fac">Lo que vio el motor de reglas</h2>
        </div>
        <div className="fs-reasons">
          {crop.razones.map((r) => (
            <div key={r} className="fs-reason">
              <p>{r}</p>
            </div>
          ))}
        </div>
        <div className="fs-actions mt-3">
          <Link className="fs-btn fs-btn-primary" to="/analisis">
            <i className="bi bi-robot" aria-hidden="true"></i>Preguntar al asistente
          </Link>
          <button type="button" className="fs-btn fs-btn-sec" onClick={onOtro}>
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Probar otro cultivo
          </button>
        </div>
      </section>
      <p className="fs-note mt-3">
        Mismo motor de reglas que el Simulador 3D. Lo que necesita cada cultivo son valores aproximados de FAO Ecocrop que falta confirmar.
      </p>
    </>
  );
}

function Anillo({ total, cls }) {
  const off = Math.round(264 * (1 - total / 100));
  return (
    <div className={`fs-ring fs-ring-lg ${cls}`} role="img" aria-label={`Puntaje ${total} de 100`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="trk" cx="50" cy="50" r="42" fill="none" strokeWidth="10" />
        <circle className="arc" cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={off} />
      </svg>
      <span>
        <b>{total}</b>
        <small>/100</small>
      </span>
    </div>
  );
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const lista = (anios) => anios.join(', ');

// The tested crop against every real year of the plot (GET /api/recomendar/prueba): did the rain of its
// cycle reach what it needs? The farmer can move the sowing month and put a second crop next to it.
function Historia({ crop, prueba }) {
  const [mes, setMes] = useState(6);
  const [rivalId, setRivalId] = useState('');
  const entry = prueba.cultivos.find((c) => c.id === crop.id);
  const rival = prueba.cultivos.find((c) => c.id === rivalId);
  const siembra = (c) => c.siembras.find((s) => s.mes_siembra === mes);
  const s = siembra(entry);
  const junio = entry.siembras.find((x) => x.mes_siembra === 6);
  const nombre = crop.nombre.toLowerCase();
  const total = s.anios.length;
  const rango = `de ${MESES[s.meses[0] - 1]} a ${MESES[s.meses.at(-1) - 1]}`;

  // Years in which one crop had enough rain and the other did not.
  const sr = rival && siembra(rival);
  const soloYo = sr ? s.anios.filter((y, i) => y.alcanzo && !sr.anios[i].alcanzo).map((y) => y.anio) : [];
  const soloRival = sr ? s.anios.filter((y, i) => !y.alcanzo && sr.anios[i].alcanzo).map((y) => y.anio) : [];

  return (
    <section className="fs-card mt-4 fs-up fs-d2" aria-labelledby="t-hist">
      <div className="fs-card-head">
        <div>
          <div className="fs-eyebrow">{s.anios.length} años reales · NASA POWER</div>
          <h2 className="fs-card-title xs" id="t-hist">Si lo hubieras sembrado cada año desde {s.anios[0].anio}</h2>
        </div>
        <div className="fs-seg" role="group" aria-label="Mes de siembra">
          {entry.siembras.map((x) => (
            <button key={x.mes_siembra} type="button" aria-pressed={mes === x.mes_siembra} onClick={() => setMes(x.mes_siembra)}>
              Sembrar en {MESES[x.mes_siembra - 1]}
            </button>
          ))}
        </div>
      </div>

      <p className="fs-verdict-sum" aria-live="polite">
        A {nombre} le alcanzó la lluvia en <strong>{total - s.anios_bajo_minimo.length} de {total} años</strong> (necesita {entry.minimo_mm} mm {rango}).{' '}
        {s.anios_bajo_minimo.length ? `No le alcanzó en: ${lista(s.anios_bajo_minimo)}.` : 'Le alcanzó todos los años.'}
        {mes !== 6 && ` Sembrando en ${MESES[mes - 1]} en vez de junio, los años en que no alcanza pasan de ${junio.anios_bajo_minimo.length} a ${s.anios_bajo_minimo.length}.`}
      </p>
      <Barras siembra={s} minimo={entry.minimo_mm} />

      <div className="mt-3">
        <label htmlFor="rival" className="fs-q">Compáralo con otro cultivo en los mismos años</label>
        <select id="rival" className="form-select" value={rivalId} onChange={(e) => setRivalId(e.target.value)}>
          <option value="">Sin comparar</option>
          {prueba.cultivos.filter((c) => c.id !== crop.id).map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>
      {rival && (
        <>
          <p className="fs-verdict-sum mt-3" aria-live="polite">
            A {rival.nombre.toLowerCase()} le alcanzó en <strong>{total - sr.anios_bajo_minimo.length} de {total} años</strong> (necesita {rival.minimo_mm} mm).{' '}
            {soloRival.length ? `En ${soloRival.length} años le alcanzó a ${rival.nombre.toLowerCase()} y a ${nombre} no: ${lista(soloRival)}. ` : ''}
            {soloYo.length ? `En ${soloYo.length} años le alcanzó a ${nombre} y a ${rival.nombre.toLowerCase()} no: ${lista(soloYo)}.` : ''}
            {!soloRival.length && !soloYo.length ? 'Les alcanzó y les faltó en los mismos años.' : ''}
          </p>
          <Barras siembra={sr} minimo={rival.minimo_mm} />
        </>
      )}
      <p className="fs-note mt-3">
        Cada barra es la lluvia real del ciclo del cultivo en ese año; la línea es lo que necesita. Cambiar el mes de siembra solo recalcula la lluvia, no la
        temperatura. Lo que necesita cada cultivo son valores aproximados que falta confirmar.
      </p>
    </section>
  );
}

function Barras({ siembra, minimo }) {
  const anios = useMemo(() => siembra.anios.map((y) => y.anio), [siembra]);
  const valores = useMemo(() => siembra.anios.map((y) => y.lluvia_mm), [siembra]);
  return <RainChart anios={anios} valores={valores} umbral={minimo} etiquetaBajo="no le alcanzó" />;
}
