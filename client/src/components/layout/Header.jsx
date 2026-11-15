import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';

const STEPS = [
  { to: '/', label: '1. Parcela' },
  { to: '/rotacion', label: '2. Simulador 3D' },
  { to: '/analisis', label: '3. Análisis IA' },
  { to: '/cultivo', label: '4. Probar cultivo' },
];

// Sticky header of every screen (design section 5.1). `sub` is the mono subtitle under the brand;
// `pills` is the JSX of the status pills on the right of the brand. NavLink sets
// aria-current="page" on the active step, which is what fieldshift.css styles.
export default function Header({ sub, pills }) {
  // The header is sticky and its height changes with the width: the pages place the map and the assistant
  // right under it with the CSS variable --fs-head.
  const ref = useRef(null);
  useEffect(() => {
    const header = ref.current;
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => document.documentElement.style.setProperty('--fs-head', `${header.offsetHeight}px`);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="fs-header" ref={ref}>
      <div className="fs-header-in">
        <Link className="fs-brand" to="/">
          <img className="fs-logo" src="/logo-icono.png" alt="" width="48" height="48" />
          <span>
            <span className="fs-brand-name d-block">
              Field Shift <span>Bajío</span>
            </span>
            <span className="fs-brand-sub d-block">{sub}</span>
          </span>
        </Link>
        <div className="fs-pills d-none d-sm-flex">{pills}</div>
        <nav className="fs-steps" aria-label="Pasos">
          {STEPS.map((step) => (
            <NavLink key={step.to} to={step.to} end={step.to === '/'} className={() => ''}>
              {step.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
