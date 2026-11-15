import { useId, useState } from 'react';
import { partirGlosario } from '../glosario.js';

// Palabra técnica subrayada: al tocarla (o con Enter/Espacio) abre su explicación justo después; Esc la cierra.
function Termino({ g, children }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="gl-term" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(!abierto)} onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}>
        {children}<span className="visually-hidden"> (qué quiere decir)</span>
      </button>
      <span id={id} role="note" className="gl-def" hidden={!abierto}>{g.def}</span>
    </>
  );
}

// Texto con las palabras del glosario marcadas. Pasa el mismo `vistos` a toda la tarjeta para marcar cada palabra una vez.
export function conGlosario(texto, vistos) {
  return partirGlosario(texto, vistos).map((p, i) => (typeof p === 'string' ? p : <Termino key={i} g={p.termino}>{p.texto}</Termino>));
}
