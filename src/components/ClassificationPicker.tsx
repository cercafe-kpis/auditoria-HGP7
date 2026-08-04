import clsx from 'clsx';
import type { Clasificacion } from '../types/entities';

const OPCIONES: { valor: Clasificacion; color: string }[] = [
  { valor: 'Bueno', color: 'bg-emerald-600 border-emerald-600' },
  { valor: 'Regular', color: 'bg-amber-500 border-amber-500' },
  { valor: 'Malo', color: 'bg-orange-600 border-orange-600' },
  { valor: 'Insuficiente', color: 'bg-rose-700 border-rose-700' },
];

export function ClassificationPicker({
  value,
  onChange,
}: {
  value: Clasificacion | null;
  onChange: (value: Clasificacion) => void;
}) {
  return (
    <div className="mb-6">
      <p className="text-base font-medium text-slate-700 mb-2">Clasificación</p>
      <div className="grid grid-cols-2 gap-3">
        {OPCIONES.map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => onChange(op.valor)}
            className={clsx(
              'h-16 rounded-xl text-base font-semibold border-2 transition-colors',
              value === op.valor ? `${op.color} text-white` : 'bg-white border-slate-300 text-slate-700',
            )}
          >
            {op.valor}
          </button>
        ))}
      </div>
    </div>
  );
}
