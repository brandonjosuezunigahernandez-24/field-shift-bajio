import { useEffect, useRef } from 'react';

// The panel next to the map in «1. Parcela» and «2. Simulador 3D»: one step at a time.
// Three fixed zones, so nothing jumps between steps: the head (place, «Paso 3 de 7», title, progress),
// the body (scrolls inside when it is long) and the buttons, always in the same spot:
// Anterior on the left, Siguiente on the right. On the last step `final` takes Siguiente's place.
//   lugar, accion   optional line above the title (where the plot is, and a small button)
//   paso, total     0-based step and how many there are; without `total` there are no steps nor buttons
//   bloqueado       the buttons stay in place but cannot be used (e.g. while a plot is being drawn)
export default function PanelPasos({ lugar, accion, paso = 0, total, titulo, children, onAnterior, onSiguiente, final, bloqueado = false }) {
  const cuerpoRef = useRef(null);
  const tituloRef = useRef(null);
  const movido = useRef(false);

  // A new step starts at its top; after Anterior/Siguiente the title takes the focus so screen readers announce it.
  useEffect(() => {
    if (cuerpoRef.current) cuerpoRef.current.scrollTop = 0;
    if (!movido.current) return;
    movido.current = false;
    tituloRef.current?.focus({ preventScroll: true });
  }, [paso, titulo]);

  const ir = (fn) => () => {
    movido.current = true;
    fn();
  };
  const conPasos = total > 0;

  return (
    <section className="fs-card fs-tarjeta fs-panel" aria-labelledby="t-tarjeta">
      <div className="fs-panel-head">
        {(lugar || accion) && (
          <div className="fs-panel-lugar">
            <span>{lugar}</span>
            {accion}
          </div>
        )}
        {conPasos && (
          <span className="fs-eyebrow">
            Paso {paso + 1} de {total}
          </span>
        )}
        <h2 className="fs-card-title xs" id="t-tarjeta" tabIndex={-1} ref={tituloRef}>
          {titulo}
        </h2>
        {conPasos && (
          <span className="fs-tarjeta-pasos" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i <= paso ? 'is-on' : undefined} />
            ))}
          </span>
        )}
      </div>

      <div className="fs-panel-cuerpo" ref={cuerpoRef}>
        {children}
      </div>

      {conPasos && (
        <div className="fs-panel-nav">
          {/* On the first step Anterior is hidden but keeps its place, so Siguiente never moves. */}
          <button type="button" className="fs-btn fs-btn-sec" onClick={ir(onAnterior)} disabled={bloqueado || paso === 0} style={paso === 0 ? { visibility: 'hidden' } : undefined}>
            <i className="bi bi-arrow-left" aria-hidden="true"></i>Anterior
          </button>
          {paso < total - 1 ? (
            <button type="button" className="fs-btn fs-btn-primary" onClick={ir(onSiguiente)} disabled={bloqueado}>
              Siguiente<i className="bi bi-arrow-right" aria-hidden="true"></i>
            </button>
          ) : (
            final ?? <span />
          )}
        </div>
      )}
    </section>
  );
}
