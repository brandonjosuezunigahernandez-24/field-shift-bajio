import { PRIORITY_OPTIONS, WATER_OPTIONS } from '../../config/labels.js';

function RadioGroup({ legend, name, options, value, onChange }) {
  return (
    <fieldset className="opciones">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.id} className={`opcion${value === option.id ? ' seleccionada' : ''}`}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// Props: agua, prioridad, onAguaChange, onPrioridadChange, onSubmit, disabled (no point yet or loading).
export default function FormularioParcela({ agua, prioridad, onAguaChange, onPrioridadChange, onSubmit, disabled }) {
  function handleSubmit(event) {
    event.preventDefault();
    if (!disabled) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="formulario">
      <RadioGroup
        legend="¿Tu parcela es de temporal o de riego?"
        name="agua"
        options={WATER_OPTIONS}
        value={agua}
        onChange={onAguaChange}
      />
      <RadioGroup
        legend="¿Qué te importa más?"
        name="prioridad"
        options={PRIORITY_OPTIONS}
        value={prioridad}
        onChange={onPrioridadChange}
      />
      <button type="submit" disabled={disabled}>
        Recomendar rotación
      </button>
      {disabled && <p className="hint">Primero marca tu parcela en el mapa.</p>}
    </form>
  );
}
