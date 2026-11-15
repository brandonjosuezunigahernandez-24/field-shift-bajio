import { Route, Routes } from 'react-router-dom';
import { ParcelaProvider } from './context/ParcelaContext.jsx';
import Parcela from './pages/Parcela.jsx';
import Rotacion from './pages/Rotacion.jsx';
import Analisis from './pages/Analisis.jsx';
import Cultivo from './pages/Cultivo.jsx';
import PruebaGraficas from './pages/PruebaGraficas.jsx';
import AsistenteDock from './components/AsistenteDock.jsx';

// Four screens, same routes as the original design (index, rotacion, analisis, cultivo).
// All shared state lives in ParcelaProvider (hooks/useParcela.js).
export default function App() {
  return (
    <ParcelaProvider>
      <Routes>
        <Route path="/" element={<Parcela />} />
        <Route path="/rotacion" element={<Rotacion />} />
        <Route path="/analisis" element={<Analisis />} />
        <Route path="/cultivo" element={<Cultivo />} />
        <Route path="/prueba-graficas" element={<PruebaGraficas />} />
        <Route path="*" element={<Parcela />} />
      </Routes>
      <AsistenteDock />
    </ParcelaProvider>
  );
}
