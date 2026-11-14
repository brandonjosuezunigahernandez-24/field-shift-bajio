import { DEFAULT_SOURCES } from '../../config/labels.js';

// Footer with data credits. `fuentes` comes from /api/recomendar when available.
export default function Creditos({ fuentes }) {
  const list = fuentes?.length ? fuentes : DEFAULT_SOURCES;
  return (
    <footer className="page-footer">
      <p>Datos:</p>
      <ul className="creditos">
        {list.map((source) => (
          <li key={source}>{source}</li>
        ))}
      </ul>
      <p>Mapa: © colaboradores de OpenStreetMap.</p>
      <p>NASA Space Apps Challenge 2026, Querétaro. Reto Field Shift.</p>
    </footer>
  );
}
