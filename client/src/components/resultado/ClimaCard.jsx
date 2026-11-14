import { MONTHS, ORIGIN_LABEL } from '../../config/labels.js';

// Shows the GET /api/clima payload (or the `clima` block of /api/recomendar).
// `result` is { data } or { error }, as returned by useParcela.
export default function ClimaCard({ result }) {
  if (!result) return null;
  if (result.error) {
    return (
      <section className="card">
        <h2>Lluvia y temperatura</h2>
        <p className="error" role="alert">{result.error}</p>
      </section>
    );
  }

  const clima = result.data;
  const years = clima.lluvia_pv_anual;
  const temps = clima.temp_media_mensual.filter((m) => m.t_media_c !== null);
  const hottest = temps.reduce((a, b) => (b.t_media_c > a.t_media_c ? b : a));
  const coldest = temps.reduce((a, b) => (b.t_media_c < a.t_media_c ? b : a));

  return (
    <section className="card">
      <h2>Lluvia y temperatura</h2>
      <ul className="facts">
        <li>
          En un año normal llueven <strong>{Math.round(clima.lluvia_pv_mediana_mm)} mm</strong> de junio a septiembre.
        </li>
        <li>
          En <strong>{clima.anios_secos.length} de {years.length} años</strong> llovió menos de{' '}
          {Math.round(clima.umbral_seco_mm)} mm
          (años secos): {clima.anios_secos.join(', ') || 'ninguno'}.
        </li>
        <li>
          El mes más caluroso es {MONTHS[hottest.mes - 1]} ({hottest.t_media_c} °C en promedio) y el más frío es{' '}
          {MONTHS[coldest.mes - 1]} ({coldest.t_media_c} °C).
        </li>
      </ul>

      <details>
        <summary>Ver la lluvia de cada año</summary>
        <table>
          <caption>Lluvia de junio a septiembre, por año</caption>
          <thead>
            <tr>
              <th scope="col">Año</th>
              <th scope="col">Lluvia (mm)</th>
              <th scope="col">¿Año seco?</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year.anio} className={year.seco ? 'dry' : undefined}>
                <td>{year.anio}</td>
                <td>{Math.round(year.lluvia_mm)}</td>
                <td>{year.seco ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="source">
        Fuente: {clima.fuente}, {clima.periodo.inicio} a {clima.periodo.fin}. Dato {ORIGIN_LABEL[clima.origen]}.
      </p>
    </section>
  );
}
