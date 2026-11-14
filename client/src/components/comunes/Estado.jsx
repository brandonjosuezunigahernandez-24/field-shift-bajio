// Loading, error and empty states, so every screen says the same thing the same way.
export function Cargando({ mensaje = 'Consultando los datos de tu parcela…' }) {
  return (
    <p className="status" role="status" aria-live="polite">
      {mensaje}
    </p>
  );
}

export function ErrorMensaje({ mensaje }) {
  if (!mensaje) return null;
  return (
    <p className="error" role="alert">
      {mensaje}
    </p>
  );
}

export function Vacio({ children }) {
  return <p className="hint">{children}</p>;
}
