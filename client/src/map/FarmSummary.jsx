import { useMemo } from 'react';
import { CROP_COLORS, CROP_NAMES } from '../crops.js';
import { SOCCER_FIELD_HA, farmSummary } from './parcels.js';

const fmtHa = (ha) => ha.toLocaleString('es-MX', { maximumFractionDigits: ha < 10 ? 1 : 0 });

// "Tu terreno": the whole farm at a glance. Total hectares (overlaps counted once), the same
// in soccer fields, and one colored bar per crop.
export default function FarmSummary({ parcelas }) {
  const summary = useMemo(() => farmSummary(parcelas), [parcelas]);
  if (!parcelas.length) return null;

  const fields = summary.totalHa / SOCCER_FIELD_HA;
  const widest = Math.max(...summary.byCrop.map((c) => c.ha));

  return (
    <section className="farm-summary" aria-label="Resumen de tu terreno">
      <div className="farm-total">
        <span className="farm-total-label">Tu terreno</span>
        <span className="farm-total-value">
          {fmtHa(summary.totalHa)} <small>ha</small>
        </span>
        <span className="farm-total-note">
          {parcelas.length} {parcelas.length === 1 ? 'parcela' : 'parcelas'} · como{' '}
          {fields < 1 ? 'menos de 1 cancha' : `${Math.round(fields)} ${Math.round(fields) === 1 ? 'cancha' : 'canchas'}`} de
          fútbol
        </span>
      </div>

      <ul className="farm-crops">
        {summary.byCrop.map(({ cultivo, ha }) => (
          <li key={cultivo}>
            <span className="farm-crop-name">{CROP_NAMES[cultivo]}</span>
            <span className="farm-crop-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(4, (ha / widest) * 100)}%`, background: CROP_COLORS[cultivo] }} />
            </span>
            <span className="farm-crop-ha">
              {fmtHa(ha)} ha <small>({Math.round((ha / summary.totalHa) * 100)} %)</small>
            </span>
          </li>
        ))}
      </ul>

      {summary.estimated && summary.overlapHa >= 0.05 && (
        <p className="hint">
          Hay {fmtHa(summary.overlapHa)} ha donde una parcela está encima de otra: se cuentan una sola vez, con el
          cultivo de la parcela más nueva.
        </p>
      )}
    </section>
  );
}
