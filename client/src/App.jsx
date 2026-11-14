import { useParcela } from './hooks/useParcela.js';
import MapaParcela from './components/mapa/MapaParcela.jsx';
import FormularioParcela from './components/formulario/FormularioParcela.jsx';
import Resultado from './components/resultado/Resultado.jsx';
import { Cargando } from './components/comunes/Estado.jsx';
import Creditos from './components/comunes/Creditos.jsx';

// One page, three steps: plot (map), what the farmer wants (form), result (rotation + charts).
// All state lives in useParcela; this file only lays things out.
export default function App() {
  const parcela = useParcela();

  return (
    <div className="page">
      <header className="page-header">
        <h1>Field Shift Bajío</h1>
        <p>Rotación de cultivos para tu parcela de temporal, con datos de la NASA.</p>
      </header>

      <main className="layout">
        <div className="columna-entrada">
          <section className="card">
            <h2>1. Marca tu parcela</h2>
            <MapaParcela point={parcela.point} onSelect={parcela.selectPoint} disabled={parcela.loading} />
          </section>

          <section className="card">
            <h2>2. Cuéntanos de tu parcela</h2>
            <FormularioParcela
              agua={parcela.agua}
              prioridad={parcela.prioridad}
              onAguaChange={parcela.setAgua}
              onPrioridadChange={parcela.setPrioridad}
              onSubmit={parcela.recomendar}
              disabled={!parcela.point || parcela.loading}
            />
          </section>
        </div>

        <div className="columna-resultado">
          <h2 className="titulo-resultado">3. Tu resultado</h2>
          {parcela.loading && <Cargando />}
          <Resultado
            point={parcela.point}
            clima={parcela.clima}
            suelo={parcela.suelo}
            recomendacion={parcela.recomendacion}
          />
        </div>
      </main>

      <Creditos fuentes={parcela.recomendacion?.data?.fuentes} />
    </div>
  );
}
