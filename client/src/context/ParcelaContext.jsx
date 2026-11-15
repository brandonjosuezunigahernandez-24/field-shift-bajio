import { createContext, useContext } from 'react';
import { useParcela } from '../hooks/useParcela.js';
import FS_DATOS from '../data/datosDemo.js';

const ParcelaContext = createContext(null);

export function ParcelaProvider({ children }) {
  const value = useParcela();
  return <ParcelaContext.Provider value={value}>{children}</ParcelaContext.Provider>;
}

export function useParcelaContext() {
  const ctx = useContext(ParcelaContext);
  if (!ctx) throw new Error('useParcelaContext must be used inside <ParcelaProvider>');
  return ctx;
}

// Texts for the header pills: "Celaya, Gto. · 20.47, -100.81" and "Temporal · Arriesgar menos".
export function selectionLabels({ point, agua, prioridad }) {
  const p = point || { nombre: 'Celaya, Gto.', lat: 20.47, lon: -100.81 };
  return {
    lugar: `${p.nombre} · ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`,
    manejo: `${(FS_DATOS.agua[agua] || FS_DATOS.agua.temporal).titulo} · ${(FS_DATOS.prioridades[prioridad] || FS_DATOS.prioridades.riesgo).titulo}`,
  };
}
