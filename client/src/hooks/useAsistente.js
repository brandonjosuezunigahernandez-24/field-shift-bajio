import { useRef, useState } from 'react';
import { postAsistente, postVoz } from '../api/client.js';
import { useParcelaContext } from '../context/ParcelaContext.jsx';

// Lógica del asistente compartida por el botón flotante y la pantalla Análisis: una pregunta a la vez
// (cada una borra la respuesta anterior), micrófono y respuestas con botones. Lo que el agricultor contesta
// se guarda en el perfil compartido (useParcela).
export function useAsistente() {
  const { point, parcelas, perfil, setPerfilCampo, reiniciarPerfil } = useParcelaContext();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState({ fase: 'inicio' }); // inicio | pensando | listo | error
  const [grabando, setGrabando] = useState(false);
  const ultima = useRef('');
  const rec = useRef(null);
  // Las 2 últimas preguntas con su respuesta: así «en 4 hectáreas» o «¿y por qué no el maíz?» siguen la plática.
  // Se borran al cambiar de parcela (otra parcela es otra plática).
  const historial = useRef({ donde: '', turnos: [] });

  async function preguntar(pregunta, extra = perfil) {
    if (!point) {
      setEstado({ fase: 'error', mensaje: 'Primero elige tu parcela en el mapa y vuelvo a ayudarte.' });
      return;
    }
    ultima.current = pregunta;
    setTexto(pregunta);
    setEstado({ fase: 'pensando', pregunta }); // esto borra la respuesta anterior
    const t0 = performance.now();
    const donde = `${point.lat},${point.lon}`;
    if (historial.current.donde !== donde) historial.current = { donde, turnos: [] };
    // Al contestar con botones se repite la misma pregunta: no va dos veces en la plática.
    const turnos = historial.current.turnos.filter((t) => t.pregunta !== pregunta);
    try {
      const r = await postAsistente({ lat: point.lat, lon: point.lon, pregunta, perfil: { ...perfil, ...extra }, parcelas: parcelas.map((p) => ({ id: p.id, hectareas: p.hectareas })), historial: turnos });
      if (typeof r?.respuesta === 'string') historial.current.turnos = [...turnos, { pregunta, respuesta: r.respuesta.slice(0, 600) }].slice(-2);
      setEstado({ fase: 'listo', r, pregunta, seg: (performance.now() - t0) / 1000 }); // seg: tiempo real medido aquí
    } catch (e) {
      setEstado({ fase: 'error', mensaje: e.message });
    }
  }

  // El agricultor contestó una pregunta de botones ("¿riego o lluvia?"): se guarda y se repite la pregunta.
  function contestar(campo, valor) {
    setPerfilCampo(campo, valor);
    preguntar(ultima.current, { ...perfil, [campo]: valor });
  }

  // Tras un error: repite la última pregunta (si hubo).
  const reintentar = () => ultima.current && preguntar(ultima.current);

  function reiniciar() {
    reiniciarPerfil();
    historial.current = { donde: '', turnos: [] };
    setTexto('');
    setEstado({ fase: 'inicio' });
  }

  // Micrófono: graba, convierte a audio de 16 kHz y lo manda a /api/voz. El texto aparece en la caja antes de enviarse.
  async function microfono() {
    if (grabando) {
      rec.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        setEstado({ fase: 'pensando', mensaje: 'Entendiendo lo que dijiste…' });
        try {
          const ctx = new AudioContext({ sampleRate: 16000 });
          const audio = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
          const { texto: dicho } = await postVoz(audio.getChannelData(0));
          setTexto(dicho);
          setEstado({ fase: 'inicio', mensaje: 'Esto entendí. Si está bien, toca «Preguntar».' });
        } catch (e) {
          setEstado({ fase: 'error', mensaje: e.message || 'No pude entender el audio. Intenta de nuevo o escribe tu pregunta.' });
        }
      };
      rec.current = mr;
      mr.start();
      setGrabando(true);
    } catch {
      setEstado({ fase: 'error', mensaje: 'No pude usar el micrófono. Revisa el permiso del navegador o escribe tu pregunta.' });
    }
  }

  const r = estado.fase === 'listo' ? estado.r : null;
  return { pregunta: estado.pregunta, seg: estado.seg, texto, setTexto, estado, grabando, preguntar, contestar, reiniciar, reintentar: ultima.current ? reintentar : null, microfono, r, pendiente: r?.preguntar ?? r?.afinar?.[0] ?? null };
}
