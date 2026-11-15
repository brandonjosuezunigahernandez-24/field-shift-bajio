import { Children, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Graficas from './Graficas.jsx';
import Retro from './Retro.jsx';
import { copyText, toast } from '../lib/fs.js';

// Tarjeta de respuesta compartida por Análisis IA y el botón flotante. Orden: respuesta corta → Qué hacer →
// Los datos → De dónde salió → Preguntas siguientes. Todo sale de la respuesta del servidor.

const ORIGEN = { motor: 'Calculado con datos del SIAP', plantilla: 'Respuesta de respaldo', llm: 'Respuesta del asistente', modelo: 'Calculado con el modelo de riesgo (SIAP + NASA)' };
// Con `tema` la plantilla es una respuesta calculada a propósito; sin `tema` es respaldo por falla.
export const etiquetaOrigen = (r) => (r.origen === 'plantilla' && r.tema ? 'Calculado con tus datos' : ORIGEN[r.origen] ?? ORIGEN.llm);

// Quita las citas [SIAP] (las fuentes se muestran aparte) y parte el texto en frases cortas.
export const frases = (t) => (t ?? '').replace(/\s*\[[^\]]*\]/g, '').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿¡])|\n+/).map((x) => x.trim()).filter(Boolean);

// Página oficial de cada fuente que nombra el servidor (se compara por el inicio del nombre).
const PAGINAS = [
  ['NASA', 'https://power.larc.nasa.gov/'],
  ['SIAP', 'https://nube.siap.gob.mx/cierreagricola/'],
  ['SoilGrids', 'https://soilgrids.org/'],
  ['Open-Meteo', 'https://open-meteo.com/'],
  ['INEGI', 'https://www.inegi.org.mx/'],
  ['FAO', 'https://gaez.fao.org/pages/ecocrop'],
  ['Wikipedia', 'https://es.wikipedia.org/'],
];
const paginaDe = (f) => PAGINAS.find(([k]) => f.toUpperCase().startsWith(k.toUpperCase()))?.[1];

const escritorio = () => window.matchMedia('(min-width: 768px)').matches;

// Preguntas siguientes: las que manda el servidor, o las del tema de la respuesta, o las del tema abierto.
export function preguntasSiguientes(r, temas, i = 0) {
  if (r?.sugerencias?.length) return r.sugerencias;
  const lista = temas?.temas ?? [];
  return (lista.find((t) => t.id === r?.tema) ?? lista[i])?.preguntas ?? [];
}

function Fuente({ nombre, url }) {
  const href = url || paginaDe(nombre ?? '');
  return href ? <a href={href} target="_blank" rel="noreferrer">{nombre || 'Ver fuente'}</a> : <span>{nombre}</span>;
}

// Lo que se ve mientras el servidor contesta, si falla o antes de preguntar.
export function EstadoAsistente({ estado, point, reintentar, inicio }) {
  const [s, setS] = useState(0);
  const pensando = estado.fase === 'pensando';
  useEffect(() => {
    if (!pensando) return undefined;
    setS(0);
    const id = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [pensando]);

  return (
    <div className="rc-estado" aria-live="polite">
      {estado.fase === 'inicio' && <p>{estado.mensaje ?? inicio}</p>}
      {pensando && (
        <div className="rc-pensando">
          <span className="rc-giro" aria-hidden="true"></span>
          <div>
            <b>{estado.mensaje ?? 'Buscando los datos de tu parcela y haciendo las cuentas…'}</b>
            {estado.pregunta && <span>Tu pregunta: «{estado.pregunta}»</span>}
            <span>{s} s · la primera respuesta puede tardar medio minuto.</span>
          </div>
        </div>
      )}
      {estado.fase === 'error' && (
        <div className="rc-error" role="alert">
          <p><i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> {estado.mensaje}</p>
          {!point ? <Link className="rc-btn" to="/">Ir al mapa a elegir mi parcela</Link> : reintentar && <button type="button" className="rc-btn" onClick={reintentar}><i className="bi bi-arrow-clockwise" aria-hidden="true"></i> Intentar de nuevo</button>}
        </div>
      )}
    </div>
  );
}

export default function RespuestaCard({ r, pregunta, seg, pendiente, contestar, preguntar, siguientes = [], compacto = false, ejemplo = false, children }) {
  const [hablando, setHablando] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), [r]);

  const lista = frases(r.respuesta);
  const acciones = Array.isArray(r.que_hacer) ? r.que_hacer.filter((a) => a?.accion).slice(0, 3) : [];
  const sig = siguientes.filter((p) => p !== pregunta).slice(0, 3);
  const abierto = !compacto && escritorio();
  const texto = [...lista, ...acciones.map((a, i) => `Paso ${i + 1}: ${a.accion}`)].join(' ');

  function escuchar() {
    if (!('speechSynthesis' in window)) return toast('Tu navegador no puede leer en voz alta');
    speechSynthesis.cancel();
    if (hablando) return setHablando(false);
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-MX';
    u.onend = u.onerror = () => setHablando(false);
    setHablando(true);
    speechSynthesis.speak(u);
  }

  return (
    <article className={`rc${compacto ? ' rc-compacto' : ''}`} aria-label="Respuesta del asistente">
      {pregunta && <p className="rc-preg">Preguntaste: «{pregunta}»</p>}

      <div className="rc-corta">
        <h2>{lista[0]}</h2>
        {/* El resto no se pliega: a veces la cifra que pidió el agricultor viene en la 3.ª frase. */}
        {lista.slice(1).map((f) => <p key={f}>{f}</p>)}
        <div className="rc-barra">
          <button type="button" className="rc-btn rc-oir" onClick={escuchar} aria-pressed={hablando}>
            <i className={`bi ${hablando ? 'bi-stop-fill' : 'bi-volume-up-fill'}`} aria-hidden="true"></i> {hablando ? 'Parar' : 'Escuchar'}
          </button>
          <span className="rc-origen">{etiquetaOrigen(r)}</span>
        </div>
      </div>

      {pendiente && (
        <div className="rc-opts">
          <p><strong>{r.preguntar ? pendiente.pregunta ?? r.respuesta : `Para afinar tu resultado: ${pendiente.pregunta}`}</strong></p>
          {pendiente.opciones.map((o) => (
            <button key={o.valor} type="button" onClick={() => contestar(pendiente.campo, o.valor)}>{o.texto}</button>
          ))}
        </div>
      )}

      {acciones.length > 0 && (
        <section aria-label="Qué hacer">
          <h3 className="rc-h">Qué hacer{ejemplo && <span className="gr-ej"> · ejemplo, no son datos reales</span>}</h3>
          <ol className="rc-acciones">
            {acciones.map((a, i) => (
              <li key={a.accion}>
                <span className="rc-num" aria-hidden="true">{i + 1}</span>
                <div>
                  <b>{a.accion}</b>
                  {a.porque && <p>{a.porque}</p>}
                  {(a.fuente || a.url) && <small>Fuente: <Fuente nombre={a.fuente} url={a.url} /></small>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(r.graficas?.length > 0 || Children.toArray(children).length > 0) && (
        <details key={`g${r.respuesta}`} className="rc-plegable" open={abierto}>
          <summary><i className="bi bi-bar-chart-fill" aria-hidden="true"></i> Los datos</summary>
          <Graficas graficas={r.graficas} ejemplo={ejemplo} />
          {children}
        </details>
      )}

      <section className="rc-fuentes" aria-label="De dónde salió">
        <h3 className="rc-h">De dónde salió</h3>
        <div className="rc-chips">
          {r.fuentes?.length ? r.fuentes.map((f) => <Fuente key={f} nombre={f} />) : <span>Sin fuente externa</span>}
          {r.enlaces?.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">Página consultada (la app no la revisa)</a>)}
        </div>
        {r.proceso?.length > 0 && (
          <details className="rc-como">
            <summary>Cómo llegó a la respuesta ({r.proceso.length} pasos{seg ? `, ${seg.toFixed(1)} s` : ''})</summary>
            <ol>{r.proceso.map((p) => <li key={p.titulo}><b>{p.titulo}.</b> {p.detalle}</li>)}</ol>
          </details>
        )}
      </section>

      {sig.length > 0 && preguntar && (
        <section aria-label="Preguntas siguientes">
          <h3 className="rc-h">También puedes preguntar</h3>
          <div className="rc-sig">
            {sig.map((p) => <button key={p} type="button" onClick={() => preguntar(p)}>{p}</button>)}
          </div>
        </section>
      )}

      {!ejemplo && !r.preguntar && <Retro key={r.respuesta} r={r} pregunta={pregunta} />}

      <button type="button" className="rc-copiar" onClick={() => copyText(texto, () => toast('Respuesta copiada'), () => toast('No se pudo copiar'))}>
        <i className="bi bi-clipboard" aria-hidden="true"></i> Copiar respuesta
      </button>
    </article>
  );
}
