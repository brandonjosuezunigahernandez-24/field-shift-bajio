import { SEASON_LABEL } from '../../config/labels.js';

// Props: rotacion ([{ anio, temporada, cultivo, porque }]), cultivos (to show the crop's full name).
export default function RotacionCards({ rotacion, cultivos = [] }) {
  if (!rotacion?.length) return null;
  const nameOf = (id) => cultivos.find((c) => c.id === id)?.nombre ?? id;

  return (
    <section className="card">
      <h2>Tu rotación de 3 años</h2>
      <ol className="rotacion">
        {rotacion.map((step) => (
          <li key={`${step.anio}-${step.temporada}`} className="rotacion-paso">
            <p className="rotacion-anio">
              Año {step.anio} · {SEASON_LABEL[step.temporada] ?? step.temporada}
            </p>
            <p className="rotacion-cultivo">{nameOf(step.cultivo)}</p>
            <p className="rotacion-porque">{step.porque}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
