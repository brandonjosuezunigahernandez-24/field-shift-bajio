import { ErrorMensaje, Vacio } from '../comunes/Estado.jsx';
import Parcela3D from '../../three/Parcela3D.jsx';
import ClimaCard from './ClimaCard.jsx';
import GraficaLluvia from './GraficaLluvia.jsx';
import RotacionCards from './RotacionCards.jsx';
import SueloCard from './SueloCard.jsx';
import TablaCultivos from './TablaCultivos.jsx';

// Props come straight from useParcela: point, clima, suelo and recomendacion are null | { data } | { error }.
// Climate and soil show as soon as a point is chosen; the rotation appears after "Recomendar".
export default function Resultado({ point, clima, suelo, recomendacion }) {
  if (!point) {
    return <Vacio>Marca tu parcela en el mapa para ver su clima y su suelo.</Vacio>;
  }

  const rec = recomendacion?.data;

  return (
    <div className="resultado">
      {recomendacion?.error && <ErrorMensaje mensaje={recomendacion.error} />}

      {rec?._mock && (
        <p className="aviso" role="note">
          {rec._mock}
        </p>
      )}

      {rec && (
        <>
          <RotacionCards rotacion={rec.rotacion} cultivos={rec.cultivos} />
          <Parcela3D rotacion={rec.rotacion} cultivos={rec.cultivos} lluviaAnual={clima?.data?.lluvia_pv_anual} />
        </>
      )}

      {clima?.data && <GraficaLluvia clima={clima.data} />}

      {rec && <TablaCultivos cultivos={rec.cultivos} />}

      <ClimaCard result={clima} />
      <SueloCard result={suelo} />
    </div>
  );
}
