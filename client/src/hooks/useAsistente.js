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

  async function preguntar(pregunta, extra = perfil) {
    if (!point) {
      setEstado({ fase: 'error', mensaje: 'Primero elige tu parcela en el mapa y vuelvo a ayudarte.' });
      return;
    }
    ultima.current = pregunta;
    setTexto(pregunta);
    setEstado({ fase: 'pensando' }); // esto borra la respuesta anterior
    const t0 = performance.now();
    try {
      const r = await postAsistente({ lat: point.lat, lon: point.lon, pregunta, perfil: { ...perfil, ...extra }, parcelas: parcelas.map((p) => ({ id: p.id, hectareas: p.hectareas })) });
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

  function reiniciar() {
    reiniciarPerfil();
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
  return { pregunta: estado.pregunta, seg: estado.seg, texto, setTexto, estado, grabando, preguntar, contestar, reiniciar, microfono, r, pendiente: r?.preguntar ?? r?.afinar?.[0] ?? null };
}
