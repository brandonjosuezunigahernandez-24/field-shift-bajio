import { Link } from 'react-router-dom';
import { useParcelaContext } from '../context/ParcelaContext.jsx';

// Screens 2, 3 and 4 work without screen 1 (they use the Celaya example), but they say so,
// so nobody takes the example for their own plot. It goes away once the farmer picks a plot.
export default function AvisoEjemplo() {
  const { point } = useParcelaContext();
  if (point && !point.ejemplo) return null;
  return (
    <p className="fs-aviso-ejemplo" role="status">
      <i className="bi bi-info-circle-fill" aria-hidden="true"></i>
      <span>
        Estás viendo un <b>ejemplo en Celaya</b>, no tu parcela. <Link to="/">Elige tu parcela</Link> para ver tus datos.
      </span>
    </p>
  );
}
