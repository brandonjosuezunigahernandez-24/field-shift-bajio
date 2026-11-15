import { soilLayerColors } from '../three/parcelState.js';

const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
const show = (v, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);

// The soil of the parcel with official data: soil type (SoilGrids WRB), its layers down to 1 m
// (SoilGrids) and how wet it was in the rainy season (NASA POWER GWET*). Same colors as the block.
//   suelo  GET /api/suelo   clima  GET /api/clima   anio  year shown in the 3D view
export default function SoilCard({ suelo, clima, anio }) {
  if (!suelo || suelo.sin_datos) return null;
  const tipo = suelo.tipo;
  const capas = suelo.capas ?? [];
  const colors = new Map(soilLayerColors(suelo).map((b) => [b.desde, b.color]));
  const humAnio = clima?.humedad_suelo_pv_anual?.find((y) => y.anio === anio);
  const humMedia = clima?.humedad_suelo_pv;
  const hasHum = humAnio && humAnio.raiz_pct !== null;

  return (
    <fieldset className="vista3d-soil">
      <legend>Tu suelo, con datos oficiales</legend>
      {tipo && (
        <p>
          Tipo de suelo: <strong>{tipo.nombre}</strong>
          {tipo.probabilidad_pct !== null && ` (${tipo.probabilidad_pct} % de probabilidad)`}.{' '}
          {tipo.descripcion}
          {tipo.alternativas?.length > 0 && (
            <span className="hint"> También podría ser {tipo.alternativas.map((a) => `${a.nombre} (${a.probabilidad_pct} %)`).join(' o ')}.</span>
          )}
        </p>
      )}

      {capas.length > 0 && (
        <div className="soil-table-wrap">
          <table className="soil-table">
            <caption>Capas de tu suelo hasta 1 m (los mismos colores que los lados de la maqueta)</caption>
            <thead>
              <tr>
                <th scope="col">Profundidad</th>
                <th scope="col">Arcilla · arena · limo</th>
                <th scope="col">pH</th>
                <th scope="col">Carbono orgánico</th>
                <th scope="col">Piedras</th>
                <th scope="col">Qué tan apretado</th>
              </tr>
            </thead>
            <tbody>
              {capas.map((c) => (
                <tr key={c.profundidad_cm}>
                  <th scope="row">
                    {colors.has(c.desde_cm) && <span className="soil-swatch" style={{ background: css(colors.get(c.desde_cm)) }} aria-hidden="true" />}
                    {c.desde_cm} a {c.hasta_cm} cm
                  </th>
                  <td>{show(c.arcilla_pct, '%')} · {show(c.arena_pct, '%')} · {show(c.limo_pct, '%')}</td>
                  <td>{show(c.ph)}</td>
                  <td>{show(c.carbono_organico_g_kg, ' g/kg')}</td>
                  <td>{show(c.piedras_pct, '%')}</td>
                  <td>{show(c.densidad_aparente_g_cm3, ' g/cm³')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasHum && (
        <p>
          Humedad del suelo de junio a septiembre de {anio} (NASA POWER): arriba {show(humAnio.superficie_pct, ' %')}, donde
          están las raíces {show(humAnio.raiz_pct, ' %')} y en todo el perfil {show(humAnio.perfil_pct, ' %')}
          {humMedia?.raiz_pct !== null && humMedia?.raiz_pct !== undefined && `; un año común aquí tiene ${humMedia.raiz_pct} % donde están las raíces`}.
          <span className="hint"> 0 % es suelo seco y 100 % suelo encharcado.</span>
        </p>
      )}

      <p className="hint">
        Fuentes: SoilGrids 2.0 de ISRIC (mapas de 250 m hechos con miles de muestras de suelo; es una estimación, no un análisis de
        tu parcela) y NASA POWER (humedad GWETTOP, GWETROOT y GWETPROF). Para decidir el fertilizante, lo mejor sigue siendo un
        análisis de suelo en laboratorio.
      </p>
    </fieldset>
  );
}
