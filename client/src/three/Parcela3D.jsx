// Isolated slot for the 3D model of the plot (see README.md in this folder).
// Today it is a 2D placeholder with the same props the 3D scene will receive, so the rest of
// the app does not change when the scene lands. No three.js here yet: keep the bundle small.

// Risk bands shared with the future 3D soil color. Text label always goes with the color.
export function riskBand(riesgo) {
  if (riesgo == null) return { id: 'desconocido', label: 'sin dato' };
  if (riesgo < 0.2) return { id: 'bajo', label: 'riesgo bajo' };
  if (riesgo < 0.4) return { id: 'medio', label: 'riesgo medio' };
  return { id: 'alto', label: 'riesgo alto' };
}

// Props:
//   rotacion:    [{ anio, temporada, cultivo, porque }]   (3 steps, 6 with irrigation)
//   cultivos:    [{ id, nombre, puntaje, riesgo, razones }] to color each strip by its crop's risk
//   lluviaAnual: [{ anio, lluvia_mm, seco }] for the future year slider (2000-2024)
export default function Parcela3D({ rotacion = [], cultivos = [], lluviaAnual = [] }) {
  if (!rotacion.length) return null;
  const cropOf = (id) => cultivos.find((c) => c.id === id);

  return (
    <section className="card parcela3d" aria-label="Maqueta de tu parcela">
      <h2>Maqueta de tu parcela</h2>
      <p className="hint">Vista previa. La maqueta en 3D llega después; cada franja es un año de la rotación.</p>
      <div className="franjas">
        {rotacion.map((step) => {
          const crop = cropOf(step.cultivo);
          const band = riskBand(crop?.riesgo);
          return (
            <div key={`${step.anio}-${step.temporada}`} className={`franja riesgo-${band.id}`}>
              <span className="franja-anio">Año {step.anio}</span>
              <span className="franja-cultivo">{crop?.nombre ?? step.cultivo}</span>
              <span className="franja-riesgo">{band.label}</span>
            </div>
          );
        })}
      </div>
      {lluviaAnual.length > 0 && (
        <p className="source">
          Datos listos para la maqueta: {lluviaAnual.length} años de lluvia ({lluviaAnual[0].anio} a{' '}
          {lluviaAnual[lluviaAnual.length - 1].anio}).
        </p>
      )}
    </section>
  );
}
