// Props: cultivos ([{ id, nombre, puntaje 0-100, riesgo 0-1, razones[] }]), already sorted by the server.
export default function TablaCultivos({ cultivos }) {
  if (!cultivos?.length) return null;
  return (
    <section className="card">
      <h2>Cómo le va a cada cultivo en tu parcela</h2>
      <table className="tabla-cultivos">
        <thead>
          <tr>
            <th scope="col">Cultivo</th>
            <th scope="col">Puntaje</th>
            <th scope="col">Riesgo</th>
            <th scope="col">Por qué</th>
          </tr>
        </thead>
        <tbody>
          {cultivos.map((crop) => (
            <tr key={crop.id}>
              <th scope="row">{crop.nombre ?? crop.id}</th>
              <td>{Math.round(crop.puntaje)} / 100</td>
              <td>{Math.round(crop.riesgo * 100)} % de los años</td>
              <td>
                <ul className="razones">
                  {(crop.razones ?? []).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="source">Riesgo: parte de los años en que la lluvia no alcanzó lo que el cultivo necesita.</p>
    </section>
  );
}
