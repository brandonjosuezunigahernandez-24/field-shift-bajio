import { useEffect, useState } from 'react';
import { getTemas } from '../api/client.js';
import { useAsistente } from '../hooks/useAsistente.js';
import { useParcelaContext } from '../context/ParcelaContext.jsx';

// Asistente siempre a la mano: botón flotante en todas las pantallas. Una sola respuesta a la vez
// (cada pregunta nueva borra la anterior) y una guía de temas para no salirse de lo que sabe contestar.
export default function AsistenteDock() {
  const { point } = useParcelaContext();
  const { texto, setTexto, estado, grabando, preguntar, contestar, reiniciar, microfono, r, pendiente } = useAsistente();
  // ?asistente=abierto lo deja abierto al cargar (sirve para revisar cómo se ve).
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('asistente') === 'abierto');
  const [temas, setTemas] = useState(null);
  const [tema, setTema] = useState(0);

  useEffect(() => {
    if (open && !temas) getTemas().then(setTemas).catch(() => setTemas({ temas: [], nota: '' }));
  }, [open, temas]);

  return (
    <>
      <button type="button" className="asx-fab" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="asx">
        <i className="bi bi-chat-dots-fill" aria-hidden="true"></i> {open ? 'Cerrar' : 'Pregúntale al asistente'}
      </button>

      {open && (
        <section id="asx" className="asx" aria-label="Asistente">
          <header className="asx-head">
            <strong>Asistente de tu parcela</strong>
            <span>{point ? point.nombre : 'Elige tu parcela para empezar'}</span>
          </header>

          <div className="asx-body">
            {temas?.temas?.length > 0 && (
              <>
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
              </>
            )}

            <div className="asx-input">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && texto.trim() && preguntar(texto.trim())}
                placeholder="O escribe tu pregunta"
                aria-label="Tu pregunta"
                maxLength={300}
              />
              <button type="button" className={`asx-mic${grabando ? ' rec' : ''}`} onClick={microfono} aria-pressed={grabando} aria-label={grabando ? 'Terminar de grabar' : 'Hablar'}>
                <i className={`bi ${grabando ? 'bi-stop-fill' : 'bi-mic-fill'}`} aria-hidden="true"></i>
                {grabando ? ' Escuchando… toca para terminar' : ' Hablar'}
              </button>
              <button type="button" className="asx-go" onClick={() => texto.trim() && preguntar(texto.trim())}>Preguntar</button>
            </div>

            <div className="asx-answer" aria-live="polite">
              {estado.fase === 'inicio' && <p>{estado.mensaje ?? 'Toca una pregunta de arriba, escribe la tuya o toca «Hablar».'}</p>}
              {estado.fase === 'pensando' && <p>{estado.mensaje ?? 'Pensando… la primera respuesta puede tardar medio minuto.'}</p>}
              {estado.fase === 'error' && <p className="err">{estado.mensaje}</p>}
              {r && (
                <>
                  <p>{r.respuesta}</p>
                  <small>
                    {r.origen === 'motor' ? 'Calculado por el motor de reglas' : r.origen === 'plantilla' ? 'Respuesta de respaldo' : 'Respuesta del asistente'}
                    {r.fuentes?.length ? ` · Fuentes: ${r.fuentes.join(', ')}` : ''}
                    {r.enlaces?.length ? ' · ' : ''}
                    {r.enlaces?.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">ver fuente</a>)}
                  </small>
                </>
              )}
            </div>

            {pendiente && (
              <div className="asx-opts">
                <p><strong>{r.preguntar ? pendiente.pregunta ?? r.respuesta : `Para afinar tu resultado: ${pendiente.pregunta}`}</strong></p>
                {pendiente.opciones.map((o) => (
                  <button key={o.valor} type="button" onClick={() => contestar(pendiente.campo, o.valor)}>{o.texto}</button>
                ))}
              </div>
            )}

            {temas?.nota && <p className="asx-note">{temas.nota}</p>}
            <button type="button" className="asx-reset" onClick={reiniciar}>Empezar de nuevo</button>
          </div>
        </section>
      )}
    </>
  );
}
