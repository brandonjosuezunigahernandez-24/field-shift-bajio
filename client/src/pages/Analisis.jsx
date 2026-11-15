import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import { getPerfilPreguntas, getTemas } from '../api/client.js';
import { useAsistente } from '../hooks/useAsistente.js';
import { copyText, toast } from '../lib/fs.js';

const ORIGEN = { motor: 'Calculado con datos del SIAP', plantilla: 'Respuesta de respaldo', llm: 'Respuesta del asistente' };
const pesos = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;
const num = (v) => typeof v === 'number';

// Cada dato viene tal cual del servidor; si falta un campo, no se muestra la fila.
function filasPrediccion(p) {
  return [
    num(p.ingreso_bruto_3_anios_esperado_por_ha) && ['Ingreso bruto esperado en 3 años, por hectárea', pesos(p.ingreso_bruto_3_anios_esperado_por_ha)],
    num(p.ingreso_bruto_3_anios_peor_10_pct_por_ha) && ['En un caso malo', pesos(p.ingreso_bruto_3_anios_peor_10_pct_por_ha)],
    num(p.ingreso_bruto_3_anios_mejor_10_pct_por_ha) && ['En un caso bueno', pesos(p.ingreso_bruto_3_anios_mejor_10_pct_por_ha)],
    num(p.probabilidad_al_menos_un_anio_con_perdida_pct) && ['Posibilidad de al menos un año con pérdidas', `${p.probabilidad_al_menos_un_anio_con_perdida_pct} de cada 100`],
    num(p.hectareas) && ['Tus hectáreas', String(p.hectareas)],
    num(p.ingreso_bruto_3_anios_esperado_total) && ['Total esperado en tu terreno', pesos(p.ingreso_bruto_3_anios_esperado_total)],
    num(p.ingreso_bruto_3_anios_peor_10_pct_total) && ['Total en un caso malo', pesos(p.ingreso_bruto_3_anios_peor_10_pct_total)],
    num(p.ingreso_bruto_3_anios_mejor_10_pct_total) && ['Total en un caso bueno', pesos(p.ingreso_bruto_3_anios_mejor_10_pct_total)],
    num(p.probabilidad_al_menos_una_parcela_con_perdida_pct) && ['Posibilidad de pérdidas en al menos una parcela', `${p.probabilidad_al_menos_una_parcela_con_perdida_pct} de cada 100`],
    num(p.probabilidad_perdida_en_la_mitad_o_mas_del_terreno_pct) && ['Posibilidad de pérdidas en la mitad o más del terreno', `${p.probabilidad_perdida_en_la_mitad_o_mas_del_terreno_pct} de cada 100`],
  ].filter(Boolean);
}

const Filas = ({ filas }) => <dl className="fs-dl">{filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;

function Notas({ lista }) {
  return lista?.length > 0 ? (
    <section aria-label="Ten en cuenta">
      <h3 className="fs-sub">Ten en cuenta</h3>
      <ul className="an-notas">{lista.map((n) => <li key={n}>{n}</li>)}</ul>
    </section>
  ) : null;
}

function Recomendacion({ rec }) {
  const pred = rec.prediccion ? filasPrediccion(rec.prediccion) : [];
  return (
    <>
      {rec.cultivos?.length > 0 && (
        <section aria-label="Cultivos">
          <h3 className="fs-sub">Cultivos que salen mejor</h3>
          <div className="fs-reasons">
            {rec.cultivos.map((c) => (
              <div key={c.id} className="fs-reason">
                <span className="num">{c.puntaje} / 100</span>
                <b>{c.nombre} · {c.temporada}</b>
                {c.razones?.map((t) => <p key={t}>{t}</p>)}
                {num(c.riesgo) && <span className="fs-src">Riesgo en los datos del SIAP: {Math.round(c.riesgo * 100)} de cada 100</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      {rec.rotacion?.length > 0 && (
        <section aria-label="Rotación">
          <h3 className="fs-sub">Rotación de 3 años</h3>
          <ul className="fs-planlist">
            {rec.rotacion.map((p) => (
              <li key={p.anio}><span className="yr">Año {p.anio}</span>{p.cultivo} ({p.temporada}){p.porque && <small>{p.porque}</small>}</li>
            ))}
          </ul>
        </section>
      )}
      {pred.length > 0 && (
        <section aria-label="Predicción">
          <h3 className="fs-sub">Cuánto podrías ganar (estimado)</h3>
          <Filas filas={pred} />
        </section>
      )}
      <Notas lista={rec.notas} />
    </>
  );
}

function Finca({ f }) {
  return (
    <>
      <h3 className="fs-sub">Tus parcelas ({f.hectareas_total} ha en total)</h3>
      <div className="fs-reasons">
        {f.parcelas?.map((p) => (
          <div key={p.id} className="fs-reason">
            <b>Parcela {p.id} · {p.hectareas} ha</b>
            <ul className="an-notas">{p.rotacion.map((r) => <li key={r.anio}>Año {r.anio}: {r.cultivo} ({r.temporada})</li>)}</ul>
          </div>
        ))}
      </div>
      {[['Repartiendo los cultivos', f.repartido], ['Sembrando lo mismo en todas', f.igual]].map(([t, x]) => x && (
        <section key={t} aria-label={t}>
          <h3 className="fs-sub">{t}</h3>
          <Filas filas={filasPrediccion(x)} />
        </section>
      ))}
      <Notas lista={f.notas} />
    </>
  );
}

function Corroboracion({ c }) {
  const anios = (l) => (l?.length ? l.join(', ') : 'ninguno');
  return (
    <section aria-label="Lluvia de NASA contra el SIAP">
      <h3 className="fs-sub">¿La lluvia de NASA coincide con el SIAP? ({c.cultivo}, {c.estado})</h3>
      <Filas filas={[
        ['Años comparados', String(c.anios_comparados)],
        ['Seco según NASA y con pérdidas altas en el SIAP', anios(c.coinciden)],
        ['Seco según NASA, sin pérdidas altas', anios(c.solo_nasa)],
        ['Pérdidas altas sin año seco en NASA', anios(c.solo_siap)],
        ...(num(c.correlacion_lluvia_perdida) ? [['Relación entre lluvia y pérdidas (−1 a 1)', String(c.correlacion_lluvia_perdida)]] : []),
      ]} />
      {c.detalle?.length > 0 && (
        <div className="an-tabla-wrap">
          <table className="an-tabla">
            <thead><tr><th>Año</th><th>Lluvia (mm)</th><th>¿Seco para NASA?</th><th>Pérdida (%)</th></tr></thead>
            <tbody>
              {c.detalle.map((d) => (
                <tr key={d.anio}><td>{d.anio}</td><td>{d.lluvia_mm}</td><td>{d.seco_nasa ? 'Sí' : 'No'}</td><td>{d.perdida_pct}{d.perdida_alta ? ' (alta)' : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Pantalla 3: el asistente de verdad (modelo local). Todo lo que se ve sale de la respuesta del servidor.
export default function Analisis() {
  const ctx = useParcelaContext();
  const { point, perfil, setPerfilCampo, reiniciarPerfil, ensurePoint } = ctx;
  const labels = selectionLabels(ctx);
  const { texto, setTexto, estado, grabando, preguntar, contestar, microfono, r, pendiente } = useAsistente();
  const [temas, setTemas] = useState(null);
  const [tema, setTema] = useState(0);
  const [preguntas, setPreguntas] = useState([]);
  const archivo = useRef(null);
  const auto = useRef(false);

  useEffect(() => {
    getTemas().then(setTemas).catch(() => setTemas({ temas: [], nota: '' }));
    getPerfilPreguntas().then((d) => setPreguntas(d.preguntas ?? [])).catch(() => {});
  }, []);

  // ?pregunta=... hace la pregunta al cargar (sirve para revisar la ruta completa).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('pregunta');
    if (!q || auto.current) return;
    if (!point) return void ensurePoint();
    auto.current = true;
    preguntar(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  function escuchar() {
    if (!('speechSynthesis' in window)) return toast('Tu navegador no puede leer en voz alta');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(r.respuesta);
    u.lang = 'es-MX';
    speechSynthesis.speak(u);
  }

  function guardarFicha() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ficha: 'field-shift-bajio', perfil }, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'mi-ficha.json' }).click();
    URL.revokeObjectURL(url);
  }

  // Solo entran campos que el servidor conoce y con un valor que acepta; lo demás se ignora.
  async function cargarFicha(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const src = data?.perfil ?? data;
      if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('no es objeto');
      let n = 0;
      for (const q of preguntas) {
        const v = src[q.campo];
        const ok = q.tipo === 'numero' ? num(v) && v >= q.min && v <= q.max : q.opciones.some((o) => o.valor === v && v !== 'no_se');
        if (ok) { setPerfilCampo(q.campo, v); n++; }
      }
      toast(n ? `Ficha cargada: ${n} datos` : 'El archivo no trae datos que yo conozca');
    } catch {
      toast('Ese archivo no es una ficha válida');
    }
  }

  const dicho = preguntas.filter((q) => perfil[q.campo] != null);

  return (
    <div className="fs-p3">
      <Header sub="ASISTENTE AGRÓNOMO · ANÁLISIS IA" pills={<span className="fs-pill">{labels.lugar}</span>} />

      <main className="fs-container">
        <div className="fs-row align-items-start">
          <div className="fs-conv-col">
            <div className="fs-eyebrow">Paso 3 · Pregúntale a tu asistente</div>
            <h1 className="fs-h1">Haz tu pregunta</h1>

            {temas?.temas?.length > 0 && (
              <section className="an-bloque" aria-label="Guía de temas">
                <div className="an-tabs" role="tablist">
                  {temas.temas.map((t, i) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tema === i} className={tema === i ? 'on' : ''} onClick={() => setTema(i)}>
                      <i className={`bi ${t.icono}`} aria-hidden="true"></i> {t.titulo}
                    </button>
                  ))}
                </div>
                <div className="an-qs">
                  {temas.temas[tema].preguntas.map((p) => <button key={p} type="button" onClick={() => preguntar(p)}>{p}</button>)}
                </div>
              </section>
            )}

            <form className="an-ask" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) preguntar(texto.trim()); }}>
              <label htmlFor="an-pregunta" className="visually-hidden">Tu pregunta</label>
              <input id="an-pregunta" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta" maxLength={300} autoComplete="off" />
              <button type="button" className={`an-mic${grabando ? ' rec' : ''}`} onClick={microfono} aria-pressed={grabando}>
                <i className={`bi ${grabando ? 'bi-stop-fill' : 'bi-mic-fill'}`} aria-hidden="true"></i>{grabando ? ' Escuchando… toca para terminar' : ' Hablar'}
              </button>
              <button type="submit" className="an-go">Preguntar</button>
            </form>

            <div className="an-estado" aria-live="polite">
              {estado.fase === 'inicio' && <p>{estado.mensaje ?? 'Toca una pregunta, escribe la tuya o toca «Hablar».'}</p>}
              {estado.fase === 'pensando' && <p>{estado.mensaje ?? 'Pensando… La primera respuesta puede tardar medio minuto; las siguientes, unos segundos.'}</p>}
              {estado.fase === 'error' && <p className="err">{estado.mensaje} {!point && <Link to="/">Ir al mapa</Link>}</p>}
            </div>

            {r && (
              <article className="fs-answer" aria-labelledby="t-resp">
                <div className="fs-short">
                  <div className="fs-eyebrow" id="t-resp">{ORIGEN[r.origen] ?? ORIGEN.llm}</div>
                  <p className="an-texto">{r.respuesta}</p>
                </div>

                {pendiente && (
                  <div className="an-opts">
                    <p><strong>{r.preguntar ? pendiente.pregunta ?? r.respuesta : `Para afinar tu resultado: ${pendiente.pregunta}`}</strong></p>
                    {pendiente.opciones.map((o) => (
                      <button key={o.valor} type="button" onClick={() => contestar(pendiente.campo, o.valor)}>{o.texto}</button>
                    ))}
                  </div>
                )}

                {r.recomendacion && <Recomendacion rec={r.recomendacion} />}
                {r.recomendacion_finca && <Finca f={r.recomendacion_finca} />}
                {r.corroboracion && <Corroboracion c={r.corroboracion} />}

                <footer className="fs-ans-foot">
                  <div className="fs-sources">
                    <span>Fuentes:</span>
                    {r.fuentes?.length ? r.fuentes.map((f) => <span key={f} className="fs-chip-src">{f}</span>) : <span>no hay</span>}
                    {r.enlaces?.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">Ver página consultada (la app no la verifica)</a>)}
                  </div>
                  <div className="fs-actions">
                    <button type="button" className="fs-btn fs-btn-sec" onClick={escuchar}><i className="bi bi-volume-up" aria-hidden="true"></i> Escuchar</button>
                    <button type="button" className="fs-btn fs-btn-sec" onClick={() => copyText(r.respuesta, () => toast('Respuesta copiada'), () => toast('No se pudo copiar'))}>Copiar respuesta</button>
                  </div>
                </footer>
              </article>
            )}
            {temas?.nota && <p className="fs-note">{temas.nota}</p>}
          </div>

          <aside className="fs-aside-col">
            <section className="fs-card fs-side" aria-labelledby="t-dicho">
              <div className="fs-eyebrow" id="t-dicho">Lo que me has dicho</div>
              <p className="an-peq">Así no te lo vuelvo a preguntar. Se guarda solo en este navegador.</p>
              {dicho.length === 0 && <p className="an-peq">Todavía no me has contestado nada.</p>}
              {dicho.map((q) => (
                <div key={q.campo} className="an-dato">
                  <label htmlFor={`d-${q.campo}`}>{q.pregunta}</label>
                  {q.tipo === 'numero' ? (
                    <input id={`d-${q.campo}`} type="number" min={q.min} max={q.max} step="any" defaultValue={perfil[q.campo]}
                      onBlur={(e) => { const v = Number(e.target.value); if (v >= q.min && v <= q.max) setPerfilCampo(q.campo, v); else e.target.value = perfil[q.campo]; }} />
                  ) : (
                    <select id={`d-${q.campo}`} value={perfil[q.campo]} onChange={(e) => setPerfilCampo(q.campo, e.target.value)}>
                      {q.opciones.filter((o) => o.valor !== 'no_se').map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                    </select>
                  )}
                  {q.campo !== 'agua' && q.campo !== 'prioridad' && <button type="button" onClick={() => setPerfilCampo(q.campo, '')}>Borrar este dato</button>}
                </div>
              ))}
              <button type="button" className="an-btn" onClick={reiniciarPerfil}>Borrar todo lo que me dije</button>
              <button type="button" className="an-btn" onClick={guardarFicha}><i className="bi bi-download" aria-hidden="true"></i> Guardar mi ficha en un archivo</button>
              <button type="button" className="an-btn" onClick={() => archivo.current?.click()}><i className="bi bi-upload" aria-hidden="true"></i> Cargar mi ficha</button>
              <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={cargarFicha} />
              <p className="an-peq">No hay cuentas ni servidor de datos: tu ficha queda en este navegador y en el archivo que guardes.</p>
              <Link className="fs-btn fs-btn-sec fs-btn-block" to="/rotacion">Volver al simulador 3D</Link>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
