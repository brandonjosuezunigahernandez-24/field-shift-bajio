import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import RadarChart from '../components/charts/RadarChart.jsx';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import FS_DATOS from '../data/datosDemo.js';
import { readHistory, reducedMotion, saveHistory } from '../lib/fs.js';
import { engineContextFrom } from '../lib/parcelaClima.js';
import { EST, FACT, PLANTILLA_FICHA, TOL_TXT, VER, acciones, buscar, evaluar, fichaACultivo, fmt, leerTextoPlano, norm, parecidos, porQue, resumen } from '../lib/cropEngine.js';

const CULTIVOS = FS_DATOS.cultivos;

// Screen 4: "would this crop work on my plot?". The rule engine runs in the browser
// (lib/cropEngine.js) against the real climate and soil of the chosen point; the crop ranges are
// the design's 22 illustrative crops. The reference crop (year 1 of the plan) is sorgo.
export default function Cultivo() {
  const ctx = useParcelaContext();
  const { point, clima, suelo, recomendacion, ensurePoint, recomendar, agua: aguaPerfil } = ctx;
  const labels = selectionLabels(ctx);
  const [params] = useSearchParams();

  const [usedDefault, setUsedDefault] = useState(false);
  const [agua, setAgua] = useState(aguaPerfil === 'riego' ? 'riego' : 'temporal');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null); // { msg, sugerencias }
  const [attached, setAttached] = useState(null); // { file, info, thumb, cultivo }
  const [last, setLast] = useState(null); // last analysed crop
  const [loadingSteps, setLoadingSteps] = useState(null); // { nombre, done }
  const [history, setHistory] = useState(readHistory);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const verdictRef = useRef(null);

  // The plan to compare against is this plot's, even if the farmer skipped the 3D screen.
  useEffect(() => {
    if (ensurePoint()) setUsedDefault(true);
    else if (point) recomendar();
  }, [point, ensurePoint, recomendar, ctx.agua, ctx.prioridad]);

  const engineCtx = useMemo(() => engineContextFrom(clima?.data, suelo?.data, point?.id), [clima, suelo, point]);
  const placeName = point?.nombre ?? 'Celaya, Gto.';

  // Plan to compare against: the real rotation if we have it, else the design's.
  const plan = useMemo(() => {
    const rec = recomendacion?.data;
    const steps = rec
      ? rec.rotacion.map((s) => ({ nombre: rec.cultivos.find((c) => c.id === s.cultivo)?.nombre ?? s.cultivo, anio: `año ${s.anio}`, id: s.cultivo }))
      : FS_DATOS.rotacion.map((y) => ({ nombre: y.cultivo, anio: y.etiqueta.split('· ')[1], id: null }));
    return steps
      .map((s) => {
        const pc = CULTIVOS.find((k) => k.id === s.id) || CULTIVOS.find((k) => k.nombre === s.nombre) || buscar(s.nombre, CULTIVOS);
        return pc ? { ...s, r: evaluar(pc, engineCtx, agua) } : null;
      })
      .filter(Boolean);
  }, [recomendacion, engineCtx, agua]);
  const reference = plan[0] || { nombre: CULTIVOS[0].nombre, r: evaluar(CULTIVOS[0], engineCtx, agua) };

  const result = useMemo(() => (last ? evaluar(last, engineCtx, agua) : null), [last, engineCtx, agua]);

  function showError(msg, sugerencias) {
    setError({ msg, sugerencias: sugerencias || [] });
  }

  function analizar(c) {
    setError(null);
    setLast(null);
    setHistory(saveHistory(c.nombre));
    const pasos = [`Requisitos de ${c.nombre} · FAO Ecocrop`, 'Lluvia y temperatura de tu punto · NASA POWER', 'pH y arcilla del suelo · SoilGrids', 'Calculando el veredicto'];
    setLoadingSteps({ nombre: c.nombre, pasos, done: 0 });
    if (reducedMotion()) {
      setLoadingSteps(null);
      setLast(c);
      return;
    }
    let i = 0;
    const tick = () => {
      i += 1;
      if (i <= pasos.length) {
        setLoadingSteps((s) => (s ? { ...s, done: i } : s));
        setTimeout(tick, 280);
      } else {
        setTimeout(() => {
          setLoadingSteps(null);
          setLast(c);
        }, 200);
      }
    };
    setTimeout(tick, 280);
  }

  function desdeTexto(txt) {
    if (!norm(txt)) {
      showError('Escribe el nombre de un cultivo o adjunta su ficha.');
      return;
    }
    const c = buscar(txt, CULTIVOS);
    if (c) {
      setQuery(c.nombre);
      analizar(c);
    } else {
      showError(`No tengo los requisitos de "${txt}". Adjunta su ficha con los rangos o prueba otro nombre.`, parecidos(txt, CULTIVOS));
    }
  }

  function probar(nombre) {
    setQuery(nombre);
    desdeTexto(nombre);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (attached?.cultivo && (!query || query === attached.cultivo.nombre)) analizar(attached.cultivo);
    else desdeTexto(query);
  }

  // Focus the verdict and scroll to it once a result is drawn (as the design does).
  useEffect(() => {
    if (!result || !verdictRef.current) return;
    verdictRef.current.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [result?.cultivo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?c=aguacate opens the analysis directly
  useEffect(() => {
    const q = params.get('c');
    if (q) probar(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Attached crop sheet ---------- */
  function procesarArchivo(f) {
    if (!f) return;
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ');
    if (/^image\//.test(f.type)) {
      const url = URL.createObjectURL(f);
      const c = buscar(base, CULTIVOS);
      if (c) {
        setAttached({ file: f, info: `Foto · identificado como ${c.nombre}`, thumb: url, cultivo: c });
        setQuery(c.nombre);
        analizar(c);
      } else {
        setAttached({ file: f, info: 'Foto · escribe qué cultivo es', thumb: url, cultivo: null });
        showError('No reconocí el cultivo de la foto por su nombre de archivo. Escríbelo arriba.');
        inputRef.current?.focus();
      }
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      let obj;
      try {
        obj = /\.json$/i.test(f.name) ? JSON.parse(rd.result) : leerTextoPlano(String(rd.result));
      } catch {
        showError('No pude leer el archivo. Revisa que el .json esté bien escrito o usa la plantilla.');
        return;
      }
      if (Array.isArray(obj)) obj = obj[0] || {};
      const c = fichaACultivo(obj, base, CULTIVOS);
      if (!c) {
        setAttached({ file: f, info: 'No encontré nombre ni rangos', thumb: null, cultivo: null });
        showError('La ficha no trae un cultivo que conozca ni sus rangos. Usa la plantilla.');
        return;
      }
      setAttached({ file: f, info: c.propio ? `Ficha propia · ${c.nombre}` : `Ficha leída · ${c.nombre}`, thumb: null, cultivo: c });
      setQuery(c.nombre);
      analizar(c);
    };
    rd.onerror = () => showError('No pude leer el archivo.');
    rd.readAsText(f);
  }

  function descargarPlantilla() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(PLANTILLA_FICHA, null, 2)], { type: 'application/json' }));
    a.download = 'ficha-cultivo.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const n = engineCtx.secos_idx.length;
  const contexto = [
    ['bi-cloud-rain', 'Lluvia jun–sep', `${engineCtx.lluvia_ciclo} mm`],
    ['bi-thermometer-half', 'Temp. del ciclo', `${engineCtx.temp_ciclo.toFixed(1)} °C`],
    ['bi-droplet', 'pH 0–30 cm', engineCtx.ph.toFixed(1)],
    ['bi-layers', 'Arcilla 0–30 cm', `${engineCtx.arcilla}%`],
    ['bi-sun', 'Años secos', `${n} / ${engineCtx.total_anios}`],
    ['bi-calendar3', 'Ventana de temporal', `${engineCtx.ventana_dias} días`],
  ];

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
                  placeholder="Por ejemplo: garbanzo, fresa, aguacate…"
                  aria-describedby="err-cultivo"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <datalist id="lista-cultivos">
                  {CULTIVOS.map((c) => (
                    <option key={c.id} value={c.nombre}></option>
                  ))}
                </datalist>
                <button type="submit" className="fs-btn fs-btn-primary" disabled={!!loadingSteps}>
                  <i className="bi bi-cpu" aria-hidden="true"></i>
                  <span className="lbl">Analizar</span>
                </button>
              </div>
              <p className="fs-test-err" id="err-cultivo" role="alert" hidden={!error}>
                {error?.msg}
                {error?.sugerencias?.length ? (
                  <>
                    {' '}¿Quisiste decir{' '}
                    {error.sugerencias.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <button type="button" className="fs-link-btn inline" onClick={() => probar(s.nombre)}>
                          {s.nombre}
                        </button>
                      </span>
                    ))}
                    ?
                  </>
                ) : null}
              </p>
            </form>

            <div>
              <p className="fs-q" id="q-manejo">Manejo del agua para la prueba</p>
              <div className="fs-seg" role="group" aria-labelledby="q-manejo">
                <button type="button" aria-pressed={agua === 'temporal'} onClick={() => setAgua('temporal')}>Temporal · solo lluvia</button>
                <button type="button" aria-pressed={agua === 'riego'} onClick={() => setAgua('riego')}>Con riego</button>
              </div>
            </div>

            <div
              className={`fs-drop${dragOver ? ' is-over' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]); }}
            >
              <input type="file" id="archivo" className="visually-hidden" accept=".json,.csv,.txt,image/*" onChange={(e) => { procesarArchivo(e.target.files[0]); e.target.value = ''; }} />
              <label htmlFor="archivo" className="fs-drop-zone" hidden={!!attached}>
                <span className="fs-drop-ico">
                  <i className="bi bi-paperclip" aria-hidden="true"></i>
                </span>
                <span>
                  <b>O adjunta la ficha del cultivo</b>
                  <small>Arrastra aquí un .json, .csv o .txt con el nombre o los rangos que necesita, o una foto con el nombre del cultivo en el archivo.</small>
                </span>
              </label>
              {attached && (
                <div className="fs-file">
                  {attached.thumb ? <img src={attached.thumb} alt="" /> : <i className="bi bi-file-earmark-text" aria-hidden="true"></i>}
                  <span>
                    <b>{attached.file.name}</b>
                    <small>{attached.info}</small>
                  </span>
                  <button type="button" className="fs-icon-btn sm" aria-label="Quitar archivo" onClick={() => { setAttached(null); setError(null); }}>
                    <i className="bi bi-x-lg" aria-hidden="true"></i>
                  </button>
                </div>
              )}
              <button type="button" className="fs-link-btn" onClick={descargarPlantilla}>
                <i className="bi bi-download" aria-hidden="true"></i>Descargar plantilla de ficha (.json)
              </button>
            </div>

            <div className="fs-quick">
              <span className="fs-demo-l">Prueba rápido:</span>
              <div className="fs-chips">
                {FS_DATOS.pruebaRapida.map((nombre) => (
                  <button key={nombre} type="button" className="fs-btn fs-btn-pill" onClick={() => probar(nombre)}>
                    {nombre}
                  </button>
                ))}
              </div>
            </div>
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
            <p className="fs-note fs-mono">
              {engineCtx.fuentes.clima ? `NASA POWER ${engineCtx.desde}–${engineCtx.desde + engineCtx.total_anios - 1}` : 'NASA POWER (cargando o sin dato: valores de ejemplo)'} ·{' '}
              {engineCtx.fuentes.suelo ? 'SoilGrids ISRIC' : 'SoilGrids (sin dato en este punto: valores de ejemplo)'} · FAO Ecocrop
            </p>
          </section>
        </div>

        <div id="resultado" className="mt-4" aria-live="polite" ref={resultRef}>
          {loadingSteps && (
            <section className="fs-card fs-loading" aria-label="Analizando">
              <div className="fs-scan-line" aria-hidden="true"></div>
              <b>Analizando {loadingSteps.nombre} en {placeName}…</b>
              <ol className="fs-tl">
                {loadingSteps.pasos.map((p, i) => (
                  <li key={p} className={i < loadingSteps.done ? 'done' : ''}>
                    <span className="fs-tl-dot wait">
                      <i className="bi bi-check-lg" aria-hidden="true"></i>
                    </span>
                    <div className="fs-tl-body">
                      <b>{p}</b>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!loadingSteps && !result && (
            <div className="fs-empty fs-up fs-d2">
              <span className="fs-empty-ico">
                <i className="bi bi-flower1" aria-hidden="true"></i>
              </span>
              <b>Escribe un cultivo o adjunta su ficha</b>
              <p>Te diremos si funciona en tu parcela, por qué, y qué hacer para lograrlo.</p>
            </div>
          )}

          {!loadingSteps && result && (
            <Resultado
              r={result}
              ctx={engineCtx}
              agua={agua}
              placeName={placeName}
              plan={plan}
              reference={reference}
              verdictRef={verdictRef}
              onProbar={probar}
              onOtro={() => {
                setQuery('');
                inputRef.current?.focus();
                window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
              }}
            />
          )}
        </div>
      </main>
    </>
  );
}

/* ---------- Result drawing (design: pintar) ---------- */
function Resultado({ r, ctx, agua, placeName, plan, reference, verdictRef, onProbar, onOtro }) {
  const c = r.cultivo;
  const v = VER[r.veredicto];
  const todos = CULTIVOS.filter((k) => k.id !== c.id)
    .map((k) => evaluar(k, ctx, agua))
    .sort((a, b) => b.total - a.total);
  const buenos = todos.filter((x) => x.veredicto !== 'no');
  const alts = buenos.filter((x) => x.cultivo.tipo === c.tipo).concat(buenos.filter((x) => x.cultivo.tipo !== c.tipo)).slice(0, 3);
  const comp = [{ nombre: c.nombre, sub: 'tu prueba', total: r.total, yo: true }].concat(plan.map((p) => ({ nombre: p.nombre, sub: p.anio, total: p.r.total })));
  const radarLabels = useMemo(() => FACT.map((x) => x.nombre), []);
  const radarMain = useMemo(() => ({ label: c.nombre, data: FACT.map((x) => r.f[x.id].s) }), [r, c.nombre]);
  const radarRef = useMemo(() => ({ label: `${reference.nombre} · tu año 1`, data: FACT.map((x) => reference.r.f[x.id].s) }), [reference]);

  return (
    <>
      <div className="fs-row">
        <section className={`fs-verdict ${r.veredicto} fs-up`} aria-labelledby="t-ver">
          <div className="fs-verdict-top">
            <Anillo total={r.total} cls={r.veredicto} />
            <div>
              <div className="fs-eyebrow">Veredicto · {c.tipo}{c.propio ? ' · ficha propia' : ''}</div>
              <h2 id="t-ver" ref={verdictRef} tabIndex={-1}>
                <i className={`bi ${v.icono}`} aria-hidden="true"></i>
                {v.titulo}
              </h2>
              <p className="fs-verdict-crop">
                {c.nombre} en {placeName} · {agua === 'riego' ? 'con riego' : 'temporal'}
              </p>
            </div>
          </div>
          <p className="fs-verdict-sum">{resumen(r, placeName)}</p>
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

        <section className="fs-card fs-radar-card fs-up fs-d1" aria-labelledby="t-radar">
          <div className="fs-card-head">
            <div>
              <div className="fs-eyebrow">Ajuste por factor · 0 a 100</div>
              <h2 className="fs-card-title xs" id="t-radar">Dónde se acomoda y dónde le falta</h2>
            </div>
            <div className="fs-legend">
              <span>
                <i className="fs-sq" style={{ background: '#1B6B3A' }}></i>
                {c.nombre}
              </span>
              <span>
                <i className="fs-sq dash"></i>
                {reference.nombre} · tu año 1
              </span>
            </div>
          </div>
          <RadarChart labels={radarLabels} main={radarMain} reference={radarRef} ariaLabel={FACT.map((x) => `${x.nombre} ${r.f[x.id].s}`).join(', ')} />
          <div className="fs-radar-list">
            {FACT.map((x) => (
              <span key={x.id}>
                <b>{r.f[x.id].s}</b>
                {x.nombre}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="fs-card mt-4 fs-up fs-d2" aria-labelledby="t-fac">
        <div className="fs-card-head">
          <div>
            <div className="fs-eyebrow">Por qué · requisito contra tu parcela</div>
            <h2 className="fs-card-title xs" id="t-fac">Desglose de los 6 factores</h2>
          </div>
          <div className="fs-legend">
            <span>
              <i className="fs-sq" style={{ background: '#E6F5E8', border: '1px solid #CDEDD3' }}></i>Lo que tolera
            </span>
            <span>
              <i className="fs-sq" style={{ background: '#A3DDB0' }}></i>Óptimo
            </span>
            <span>
              <i className="fs-sq mk"></i>Tu parcela
            </span>
          </div>
        </div>
        <div className="fs-factors">
          {FACT.map((d, i) => (
            <TarjetaFactor key={d.id} def={d} x={r.f[d.id]} c={c} ctx={ctx} i={i} />
          ))}
        </div>
      </section>

      <div className="fs-row mt-4">
        <section className="fs-card fs-act-col fs-up fs-d3" aria-labelledby="t-act">
          <div>
            <div className="fs-eyebrow">{r.veredicto === 'no' ? 'Si aun así lo quieres sembrar' : 'Para que te vaya bien'}</div>
            <h2 className="fs-card-title xs" id="t-act">Qué hacer</h2>
          </div>
          <ol className="fs-acts">
            {acciones(r).map((a, i) => (
              <li key={a[1]}>
                <span className="n">{i + 1}</span>
                <span className="fs-ico-box">
                  <i className={`bi ${a[0]}`} aria-hidden="true"></i>
                </span>
                <span>
                  <b>{a[1]}</b>
                  <small>{a[2]}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="fs-actions">
            <Link className="fs-btn fs-btn-primary" to="/analisis">
              <i className="bi bi-robot" aria-hidden="true"></i>Preguntar al asistente
            </Link>
            <button type="button" className="fs-btn fs-btn-sec" onClick={onOtro}>
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Probar otro cultivo
            </button>
          </div>
        </section>

        <section className="fs-card fs-alt-col fs-up fs-d4" aria-labelledby="t-alt">
          <div>
            <div className="fs-eyebrow">Alternativas para tu parcela</div>
            <h2 className="fs-card-title xs" id="t-alt">Parecidos que sí se acomodan</h2>
          </div>
          <div className="fs-alts">
            {alts.length ? (
              alts.map((a) => (
                <button key={a.cultivo.id} type="button" className="fs-alt" onClick={() => onProbar(a.cultivo.nombre)}>
                  <span className="fs-alt-top">
                    <b>{a.cultivo.nombre}</b>
                    <em>{a.total}</em>
                  </span>
                  <span className="fs-track">
                    <span className="fs-fill" style={{ width: `${a.total}%` }}></span>
                  </span>
                  <span className="fs-alt-bot">
                    <span className={`fs-est sm ${a.veredicto === 'si' ? 'dentro' : 'limite'}`}>{VER[a.veredicto].chip}</span>
                    <small>
                      {a.cultivo.tipo} · Probar <i className="bi bi-arrow-right" aria-hidden="true"></i>
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className="fs-note">No encontramos alternativas con buen puntaje para este manejo.</p>
            )}
          </div>
        </section>
      </div>
      <p className="fs-note mt-3">
        Clima y suelo {ctx.fuentes.clima && ctx.fuentes.suelo ? 'reales de NASA POWER y SoilGrids para tu punto' : 'parcialmente de ejemplo'}; los rangos de los cultivos son ilustrativos (FAO Ecocrop, sin verificar).
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

function TarjetaFactor({ def, x, c, ctx, i }) {
  let visual;
  if (def.id === 'sequia') visual = <GaugeSequia x={x} ctx={ctx} />;
  else if (def.id === 'ciclo') visual = <GaugeCiclo x={x} />;
  else visual = <Gauge x={x} />;
  return (
    <article className="fs-factor fs-up" style={{ animationDelay: `${(0.15 + i * 0.07).toFixed(2)}s` }}>
      <header>
        <span className="fs-ico-box">
          <i className={`bi ${def.icono}`} aria-hidden="true"></i>
        </span>
        <b>{def.nombre}</b>
        <span className={`fs-est ${x.estado}`}>{EST[x.estado]}</span>
        <span className="fs-factor-pts">{x.s}</span>
      </header>
      {visual}
      <p>{porQue(def.id, x, c, ctx)}</p>
    </article>
  );
}

// Range bar: tolerable (light), optimal (medium) and the plot's marker
function Gauge({ x }) {
  let min = Math.min(x.lo, x.v);
  let max = Math.max(x.hi, x.v);
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const p = (v) => (((v - min) / (max - min)) * 100).toFixed(2);
  const tolL = Math.max(x.lo, min);
  const tolR = Math.min(x.hi, max);
  const val = fmt(x.v, x.dec) + (x.unidad ? (x.unidad === '%' ? '%' : ` ${x.unidad}`) : '');
  return (
    <div className="fs-gauge">
      <div className="fs-gauge-track">
        <span className="tol" style={{ left: `${p(tolL)}%`, width: `${p(tolR) - p(tolL)}%` }}></span>
        <span className="opt" style={{ left: `${p(x.a)}%`, width: `${p(x.b) - p(x.a)}%` }}></span>
        <span className="mark" style={{ left: `${p(x.v)}%` }}>
          <b>{val}</b>
        </span>
      </div>
      <div className="fs-gauge-scale">
        <span>{fmt(x.lo, x.dec)}</span>
        <span className="opt-l">
          óptimo {fmt(x.a, x.dec)}–{fmt(x.b, x.dec)}
        </span>
        <span>{fmt(x.hi, x.dec)}</span>
      </div>
    </div>
  );
}

function GaugeSequia({ x, ctx }) {
  const total = ctx.total_anios;
  return (
    <>
      <div className="fs-years25" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={ctx.secos_idx.includes(i) ? 'seco' : ''} style={{ animationDelay: `${(i * 0.025).toFixed(3)}s` }} title={String(ctx.desde + i)}></i>
        ))}
      </div>
      <div className="fs-gauge-scale">
        <span>{ctx.desde}</span>
        <span className="opt-l">
          tolerancia {TOL_TXT[x.tol]}
          {x.riego ? ' · con riego' : ''}
        </span>
        <span>{ctx.desde + total - 1}</span>
      </div>
    </>
  );
}

function GaugeCiclo({ x }) {
  const esc200 = (d) => Math.min(100, (d / 200) * 100).toFixed(1);
  return (
    <div className="fs-cyc">
      <small>Ventana de lluvia</small>
      {x.riego && !x.perenne ? (
        <div className="fs-cyc-bar vent" style={{ width: '100%' }}>
          <span>Con riego: sin límite de temporal</span>
        </div>
      ) : (
        <div className="fs-cyc-bar vent" style={{ width: `${esc200(x.ventana)}%` }}>
          <span>{x.ventana} días</span>
        </div>
      )}
      <small>Ciclo del cultivo</small>
      {x.perenne ? (
        <div className="fs-cyc-bar per" style={{ width: '100%' }}>
          <span>Perenne · todo el año</span>
        </div>
      ) : (
        <div className="fs-cyc-bar" style={{ width: `${esc200(x.dias)}%` }}>
          <span>{x.dias} días</span>
        </div>
      )}
    </div>
  );
}
