import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PanelPasos from '../components/PanelPasos.jsx';
import AvisoEjemplo from '../components/AvisoEjemplo.jsx';
import { PreguntaPerfil, usePreguntasPerfil } from '../components/PerfilForm.jsx';
import RespuestaCard, { EstadoAsistente, preguntasSiguientes } from '../components/Respuesta.jsx';
import Header from '../components/layout/Header.jsx';
import { selectionLabels, useParcelaContext } from '../context/ParcelaContext.jsx';
import { getTemas } from '../api/client.js';
import { useAsistente } from '../hooks/useAsistente.js';
import { conGlosario } from '../components/Glosario.jsx';

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
      <ul className="an-notas">{lista.map((n) => <li key={n}>{conGlosario(n)}</li>)}</ul>
    </section>
  ) : null;
}

function Corroboracion({ c }) {
  const anios = (l) => (l?.length ? l.join(', ') : 'ninguno');
  return (
    <section aria-label="Lluvia de NASA contra el SIAP">
      <h3 className="fs-sub">¿La lluvia de NASA coincide con el SIAP? ({c.cultivo}, {c.estado})</h3>
      {c.lectura && <p className="an-texto-s">{c.lectura}</p>}
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

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const LLUVIAS = [6, 7, 8, 9]; // meses_pv del servidor: jun a sep
const PRIMER_PERFIL = 2; // the right panel: 0 summary, 1 plan, then the profile questions


// Pantalla 3: el asistente de verdad (modelo local). Todo lo que se ve sale de la respuesta del servidor o de los datos reales de la parcela.
export default function Analisis() {
  const ctx = useParcelaContext();
  const { point, parcelas, reiniciarPerfil, ensurePoint } = ctx;
  const clima = ctx.clima?.data;
  const suelo = ctx.suelo?.data;
  const labels = selectionLabels(ctx);
  const { pregunta, seg, texto, setTexto, estado, grabando, preguntar, contestar, reintentar, microfono, r, pendiente } = useAsistente();
  const [temas, setTemas] = useState(null);
  const [tema, setTema] = useState(0);
  const [activa, setActiva] = useState(0); // la única tarjeta del panel derecho que se ve
  const { preguntas: preguntasPerfil, basicas, falla } = usePreguntasPerfil();
  const auto = useRef(false);

  useEffect(() => {
    getTemas().then(setTemas).catch(() => setTemas({ temas: [], nota: '' }));
  }, []);

  // Without a plot, the Celaya example (like screens 2 and 4; AvisoEjemplo says so), so the summary has data.
  useEffect(() => {
    ensurePoint();
  }, [ensurePoint]);

  // ?pregunta=... hace la pregunta al cargar (sirve para revisar la ruta completa).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('pregunta');
    if (!q || auto.current) return;
    if (!point) return void ensurePoint();
    auto.current = true;
    preguntar(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);


  const rec = r?.recomendacion;
  const finca = r?.recomendacion_finca;
  const modelo = r?.riesgo_modelo;
  const rotacion = rec?.rotacion ?? finca?.parcelas?.[0]?.rotacion ?? [];
  const has = parcelas.reduce((s, p) => s + (p.hectareas || 0), 0);
  const aniosSecos = clima?.anios_secos?.length;
  const lluviaMensual = clima?.lluvia_media_mensual;
  const lluviaAnual = lluviaMensual?.reduce((s, m) => s + m.lluvia_mm, 0);
  const maxLluvia = lluviaMensual ? Math.max(...lluviaMensual.map((m) => m.lluvia_mm)) : 1;

  // Razones: de los mejores cultivos, de la finca, del modelo de riesgo, o el origen de la respuesta.
  const razones = rec?.cultivos?.length
    ? rec.cultivos.slice(0, 3).map((c) => ({ k: c.id, cifra: `${c.puntaje} / 100`, titulo: `${c.nombre} · ${c.temporada}`, textos: c.razones ?? [], fuente: 'SIAP' }))
    : finca?.parcelas?.length
      ? finca.parcelas.map((p) => ({ k: p.id, cifra: `${p.hectareas} ha`, titulo: `Parcela ${p.id}`, textos: p.rotacion.map((x) => `Año ${x.anio}: ${x.cultivo} (${x.temporada})`), fuente: 'SIAP' }))
      : modelo?.escenarios?.length
        ? modelo.escenarios.map((e) => ({ k: e.nombre, cifra: `${e.siniestro_pct}%`, titulo: e.nombre, textos: [`Con ${e.lluvia_mm} mm de lluvia en verano, cerca de ${Math.round(e.siniestro_pct)} % de la superficie dañada. Nivel: ${e.nivel}.`], fuente: 'Modelo SIAP + NASA POWER' }))
        : [];

  const vistos = new Set(); // glosario de «Por qué esta respuesta»: cada palabra una vez
  const hayRiesgos = rec?.prediccion || finca || r?.corroboracion || modelo || rec?.notas?.length || finca?.notas?.length;
  const ha = has ? `${Math.round(has * 10) / 10} ha` : null;

  // Right panel: the summary, the plan and then one profile question per card (Anterior / Siguiente).
  const tarjetas = [
    { id: 'resumen', titulo: 'Lo que sé de tu parcela' },
    { id: 'plan', titulo: 'Cómo queda tu rotación' },
    ...(preguntasPerfil
      ? preguntasPerfil.map((q, i) => ({ id: 'perfil', q, titulo: i < basicas ? 'Lo básico de tu parcela' : 'Cuéntame más' }))
      : [{ id: 'perfil', titulo: 'Lo que me has dicho' }]),
  ];
  const paso = Math.min(activa, tarjetas.length - 1); // some questions appear or go away with the answers
  const tarjeta = tarjetas[paso];

  return (
    <>
      <Header
        sub="ASISTENTE AGRÓNOMO · ANÁLISIS IA"
        pills={
          <>
            <span className="fs-pill">{labels.lugar}{ha ? ` · ${ha}` : ''}</span>
            {rotacion.length > 0 && <span className="fs-pill is-white">Plan: {rotacion.map((p) => p.cultivo).join(' → ')}</span>}
          </>
        }
      />

      <main className="fs-container fs-an">
        <div className="fs-row align-items-start">
          <div className="fs-conv-col">
            <section className="fs-card fs-up" aria-labelledby="t-preg">
              <div>
                <div className="fs-eyebrow">Paso 3 · Análisis IA</div>
                <h1 className="fs-card-title" id="t-preg">Pregúntale a tu asistente</h1>
                <p className="fs-parcel-line">
                  <i className="bi bi-geo-alt" aria-hidden="true"></i>
                  <span>{labels.lugar}</span>
                  {ha && <> · <span className="fs-mono">{ha}</span></>}
                  <Link to="/">Cambiar parcela</Link>
                </p>
              </div>
              <AvisoEjemplo />

              <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) preguntar(texto.trim()); }}>
                <label htmlFor="an-pregunta" className="fs-q">Escribe tu pregunta o toca «Hablar» y dila en voz alta</label>
                <div className="fs-askbar">
                  <input id="an-pregunta" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: ¿qué me conviene sembrar?" maxLength={300} autoComplete="off" />
                  <button
                    type="button"
                    className={`fs-btn fs-btn-sec an-mic${grabando ? ' rec' : ''}`}
                    onClick={microfono}
                    aria-pressed={grabando}
                    aria-label={grabando ? 'Escuchando, toca para terminar' : 'Hablar'}
                  >
                    <i className={`bi ${grabando ? 'bi-stop-fill' : 'bi-mic-fill'}`} aria-hidden="true"></i>
                    <span className="lbl">{grabando ? 'Escuchando… toca para terminar' : 'Hablar'}</span>
                  </button>
                  <button type="submit" className="fs-btn fs-btn-primary" aria-label="Preguntar">
                    <i className="bi bi-send-fill" aria-hidden="true"></i>
                    <span className="lbl">Preguntar</span>
                  </button>
                </div>
              </form>

              <EstadoAsistente estado={estado} point={point} reintentar={reintentar} inicio="Abajo hay preguntas de ejemplo por tema: toca una y te contesto." />
            </section>

            {r && (
              <RespuestaCard
                r={r} pregunta={pregunta} seg={seg} pendiente={pendiente} contestar={contestar} preguntar={preguntar}
                siguientes={preguntasSiguientes(r, temas, tema)}
              >
                {razones.length > 0 && (
                  <section aria-labelledby="t-por">
                    <h3 className="fs-sub" id="t-por">Por qué esta respuesta</h3>
                    <div className="fs-reasons">
                      {razones.map((x) => (
                        <div key={x.k} className="fs-reason">
                          {x.cifra && <span className="num">{x.cifra}</span>}
                          <b>{conGlosario(x.titulo, vistos)}</b>
                          {x.textos.map((t) => <p key={t}>{conGlosario(t, vistos)}</p>)}
                          <span className="fs-src">[{x.fuente}]</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {hayRiesgos && (
                  <section aria-labelledby="t-vig">
                    <h3 className="fs-sub" id="t-vig">Riesgos y límites</h3>
                    {rec?.prediccion && <Filas filas={filasPrediccion(rec.prediccion)} />}
                    {finca && [['Repartiendo los cultivos', finca.repartido], ['Sembrando lo mismo en todas', finca.igual]].map(([t, x]) => x && (
                      <div key={t}><b>{t}</b><Filas filas={filasPrediccion(x)} /></div>
                    ))}
                    {modelo?.aviso && <p className="an-texto-s"><b>{modelo.aviso}</b></p>}
                    {r.corroboracion && <Corroboracion c={r.corroboracion} />}
                    <Notas lista={[...(rec?.notas ?? []), ...(finca?.notas ?? [])]} />
                    <p className="an-texto-s"><b>Es una estimación con datos pasados, no un pronóstico. No sustituye a un técnico.</b></p>
                  </section>
                )}

                {lluviaMensual && (
                  <section aria-labelledby="t-cal">
                    <div className="fs-cal-head">
                      <h3 className="fs-sub" id="t-cal">Lluvia media de tu parcela por mes</h3>
                      <div className="fs-legend">
                        <span><i className="fs-sq" style={{ background: '#A3DDB0' }}></i>Lluvia media (mm)</span>
                        <span><i className="fs-sq" style={{ background: '#1B6B3A' }}></i>Temporada de lluvias (jun a sep)</span>
                      </div>
                    </div>
                    <div className="fs-cal-scroll">
                      <div className="fs-cal" role="img" aria-label="Lluvia media mensual de tu parcela">
                        {lluviaMensual.map((m) => (
                          <div key={m.mes} className="fs-cal-col">
                            <span className="fs-cal-mm">{Math.round(m.lluvia_mm)}</span>
                            <div className="fs-cal-box">
                              <div className="fs-cal-bar" style={{ height: `${Math.round((m.lluvia_mm / maxLluvia) * 150)}px`, background: LLUVIAS.includes(m.mes) ? '#1B6B3A' : undefined }}></div>
                            </div>
                            <span className="fs-cal-mes">{MESES[m.mes - 1]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {rotacion.length > 0 && (
                      <p className="an-texto-s">{rotacion.map((p) => `Año ${p.anio}: ${p.cultivo} en ${p.temporada === 'PV' ? 'primavera-verano (PV)' : p.temporada === 'OI' ? 'otoño-invierno (OI)' : p.temporada}`).join(' · ')}</p>
                    )}
                    <p className="an-texto-s"><b>Fechas de siembra: aún sin verificar.</b> Consulta a INIFAP o a un técnico.</p>
                  </section>
                )}

              </RespuestaCard>
            )}

            {temas?.temas?.length > 0 && (
              <section className="fs-card fs-up fs-d1" aria-labelledby="t-ideas">
                <div>
                  <div className="fs-eyebrow">{r ? 'Otros temas' : 'Ideas para preguntar'}</div>
                  <h2 className="fs-card-title xs" id="t-ideas">Elige un tema y toca una pregunta</h2>
                </div>
                <div className="fs-chips" role="group" aria-label="Temas">
                  {temas.temas.map((t, i) => (
                    <button key={t.id} type="button" className="fs-btn fs-btn-pill" aria-pressed={tema === i} onClick={() => setTema(i)}>
                      <i className={`bi ${t.icono}`} aria-hidden="true"></i>
                      {t.titulo}
                    </button>
                  ))}
                </div>
                <div className="an-qs">
                  {temas.temas[tema].preguntas.map((p) => (
                    <button key={p} type="button" className="fs-btn fs-btn-sec fs-btn-block" onClick={() => preguntar(p)}>
                      <i className="bi bi-chat-dots" aria-hidden="true"></i>
                      <span>{p}</span>
                    </button>
                  ))}
                </div>
                {temas.nota && <p className="fs-note">{temas.nota}</p>}
              </section>
            )}
          </div>

          <aside className="fs-aside-col fs-up fs-d1" aria-label="Tu parcela, tu plan y lo que me has dicho">
            <PanelPasos
              lugar={<><i className="bi bi-geo-alt-fill" aria-hidden="true"></i> {labels.lugar}</>}
              accion={
                tarjeta.id === 'perfil' && (
                  <button type="button" className="fs-panel-link" onClick={() => { reiniciarPerfil(); setActiva(PRIMER_PERFIL); }}>
                    Borrar mis respuestas
                  </button>
                )
              }
              paso={paso}
              total={tarjetas.length}
              titulo={tarjeta.titulo}
              onAnterior={() => setActiva(paso - 1)}
              onSiguiente={() => setActiva(paso + 1)}
              final={
                <button type="button" className="fs-btn fs-btn-primary" onClick={() => preguntar('¿Qué me conviene sembrar?')}>
                  <i className="bi bi-chat-dots" aria-hidden="true"></i>¿Qué siembro?
                </button>
              }
            >
              {tarjetaCuerpo()}
            </PanelPasos>
          </aside>
        </div>
      </main>
    </>
  );

  // The body of the card in sight: one at a time, like the panels of «1. Parcela» and «2. Simulador 3D».
  function tarjetaCuerpo() {
    if (tarjeta.id === 'resumen') {
      return (
        <>
              {r && (
                <div className="an-datos">
                  <b>Datos usados</b>
                  <div className="fs-sources">{r.fuentes?.length ? r.fuentes.map((f) => <span key={f} className="fs-chip-src">{f}</span>) : <span>ninguno</span>}</div>
                  {modelo && <p className="an-peq">Confianza del modelo: <b>{modelo.confianza}</b></p>}
                </div>
              )}
              <dl className="fs-dl">
                {[
                  ['Años analizados', clima?.periodo ? `${clima.periodo.inicio} a ${clima.periodo.fin}` : '—'],
                  ['Lluvia media al año', lluviaAnual ? `${Math.round(lluviaAnual)} mm` : '—'],
                  ['Años secos', aniosSecos != null ? `${aniosSecos} de ${clima.lluvia_pv_anual.length}` : '—'],
                  ['pH del suelo', suelo && !suelo.sin_datos && num(suelo.ph) ? String(suelo.ph) : '—'],
                  ['Arcilla del suelo', suelo && !suelo.sin_datos && num(suelo.arcilla_pct) ? `${suelo.arcilla_pct} %` : '—'],
                ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
        </>
      );
    }
    if (tarjeta.id === 'plan') {
      return (
        <>
              {rotacion.length ? (
                <ul className="fs-planlist">
                  {rotacion.map((p) => (
                    <li key={p.anio}><span className="yr">Año {p.anio}</span>{p.cultivo} ({p.temporada}){p.porque && <small>{p.porque}</small>}</li>
                  ))}
                </ul>
              ) : <p className="an-peq">Pregunta «¿Qué me conviene sembrar?» y aquí aparece tu rotación.</p>}
              <Link className="fs-btn fs-btn-sec fs-btn-block" to="/rotacion">
                <i className="bi bi-arrow-left" aria-hidden="true"></i>Volver al simulador 3D
              </Link>
        </>
      );
    }
    if (falla) return <p className="fs-note" role="alert">No pude cargar las preguntas. Revisa que el servidor esté encendido.</p>;
    if (!tarjeta.q) return <p className="fs-note">Cargando preguntas…</p>;
    return (
      <>
        {paso === PRIMER_PERFIL && (
          <p className="an-peq">Así no te lo vuelvo a preguntar. Se guarda solo en este navegador; no hay cuentas ni servidor de datos.</p>
        )}
        <PreguntaPerfil q={tarjeta.q} />
      </>
    );
  }
}
