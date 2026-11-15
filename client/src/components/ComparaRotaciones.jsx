import { compararRotaciones } from '../lib/comparacion.js';

// The 3 rotations side by side, one measure per block: a name, a bar and the figure on each row.
// The rotation seen on the map (`activa`) is the green one; the others are gray. The figures are always written,
// and «mejor» is said in words, so nothing depends on color alone.
export default function ComparaRotaciones({ estrategias, activa, agua }) {
  const medidas = compararRotaciones(estrategias);
  if (!medidas.length) return null;
  return (
    <div className="fs-compara">
      <p className="fs-note">
        Las rotaciones lado a lado. En verde, la que ves en el mapa.
        {agua === 'riego' ? ' Con riego la lluvia no limita, así que no se compara el riesgo por años secos.' : ''}
      </p>
      {medidas.map((m) => (
        <figure key={m.id} className="fs-medida">
          <figcaption>
            <b>{m.titulo}</b> <span className="fs-medida-pista">{m.mejor === 'menos' ? 'menos es mejor' : 'más es mejor'}</span>
          </figcaption>
          <ul>
            {m.filas.map((f) => (
              <li key={f.id} className={f.id === activa ? 'is-activa' : undefined}>
                <span className="fs-medida-nombre">{f.nombre}</span>
                <span className="fs-medida-barra" aria-hidden="true">
                  {f.ancho > 0 && <span style={{ width: `${Math.max(2, f.ancho * 100)}%` }} />}
                </span>
                <span className="fs-medida-valor">
                  {f.texto}
                  {f.esMejor && <span className="fs-mejor"> ✓ mejor</span>}
                </span>
              </li>
            ))}
          </ul>
        </figure>
      ))}
    </div>
  );
}
