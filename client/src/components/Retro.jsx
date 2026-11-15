import { useId, useState } from 'react';
import { postRetro } from '../api/client.js';
import { useParcelaContext } from '../context/ParcelaContext.jsx';
import { version } from '../../package.json';

// «¿Te sirvió?» debajo de cada respuesta. Manda la pregunta, la respuesta y el voto; nunca coordenadas ni el perfil (solo el estado).
const MOTIVOS = [
  ['no_era', 'No era lo que pregunté'],
  ['falta', 'Falta información'],
  ['largo', 'Está muy largo'],
  ['no_entiendo', 'No le entiendo'],
  ['dato_mal', 'Está mal el dato'],
];

export default function Retro({ r, pregunta }) {
  const { perfil } = useParcelaContext();
  const id = useId(); // puede haber dos tarjetas a la vez (Análisis y botón flotante)
  const [fase, setFase] = useState('votar'); // votar | motivo | gracias
  const [motivo, setMotivo] = useState(null);
  const [comentario, setComentario] = useState('');

  function enviar(util, extra = {}) {
    setFase('gracias');
    // Si falla, postRetro lo guarda en el navegador y lo reintenta después: el agricultor no ve error.
    postRetro({ pregunta: pregunta ?? '', tema: r.tema ?? null, origen: r.origen ?? null, util, respuesta: (r.respuesta ?? '').slice(0, 600), estado: perfil?.estado ?? null, version, ...extra });
  }

  if (fase === 'gracias') return <p className="rt-gracias" role="status">¡Gracias! Con tu respuesta mejoramos el asistente.</p>;

  return (
    <section className="rt" aria-label="¿Te sirvió esta respuesta?">
      <h3 className="rc-h" id={`${id}t`}>¿Te sirvió?</h3>
      {fase === 'votar' && (
        <div className="rt-votos" role="group" aria-labelledby={`${id}t`}>
          <button type="button" onClick={() => enviar(true)}><span aria-hidden="true">👍</span> Sí</button>
          <button type="button" onClick={() => setFase('motivo')}><span aria-hidden="true">👎</span> No</button>
        </div>
      )}
      {fase === 'motivo' && (
        <form className="rt-motivo" onSubmit={(e) => { e.preventDefault(); enviar(false, { motivo, comentario: comentario.trim() || null }); }}>
          <p id={`${id}p`}>¿Qué le faltó? Toca una:</p>
          <div className="rt-opciones" role="group" aria-labelledby={`${id}p`}>
            {MOTIVOS.map(([m, texto]) => (
              <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{texto}</button>
            ))}
          </div>
          <label htmlFor={`${id}c`}>¿Qué querías saber? (si quieres)</label>
          <input id={`${id}c`} value={comentario} maxLength={300} onChange={(e) => setComentario(e.target.value)} placeholder="Escríbelo con tus palabras" />
          <button type="submit" className="rc-btn">Enviar</button>
        </form>
      )}
    </section>
  );
}
