import { ORIGIN_LABEL } from '../../config/labels.js';

// Shows the GET /api/suelo payload (or the `suelo` block of /api/recomendar).
// Handles `sin_datos: true` (urban areas and water bodies come back with null values).
export default function SueloCard({ result }) {
  if (!result) return null;
  if (result.error) {
    return (
      <section className="card">
        <h2>Suelo</h2>
        <p className="error" role="alert">{result.error}</p>
      </section>
    );
  }

  const suelo = result.data;
  return (
    <section className="card">
      <h2>Suelo (primeros 30 cm)</h2>
      {suelo.sin_datos ? (
        <p className="error" role="alert">{suelo.aviso}</p>
      ) : (
        <ul className="facts">
          <li>
            pH: <strong>{suelo.ph}</strong>
          </li>
          <li>
            Arcilla {suelo.arcilla_pct} %, arena {suelo.arena_pct} %, limo {suelo.limo_pct} %
          </li>
          <li>Carbono orgánico: {suelo.carbono_organico_g_kg} g por kg de suelo</li>
          <li>Nitrógeno: {suelo.nitrogeno_g_kg} g por kg de suelo</li>
        </ul>
      )}
      <p className="source">
        Fuente: {suelo.fuente}. Dato {ORIGIN_LABEL[suelo.origen]}.
      </p>
    </section>
  );
}
