import clsx from 'clsx';

/** Control de dos botones grandes para campos Sí/No — ver documento de
 * arquitectura, sección 7.2: nunca checkboxes pequeños, y sin valor por
 * defecto seleccionado para forzar una decisión consciente del auditor. */
export function SegmentedYesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="mb-6">
      <p className="text-base font-medium text-slate-700 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={clsx(
            'h-14 rounded-xl text-lg font-semibold border-2 transition-colors',
            value === true
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-white border-slate-300 text-slate-700',
          )}
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={clsx(
            'h-14 rounded-xl text-lg font-semibold border-2 transition-colors',
            value === false
              ? 'bg-rose-600 border-rose-600 text-white'
              : 'bg-white border-slate-300 text-slate-700',
          )}
        >
          No
        </button>
      </div>
    </div>
  );
}
