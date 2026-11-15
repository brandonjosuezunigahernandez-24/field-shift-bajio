import { useEffect, useRef, useState } from 'react';
import { getTemas } from '../api/client.js';
import { useAsistente } from '../hooks/useAsistente.js';
import { useParcelaContext } from '../context/ParcelaContext.jsx';
import RespuestaCard, { EstadoAsistente, preguntasSiguientes } from './Respuesta.jsx';

// Asistente siempre a la mano: botón flotante en todas las pantallas. Una sola respuesta a la vez
// (cada pregunta nueva borra la anterior) y una guía de temas para no salirse de lo que sabe contestar.
export default function AsistenteDock() {
  const { point, ensurePoint } = useParcelaContext();
  const { pregunta, seg, texto, setTexto, estado, grabando, preguntar, contestar, reiniciar, reintentar, microfono, r, pendiente } = useAsistente();
  // ?asistente=abierto lo deja abierto al cargar; con &pregunta=... además la hace (sirve para revisar cómo se ve).
  const params = new URLSearchParams(window.location.search);
  const [open, setOpen] = useState(() => params.get('asistente') === 'abierto');
  const [temas, setTemas] = useState(null);
  const [tema, setTema] = useState(0);
  const auto = useRef(false);

  useEffect(() => {
    if (open && !temas) getTemas().then(setTemas).catch(() => setTemas({ temas: [], nota: '' }));
  }, [open, temas]);

  useEffect(() => {
    const q = params.get('asistente') === 'abierto' && params.get('pregunta');
    if (!q || auto.current || window.location.pathname.startsWith('/analisis')) return;
    if (!point) return void ensurePoint();
    auto.current = true;
    preguntar(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  const enviar = () => texto.trim() && preguntar(texto.trim());

  return (
    <>
      <button type="button" className="asx-fab" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="asx">
        <i className={`bi ${open ? 'bi-x-lg' : 'bi-chat-dots-fill'}`} aria-hidden="true"></i> <span className="asx-fab-txt">{open ? 'Cerrar' : 'Pregúntale al asistente'}</span>
      </button>

      {open && (
        <section id="asx" className="asx" aria-label="Asistente">
          <header className="asx-head">
            <strong>Asistente de tu parcela</strong>
            <span>{point ? point.nombre : 'Elige tu parcela para empezar'}</span>
          </header>

          <div className="asx-body">
            <div className="asx-input">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                placeholder="Escribe tu pregunta"
                aria-label="Tu pregunta"
                maxLength={300}
              />
              <div className="asx-botones">
                <button type="button" className={`asx-mic${grabando ? ' rec' : ''}`} onClick={microfono} aria-pressed={grabando} aria-label={grabando ? 'Terminar de grabar' : 'Hablar'}>
                  <i className={`bi ${grabando ? 'bi-stop-fill' : 'bi-mic-fill'}`} aria-hidden="true"></i>
                  {grabando ? ' Toca para terminar' : ' Hablar'}
                </button>
                <button type="button" className="asx-go" onClick={enviar}>Preguntar</button>
              </div>
            </div>

            <EstadoAsistente estado={estado} point={point} reintentar={reintentar} inicio="Escribe o toca «Hablar». También puedes tocar una de las preguntas de abajo." />

            {r && (
              <RespuestaCard
                r={r} pregunta={pregunta} seg={seg} pendiente={pendiente} contestar={contestar} preguntar={preguntar}
                siguientes={preguntasSiguientes(r, temas, tema)} compacto
              />
            )}

            {temas?.temas?.length > 0 && (
              <section className="asx-ideas" aria-label="Ideas para preguntar">
                <h3 className="rc-h">{r ? 'Otros temas' : 'Ideas para preguntar'}</h3>
                <div className="asx-tabs" role="tablist" aria-label="Temas">
                  {temas.temas.map((t, i) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tema === i} className={tema === i ? 'on' : ''} onClick={() => setTema(i)}>
                      <i className={`bi ${t.icono}`} aria-hidden="true"></i> {t.titulo}
                    </button>
                  ))}
                </div>
                <div className="asx-qs">
                  {temas.temas[tema].preguntas.map((p) => (
                    <button key={p} type="button" onClick={() => preguntar(p)}>{p}</button>
                  ))}
                </div>
              </section>
            )}

            {temas?.nota && <p className="asx-note">{temas.nota}</p>}
            <button type="button" className="asx-reset" onClick={reiniciar}>Empezar de nuevo</button>
          </div>
        </section>
      )}
    </>
  );
}
