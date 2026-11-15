import { Component, Suspense, lazy, useState } from 'react';
import { useParcelaContext } from '../context/ParcelaContext.jsx';

// three.js y la vista 3D pesan ~1 MB: van en su propio paquete, después de que la pantalla ya se ve.
const Vista3D = lazy(() => import('../three/Vista3D.jsx'));

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// Si algo de la vista 3D falla, el resto de la pantalla sigue funcionando.
class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Vista 3D:', error);
  }

  render() {
    if (this.state.failed) {
      return <p className="error" role="alert">No pudimos mostrar la vista 3D en este equipo. El resto de tu análisis sigue disponible.</p>;
    }
    return this.props.children;
  }
}

// Vista 3D de la parcela, alimentada por el estado compartido (parcelas dibujadas, clima, suelo y año).
export default function Vista3DPanel() {
  const { point, parcelas, clima, suelo, year, choosePoint, pronostico, recomendacion } = useParcelaContext();
  const [supported] = useState(hasWebGL);

  return (
    <div className="v3d v3d-embed">
      {supported ? (
        <ErrorBoundary>
          <Suspense fallback={<p className="status">Cargando la vista 3D…</p>}>
            <Vista3D point={point} parcelas={parcelas} clima={clima} suelo={suelo} year={year} onSelectPoint={choosePoint} pronostico={pronostico?.disponible ? pronostico : null} recomendacion={recomendacion?.data ?? null} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <p className="hint">Este navegador no puede mostrar gráficos 3D. Tu análisis sigue disponible abajo.</p>
      )}
    </div>
  );
}
