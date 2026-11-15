import { useEffect, useState } from 'react';
import { getPerfilPreguntas } from '../api/client.js';
import { useParcelaContext } from '../context/ParcelaContext.jsx';

const BASICAS = ['agua', 'prioridad', 'estado'];
let ultimaSuma = 0; // última suma de hectáreas dibujadas que ya se copió al perfil

// Pregunta numérica: se escribe el número o se toca «No sé». Se guarda al salir de la caja o con Enter.
function Numero({ q, valor, onSet }) {
  const [txt, setTxt] = useState(valor ?? '');
  useEffect(() => setTxt(valor ?? ''), [valor]);
  const guardar = () => {
    const v = Number(txt);
    if (txt !== '' && v >= q.min && v <= q.max) onSet(v);
    else setTxt(valor ?? '');
  };
  return (
    <div className="pf-num">
      <input type="number" inputMode="decimal" min={q.min} max={q.max} step="any" value={txt} placeholder={`${q.min} a ${q.max}`}
        aria-labelledby={`pf-${q.campo}`} onChange={(e) => setTxt(e.target.value)} onBlur={guardar} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <button type="button" className="pf-opt" aria-pressed={valor == null} onClick={() => onSet('')}>No sé</button>
    </div>
  );
}

// Formulario del perfil armado con GET /api/perfil/preguntas (el servidor decide qué hay y qué opciones tiene).
export default function PerfilForm() {
  const { perfil, setPerfilCampo, parcelas, clima } = useParcelaContext();
  const [preguntas, setPreguntas] = useState(null);
  const [falla, setFalla] = useState(false);
  const has = Math.round(parcelas.reduce((s, p) => s + (p.hectareas || 0), 0) * 100) / 100;

  useEffect(() => {
    getPerfilPreguntas().then((d) => setPreguntas(d.preguntas ?? [])).catch(() => setFalla(true));
  }, []);

  // Las hectáreas salen de las parcelas dibujadas; el agricultor puede cambiarlas después.
  const q0 = preguntas?.find((q) => q.campo === 'hectareas');
  useEffect(() => {
    // Solo cuando cambia la suma: si el agricultor corrigió el número, cambiar de pantalla no lo pisa.
    if (!q0) return;
    if (has !== ultimaSuma && has >= q0.min && has <= q0.max) setPerfilCampo('hectareas', has);
    ultimaSuma = has;
  }, [has, q0, setPerfilCampo]);

  if (falla) return <p className="fs-note" role="alert">No pude cargar las preguntas. Revisa que el servidor esté encendido.</p>;
  if (!preguntas) return <p className="fs-note">Cargando preguntas…</p>;

  const visibles = preguntas.filter((q) => !q.solo_si || Object.entries(q.solo_si).every(([k, v]) => perfil[k] === v));
  const grupo = (lista, titulo) => lista.length > 0 && (
    <div className="pf-grupo">
      <h3 className="pf-titulo">{titulo}</h3>
      {lista.map((q) => (
        <div key={q.campo} className="pf-q">
          <p className="fs-q" id={`pf-${q.campo}`}>{q.pregunta}</p>
          {q.tipo === 'numero' ? (
            <Numero q={q} valor={perfil[q.campo]} onSet={(v) => setPerfilCampo(q.campo, v)} />
          ) : (
            <div className="pf-opts" role="radiogroup" aria-labelledby={`pf-${q.campo}`}>
              {q.opciones.map((o) => {
                const on = o.valor === 'no_se' ? perfil[q.campo] == null : perfil[q.campo] === o.valor;
                return <button key={o.valor} type="button" className="pf-opt" aria-pressed={on} onClick={() => setPerfilCampo(q.campo, o.valor)}>{o.texto}</button>;
              })}
            </div>
          )}
          {q.campo === 'estado' && perfil.estado && perfil.estado === clima?.data?.estado ? (
            <small className="pf-porque">Lo elegimos solo, con la ubicación de tu parcela en el mapa (límites del INEGI).</small>
          ) : (
            q.porque && <small className="pf-porque">{q.porque}</small>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <div className="pf">
      {grupo(visibles.filter((q) => BASICAS.includes(q.campo)), 'Lo básico')}
      {grupo(visibles.filter((q) => !BASICAS.includes(q.campo)), 'Cuéntame más')}
    </div>
  );
}
