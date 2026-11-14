import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import FS_DATOS from '../data/datosDemo.js';
import { copyText, toast } from '../lib/fs.js';

// Screen 3: how the assistant answered. Everything is drawn from the JSON contract of design
// section 9.8 (FS_DATOS.respuestaIA). It stays demo data until POST /api/asistente exists.
export default function Analisis() {
  const ctx = useParcelaContext();
  const labels = selectionLabels(ctx);
  const R = FS_DATOS.respuestaIA;
  const [stepsOpen, setStepsOpen] = useState(true);
  const [useful, setUseful] = useState(false);
  const [ask, setAsk] = useState('');
  const total = R.pasos.reduce((s, p) => s + p.tiempo_s, 0);
  const placeName = ctx.point?.nombre?.split(',')[0] ?? 'Celaya';
  const answerText = `${R.respuesta_corta.titulo} ${R.respuesta_corta.apoyo}`;

  function listen() {
    if (!('speechSynthesis' in window)) {
      toast('Tu navegador no puede leer en voz alta');
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(answerText);
    u.lang = 'es-MX';
    speechSynthesis.speak(u);
  }

  return (
    <div className="fs-p3">
      <Header
        sub="ASISTENTE AGRÓNOMO · ANÁLISIS DE RESPUESTA"
        pills={
          <>
            <span className="fs-pill">{labels.lugar}</span>
            <span className="fs-pill is-white">Plan: {R.plan.map((p) => p.cultivo.split(' ')[0].toLowerCase()).join(' → ')}</span>
          </>
        }
      />

      <main className="fs-container">
        <div className="fs-row align-items-start">
          <div className="fs-conv-col">
            <div className="d-flex justify-content-between align-items-end flex-wrap gap-2 fs-up">
              <div>
                <div className="fs-eyebrow">Paso 3 · Conversación con tu asistente</div>
                <h1 className="fs-h1">Así respondió la IA a tu pregunta</h1>
              </div>
              <span className="fs-mono fs-muted" style={{ fontSize: 12 }}>{R.hora}</span>
            </div>

            <div className="fs-bubble-user fs-up fs-d1">{R.pregunta.texto}</div>
            <div className="fs-voice-meta fs-up fs-d1">
              <span className="fs-mini-wave" aria-hidden="true">
                {[5, 11, 8, 14, 6, 10, 4].map((h, i) => (
                  <i key={i} style={{ height: h }}></i>
                ))}
              </span>
              <span>Dictado por voz · Whisper · {R.pregunta.duracion} · {R.pregunta.idioma}</span>
            </div>

            <section className="fs-steps-box fs-up fs-d2" aria-labelledby="t-pasos">
              <div className="fs-steps-head">
                <b id="t-pasos">Cómo llegó a la respuesta · {R.pasos.length} pasos en {total.toFixed(1)} s</b>
                <button type="button" className="fs-btn fs-btn-mini" aria-expanded={stepsOpen} aria-controls="pasos" onClick={() => setStepsOpen((v) => !v)}>
                  {stepsOpen ? 'Ocultar proceso' : 'Ver proceso'}
                </button>
              </div>
              <div className={`collapse${stepsOpen ? ' show' : ''}`} id="pasos">
                <ol className="fs-tl">
                  {R.pasos.map((p, i) => (
                    <li key={p.titulo}>
                      <span className="fs-tl-dot" style={{ animationDelay: `${(0.5 + i * 0.15).toFixed(2)}s` }}>
                        <i className="bi bi-check-lg" aria-hidden="true"></i>
                      </span>
                      <div className="fs-tl-body">
                        <b>{p.titulo}</b>
                        <span>{p.detalle}</span>
                      </div>
                      <span className="fs-tl-t">{p.tiempo_s.toFixed(1)} s</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <article className="fs-answer fs-up fs-d3" aria-labelledby="t-resp">
              <div className="d-flex align-items-center gap-3">
                <span className="fs-ico-box lg">
                  <i className="bi bi-robot" aria-hidden="true"></i>
                </span>
                <div>
                  <div className="fs-chat-name">FieldShift AI</div>
                  <div className="fs-chat-sub">Respuesta basada en NASA POWER · SoilGrids · FAO Ecocrop</div>
                </div>
              </div>

              <div className="fs-short">
                <div className="fs-eyebrow">Respuesta corta</div>
                <h2 id="t-resp">{R.respuesta_corta.titulo}</h2>
                <p>{R.respuesta_corta.apoyo}</p>
              </div>

              <section aria-labelledby="t-cal">
                <div className="fs-cal-head">
                  <h3 className="fs-sub" id="t-cal">Tu calendario de temporal en {placeName}</h3>
                  <div className="fs-legend">
                    <span>
                      <i className="fs-sq" style={{ background: '#A3DDB0' }}></i>Lluvia mensual (mm)
                    </span>
                    <span>
                      <i className="fs-sq" style={{ background: '#1B6B3A' }}></i>Humedad raíz sobre 40%
                    </span>
                  </div>
                </div>
                <div className="fs-cal-scroll">
                  <div className="fs-cal" role="img" aria-label="Lluvia mensual y humedad en la raíz de mayo a noviembre">
                    {R.calendario.meses.map((m, i) => (
                      <div key={m.mes} className="fs-cal-col">
                        <span className="fs-cal-mm">{m.lluvia_mm}</span>
                        <div className="fs-cal-box">
                          <div className="fs-cal-bar" style={{ height: `${Math.min(150, Math.round((m.lluvia_mm / 160) * 150))}px`, animationDelay: `${(0.7 + i * 0.06).toFixed(2)}s` }}></div>
                        </div>
                        <span className={`fs-cal-hum${m.gwetroot_pct > 40 ? ' hi' : ''}`}>{m.gwetroot_pct}%</span>
                        <span className="fs-cal-mes">{m.mes}</span>
                      </div>
                    ))}
                  </div>
                  <div className="fs-phases">
                    {R.calendario.fases.map((f, i) => (
                      <div key={f.nombre} className={`fs-phase p${i + 1}`} style={{ gridRow: i + 1, gridColumn: `${f.desde_quincena} / ${f.hasta_quincena + 1}` }}>
                        {f.nombre}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section aria-labelledby="t-por">
                <h3 className="fs-sub" id="t-por">Por qué esa fecha</h3>
                <div className="fs-reasons">
                  {R.razones.map((r) => (
                    <div key={r.titulo} className="fs-reason">
                      <span className="num">{r.cifra}</span>
                      <b>{r.titulo}</b>
                      <p>{r.texto}</p>
                      <span className="fs-src">[{r.fuente}] {r.etiqueta}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section aria-labelledby="t-vig">
                <h3 className="fs-sub" id="t-vig">Qué vigilar y qué hacer</h3>
                <div className="fs-risks">
                  {R.riesgos.map((r) => (
                    <div key={r.si_pasa} className="fs-risk">
                      <div>
                        <small>SI PASA</small>
                        <div className="if">{r.si_pasa}</div>
                      </div>
                      <div>
                        <small className="do">HAZ ESTO</small>
                        <div className="then">{r.haz_esto}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <footer className="fs-ans-foot">
                <div className="fs-sources">
                  <span>Fuentes:</span>
                  {R.fuentes.map((f) => (
                    <span key={f.id} className="fs-chip-src">[{f.id}] {f.nombre}</span>
                  ))}
                </div>
                <div className="fs-actions">
                  <button type="button" className="fs-icon-btn" aria-pressed={useful} aria-label="Me fue útil" onClick={() => setUseful((v) => !v)}>
                    <i className={`bi ${useful ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'}`} aria-hidden="true"></i>
                  </button>
                  <button type="button" className="fs-icon-btn" aria-label="Escuchar la respuesta" onClick={listen}>
                    <i className="bi bi-volume-up" aria-hidden="true"></i>
                  </button>
                  <button type="button" className="fs-btn fs-btn-sec fs-copy" onClick={() => copyText(answerText, () => toast('Respuesta copiada'), () => toast('No se pudo copiar'))}>
                    Copiar respuesta
                  </button>
                </div>
              </footer>
            </article>

            <div className="d-flex flex-column gap-3 fs-up fs-d4">
              <div className="fs-typing">
                <span className="dots" aria-hidden="true">
                  <i></i><i></i><i></i>
                </span>
                Sigue preguntando, el asistente recuerda tu parcela
              </div>
              <div className="fs-chips">
                {R.sugerencias.map((s) => (
                  <button key={s} type="button" className="fs-btn fs-btn-pill" onClick={() => setAsk(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <form
                className="fs-askbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (ask.trim()) {
                    toast('Pregunta enviada al asistente');
                    setAsk('');
                  }
                }}
              >
                <button type="button" className="fs-mic" aria-label="Hablar con el micrófono">
                  <i className="bi bi-mic" aria-hidden="true"></i>
                </button>
                <label htmlFor="ask" className="visually-hidden">Pregunta otra cosa sobre tu rotación</label>
                <input id="ask" type="text" placeholder="Pregunta otra cosa sobre tu rotación…" autoComplete="off" value={ask} onChange={(e) => setAsk(e.target.value)} />
                <button type="submit" className="fs-btn fs-btn-primary" aria-label="Preguntar">
                  <i className="bi bi-send" aria-hidden="true"></i>
                  <span className="lbl">Preguntar</span>
                </button>
              </form>
            </div>
          </div>

          <aside className="fs-aside-col">
            <section className="fs-card fs-side fs-up fs-d2" aria-labelledby="t-res">
              <div className="fs-eyebrow" id="t-res">Resumen del análisis</div>
              <div className="fs-conf">
                <div className="fs-ring" role="img" aria-label={`Confianza ${R.confianza_pct}%`}>
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#E6F5E8" strokeWidth="10" />
                    <circle className="arc" cx="50" cy="50" r="42" fill="none" stroke="#1B6B3A" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={Math.round(264 * (1 - R.confianza_pct / 100))} />
                  </svg>
                  <span>{R.confianza_pct}%</span>
                </div>
                <div>
                  <b>Confianza alta</b>
                  <p>Se apoya en 25 años de datos diarios del punto exacto de tu parcela.</p>
                </div>
              </div>
              <dl className="fs-dl">
                {R.resumen.map((r) => (
                  <div key={r.k}>
                    <dt>{r.k}</dt>
                    <dd>{r.v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="fs-card fs-side fs-up fs-d3" aria-labelledby="t-plan">
              <div className="fs-eyebrow" id="t-plan">Cómo queda tu plan</div>
              <ul className="fs-planlist">
                {R.plan.map((p) => {
                  const active = p.anio === R.efecto_en_plan.anio;
                  return (
                    <li key={p.anio} className={active ? 'is-active' : ''}>
                      <span className="yr">{p.anio}</span>
                      {p.cultivo}
                      {active && (
                        <small>
                          <i className="bi bi-calendar3" aria-hidden="true"></i>Fecha agregada: {R.efecto_en_plan.nota}
                        </small>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="fs-btn fs-btn-primary fs-btn-block" onClick={() => window.print()}>
                <i className="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>Guardar en mi ficha PDF
              </button>
              <Link className="fs-btn fs-btn-sec fs-btn-block" to="/rotacion">Volver al simulador 3D</Link>
            </section>

            <p className="fs-note fs-up fs-d4">Las cifras de esta pantalla son ilustrativas para la maqueta; en la app las calcula el motor de reglas con la respuesta de las APIs.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
