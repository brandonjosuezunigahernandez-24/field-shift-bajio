import { useEffect, useRef, useState } from 'react';
import { getTemas, postAsistente, postVoz } from '../api/client.js';
import { useParcelaContext } from '../context/ParcelaContext.jsx';

// Asistente siempre a la mano: botón flotante en todas las pantallas. Una sola respuesta a la vez
// (cada pregunta nueva borra la anterior) y una guía de temas para no salirse de lo que sabe contestar.
export default function AsistenteDock() {
  const { point, agua, prioridad, setAgua, setPrioridad, parcelas } = useParcelaContext();
  // ?asistente=abierto lo deja abierto al cargar (sirve para revisar cómo se ve).
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('asistente') === 'abierto');
  const [temas, setTemas] = useState(null);
  const [tema, setTema] = useState(0);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState({ fase: 'inicio' }); // inicio | pensando | listo | error
  const [perfil, setPerfil] = useState({}); // lo que el agricultor ya contestó (ultimo_cultivo, hectareas…)
  const ultima = useRef('');
  const [grabando, setGrabando] = useState(false);
  const rec = useRef(null);

  useEffect(() => {
    if (open && !temas) getTemas().then(setTemas).catch(() => setTemas({ temas: [], nota: '' }));
  }, [open, temas]);

  async function preguntar(pregunta, extra = perfil) {
    if (!point) {
      setEstado({ fase: 'error', mensaje: 'Primero elige tu parcela en el mapa y vuelvo a ayudarte.' });
      return;
    }
    ultima.current = pregunta;
    setTexto(pregunta);
    setEstado({ fase: 'pensando' }); // esto borra la respuesta anterior
    try {
      const r = await postAsistente({ lat: point.lat, lon: point.lon, pregunta, perfil: { ...extra, agua, prioridad }, parcelas: parcelas.map((p) => ({ id: p.id, hectareas: p.hectareas })) });
      setEstado({ fase: 'listo', r });
    } catch (e) {
      setEstado({ fase: 'error', mensaje: e.message });
    }
  }

  // El agricultor contestó una pregunta de botones ("¿riego o lluvia?"): se guarda y se repite la pregunta.
  function contestar(campo, valor) {
    if (campo === 'agua' && valor !== 'no_se') setAgua(valor);
    if (campo === 'prioridad' && valor !== 'no_se') setPrioridad(valor);
    const nuevo = { ...perfil, [campo]: valor };
    setPerfil(nuevo);
    preguntar(ultima.current, nuevo);
  }

  function reiniciar() {
    setPerfil({});
    setTexto('');
    setEstado({ fase: 'inicio' });
  }

  // Micrófono: graba, convierte a audio de 16 kHz y lo manda a /api/voz. El texto aparece en la caja antes de enviarse.
  async function microfono() {
    if (grabando) {
      rec.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        setEstado({ fase: 'pensando', mensaje: 'Entendiendo lo que dijiste…' });
        try {
          const ctx = new AudioContext({ sampleRate: 16000 });
          const audio = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
          const { texto: dicho } = await postVoz(audio.getChannelData(0));
          setTexto(dicho);
          setEstado({ fase: 'inicio', mensaje: 'Esto entendí. Si está bien, toca «Preguntar».' });
        } catch (e) {
          setEstado({ fase: 'error', mensaje: e.message || 'No pude entender el audio. Intenta de nuevo o escribe tu pregunta.' });
        }
      };
      rec.current = mr;
      mr.start();
      setGrabando(true);
    } catch {
      setEstado({ fase: 'error', mensaje: 'No pude usar el micrófono. Revisa el permiso del navegador o escribe tu pregunta.' });
    }
  }

  const r = estado.fase === 'listo' ? estado.r : null;
  const pendiente = r?.preguntar ?? r?.afinar?.[0] ?? null;

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
