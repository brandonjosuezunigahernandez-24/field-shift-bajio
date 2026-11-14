import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTHS } from '../../config/labels.js';

// Two states, not two series: a normal year (blue, rain) and a dry year (orange). The pair was
// checked for color blindness; the dry years are also listed in text and in ClimaCard's table.
const COLOR_NORMAL = '#2f6fb0';
const COLOR_DRY = '#c2410c';
const COLOR_GRID = '#e1e0d9';
const COLOR_AXIS = '#c3c2b7';

function TooltipLluvia({ active, payload }) {
  if (!active || !payload?.length) return null;
  const year = payload[0].payload;
  return (
    <div className="tooltip">
      <strong>{year.anio}</strong>
      <div>{Math.round(year.lluvia_mm)} mm</div>
      <div>{year.seco ? 'Año seco' : 'Año normal'}</div>
    </div>
  );
}

// Props: clima (the GET /api/clima payload). Draws lluvia_pv_anual with dry years marked
// and the dry-year threshold (umbral_seco_mm) as a dashed line.
export default function GraficaLluvia({ clima }) {
  if (!clima?.lluvia_pv_anual?.length) return null;
  const months = clima.meses_pv ?? [];
  const seasonLabel = months.length
    ? `${MONTHS[months[0] - 1]} a ${MONTHS[months[months.length - 1] - 1]}`
    : 'temporada de lluvias';
  const threshold = Math.round(clima.umbral_seco_mm);
  const dryCount = clima.lluvia_pv_anual.filter((y) => y.seco).length;

  return (
    <section className="card">
      <h2>Lluvia de {seasonLabel}, por año</h2>
      <p className="hint">
        {dryCount} de {clima.lluvia_pv_anual.length} años quedaron por debajo de {threshold} mm (línea punteada).
      </p>
      <ul className="leyenda" aria-label="Leyenda">
        <li>
          <span className="muestra" style={{ background: COLOR_NORMAL }} /> Año normal
        </li>
        <li>
          <span className="muestra" style={{ background: COLOR_DRY }} /> Año seco
        </li>
      </ul>
      <div className="grafica">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={clima.lluvia_pv_anual} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={COLOR_GRID} />
            <XAxis dataKey="anio" tickLine={false} axisLine={{ stroke: COLOR_AXIS }} fontSize={12} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} unit=" mm" />
            <Tooltip content={<TooltipLluvia />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <ReferenceLine
              y={clima.umbral_seco_mm}
              stroke={COLOR_DRY}
              strokeDasharray="4 4"
              label={{ value: `${threshold} mm`, position: 'insideTopRight', fontSize: 12, fill: '#5b6657' }}
            />
            <Bar dataKey="lluvia_mm" name="Lluvia" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {clima.lluvia_pv_anual.map((year) => (
                <Cell key={year.anio} fill={year.seco ? COLOR_DRY : COLOR_NORMAL} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="source">Años secos: {clima.anios_secos.join(', ') || 'ninguno'}. Fuente: NASA POWER.</p>
    </section>
  );
}
