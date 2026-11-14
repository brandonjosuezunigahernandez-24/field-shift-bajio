import { Component, Suspense, lazy, useState } from 'react';

// three.js + the 3D view (~1 MB) live in their own chunk: the 2D page loads and works first,
// and a computer without WebGL never downloads it.
const Vista3D = lazy(() => import('./three/Vista3D.jsx'));

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// If anything in the 3D view breaks, the rest of the page keeps working.
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
      return (
        <p className="error" role="alert">
          No pudimos mostrar la vista 3D en este equipo. Los datos de tu parcela siguen abajo.
        </p>
      );
    }
    return this.props.children;
  }
}

export default function Vista3DSection(props) {
  const [supported] = useState(hasWebGL);

  return (
    <section className="card">
      <h2>Tu parcela en 3D</h2>
      {supported ? (
        <ErrorBoundary>
          <Suspense fallback={<p className="status">Cargando el globo…</p>}>
            <Vista3D {...props} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <p className="hint">
          Este navegador no puede mostrar gráficos 3D. Puedes usar la herramienta igual: los datos de tu parcela
          aparecen abajo.
        </p>
      )}
    </section>
  );
}
