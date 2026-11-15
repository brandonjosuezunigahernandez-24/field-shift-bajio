import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getClima, getPronostico, getSuelo, postRecomendar } from '../api/client.js';
import { readSelection, saveSelection } from '../lib/fs.js';
import { rotacionActualDe } from '../lib/rotacionActual.js';
import { CUSTOM_POINT, DEFAULT_POINT } from '../config/examplePoints.js';
import { createParcel, farmPoint, nextParcelId } from '../map/parcels.js';
import { useYearPlayer } from '../year.jsx';


// Lo que el agricultor contestó al asistente (ultimo_cultivo, hectareas, textura…). agua y prioridad viven aparte (arriba).
const PERFIL_KEY = 'fieldshift.perfil.v1';
const leerPerfil = () => {
  try {
    const o = JSON.parse(localStorage.getItem(PERFIL_KEY));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};
const guardarPerfil = (o) => {
  try {
    localStorage.setItem(PERFIL_KEY, JSON.stringify(o));
  } catch {
    /* sin localStorage: sigue funcionando en memoria */
  }
};


// Single owner of the app state, shared by the four screens through context/ParcelaContext.jsx:
// the chosen plot, the form answers and the three server results. Each result is null (not asked
// yet), { data } or { error } with a Spanish message. The selection is also saved in localStorage
// (same key as the original design) so a refresh keeps it.
export function useParcela() {
  const saved = readSelection() || {};
  const [point, setPoint] = useState(saved.parcela || null); // { id, nombre, boton, lat, lon }
  const [agua, setAguaState] = useState(saved.agua || 'temporal');
  const [prioridad, setPrioridadState] = useState(saved.prioridad || 'riesgo');
  const [perfilGuardado, setPerfilGuardado] = useState(leerPerfil);
  const [loading, setLoading] = useState(false);
  const [clima, setClima] = useState(null);
  const [suelo, setSuelo] = useState(null);
  const [recomendacion, setRecomendacion] = useState(null);
  // Parcelas que el agricultor dibujó en el mapa (cada una con su cultivo). El servidor recibe el centro de todas.
  const [parcelas, setParcelas] = useState(() => (Array.isArray(saved.parcelas) ? saved.parcelas : []));
  // Kept with the point so a refresh still has the outline (3D frame, assistant hectares).
  useEffect(() => saveSelection({ parcelas }), [parcelas]);
  const [pronostico, setPronostico] = useState(null); // próximos 7 días, o null si no hay
  const recKey = useRef(null); // "lat,lon,agua,prioridad" of the last /api/recomendar call
  const requestId = useRef(0);

  const loadPointData = useCallback((selected) => {
    const id = ++requestId.current;
    const vigente = () => id === requestId.current; // false once a newer selection won
    const resultado = (promise) => promise.then((data) => ({ data }), (err) => ({ error: err.message }));
    setLoading(true);
    setPronostico(null);
    // El pronóstico es un extra: si falla, la app sigue igual.
    getPronostico(selected.lat, selected.lon).then((p) => vigente() && setPronostico(p)).catch(() => {});
    // Clima y suelo se muestran en cuanto llega cada uno: si SoilGrids tarda, la lluvia no espera.
    const clima = resultado(getClima(selected.lat, selected.lon)).then((r) => {
      if (!vigente()) return;
      setClima(r);
      // El estado sale del mapa (límites del INEGI): el agricultor ya no lo tiene que elegir. Fuera de Gto y Qro no se toca.
      const estado = r.data?.estado;
      if (estado) {
        setPerfilGuardado((antes) => {
          const nuevo = { ...antes, estado };
          guardarPerfil(nuevo);
          return nuevo;
        });
      }
    });
    const suelo = resultado(getSuelo(selected.lat, selected.lon)).then((r) => vigente() && setSuelo(r));
    Promise.all([clima, suelo]).then(() => vigente() && setLoading(false));
  }, []);

  // Called by the map click and by the example buttons. Loads climate and soil right away.
  const selectPoint = useCallback(
    ({ lat, lon, id, nombre, boton }) => {
      const selected = {
        id: id || CUSTOM_POINT.id,
        nombre: nombre || CUSTOM_POINT.nombre,
        boton: boton || nombre || CUSTOM_POINT.boton,
        // Sent as is: the server rounds per source (climate ~1 km, soil ~110 m). Rounding here moved the soil off the parcel.
        lat,
        lon,
      };
      setPoint(selected);
      setRecomendacion(null);
      recKey.current = null;
      setClima(null);
      setSuelo(null);
      saveSelection({ parcela: selected });
      loadPointData(selected);
    },
    [loadPointData]
  );

  // Screens 2 and 4 need a plot even if the farmer skipped screen 1: use Celaya and say so.
  const ensurePoint = useCallback(() => {
    if (point) return false;
    selectPoint(DEFAULT_POINT);
    return true;
  }, [point, selectPoint]);

  const setAgua = useCallback((value) => {
    setAguaState(value);
    saveSelection({ agua: value });
  }, []);
  const setPrioridad = useCallback((value) => {
    setPrioridadState(value);
    saveSelection({ prioridad: value });
  }, []);

  // Guarda (o borra, con valor vacío o "no_se") un dato de la ficha. agua y prioridad van a su estado de siempre.
  const setPerfilCampo = useCallback((campo, valor) => {
    if (campo === 'agua' || campo === 'prioridad') {
      if (valor && valor !== 'no_se') (campo === 'agua' ? setAgua : setPrioridad)(valor);
      return;
    }
    setPerfilGuardado((antes) => {
      const { [campo]: _quitado, ...resto } = antes;
      const nuevo = valor === '' || valor == null || valor === 'no_se' ? resto : { ...resto, [campo]: valor };
      guardarPerfil(nuevo);
      return nuevo;
    });
  }, [setAgua, setPrioridad]);
  const reiniciarPerfil = useCallback(() => {
    setPerfilGuardado({});
    guardarPerfil({});
  }, []);
  const perfil = useMemo(() => ({ ...perfilGuardado, agua, prioridad }), [perfilGuardado, agua, prioridad]);

  // POST /api/recomendar for the current plot and answers. If it fails the error is kept and
  // the screens say so and fall back to the design's example plan.
  // What is sown now (or was last) counts as the season before the plan: the engine does not repeat its family.
  const previo = [perfilGuardado.cultivo_actual, perfilGuardado.ultimo_cultivo].find((c) => c && !['ninguno', 'otro', 'no_se'].includes(c)) ?? null;
  // The rotation of today (oldest first) is the first of the 3 rotations the engine compares.
  const hoy = rotacionActualDe(perfilGuardado).join('-');
  const recomendar = useCallback(async () => {
    if (!point) return;
    const key = [point.lat, point.lon, agua, prioridad, previo, hoy].join(',');
    if (recKey.current === key) return;
    recKey.current = key;
    setRecomendacion(null);
    try {
      const data = await postRecomendar({
        lat: point.lat,
        lon: point.lon,
        agua,
        prioridad,
        cultivo_previo: previo,
        rotacion_actual: hoy ? hoy.split('-') : [],
      });
      setRecomendacion({ data });
      if (data.clima) setClima({ data: data.clima });
      if (data.suelo) setSuelo({ data: data.suelo });
    } catch (err) {
      recKey.current = null; // "Intentar de nuevo" can ask again
      setRecomendacion({ error: err.message, outsideRegion: err.outsideRegion === true });
    }
  }, [point, agua, prioridad, previo, hoy]);

  // Restore the saved plot's data on first load.
  useEffect(() => {
    if (saved.parcela) loadPointData(saved.parcela);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dibujar, corregir o borrar una parcela cambia el punto de consulta (el centro de todas).
  const setFarm = useCallback((next) => {
    setParcelas(next);
    if (next.length) {
      const center = farmPoint(next);
      selectPoint({ ...center, id: 'dibujada', boton: center.nombre });
    }
  }, [selectPoint]);
  const addParcela = (contorno) => setFarm([...parcelas, createParcel(nextParcelId(parcelas), contorno)]);
  const removeParcela = (id) => setFarm(parcelas.filter((p) => p.id !== id));
  const updateParcela = (id, contorno) => setFarm(parcelas.map((p) => (p.id === id ? createParcel(id, contorno, p.cultivo) : p)));
  const setCultivo = (id, cultivo) => setParcelas((list) => list.map((p) => (p.id === id ? { ...p, cultivo } : p)));
  // Un punto elegido sin dibujar (ejemplo, globo 3D) es otro lugar: se limpian las parcelas.
  const choosePoint = useCallback((selected) => { setParcelas([]); selectPoint(selected); }, [selectPoint]);
  // Parcela de prueba (config/parcelasPrueba.js): la dibuja y llena el perfil, como si el agricultor lo hubiera hecho.
  const cargarPrueba = useCallback(({ contorno, cultivo, perfil: datos }) => {
    const p = createParcel(1, contorno, cultivo);
    reiniciarPerfil();
    setFarm([p]);
    for (const [campo, valor] of Object.entries({ ...datos, hectareas: p.hectareas })) setPerfilCampo(campo, valor);
  }, [reiniciarPerfil, setFarm, setPerfilCampo]);
  // Un solo año para el mapa y la vista 3D.
  const year = useYearPlayer(clima?.data ?? null);

  return {
    perfil, setPerfilCampo, reiniciarPerfil, point, agua, prioridad, loading, clima, suelo, recomendacion, selectPoint, ensurePoint, setAgua, setPrioridad, recomendar,
    parcelas, setParcelas, addParcela, updateParcela, removeParcela, setCultivo, choosePoint, year, pronostico, cargarPrueba,
  };
}
