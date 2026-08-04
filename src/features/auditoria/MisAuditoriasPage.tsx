import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../offline/db';
import { AuditoriaWizard } from './AuditoriaWizard';
import { PendingSyncBadge } from '../../components/PendingSyncBadge';

/** Pantalla principal del rol Auditor: registrar una nueva auditoría y
 * ver el estado de las que ha capturado (incluidas las pendientes por
 * sincronizar, que solo existen en su propio dispositivo). */
export function MisAuditoriasPage() {
  const [creando, setCreando] = useState(false);
  const pendientesLocales = useLiveQuery(() => db.auditoriasPendientes.toArray(), [], []);

  if (creando) {
    return <AuditoriaWizard onGuardada={() => setCreando(false)} />;
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Mis auditorías</h1>
      <button
        onClick={() => setCreando(true)}
        className="w-full h-14 rounded-xl bg-blue-600 text-white text-lg font-semibold mb-6"
      >
        + Nueva auditoría
      </button>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">EN ESTE DISPOSITIVO</h2>
      <div className="space-y-2">
        {(pendientesLocales ?? []).map((a) => (
          <div key={a.idCliente} className="rounded-lg border border-slate-200 p-3 text-sm flex justify-between">
            <div>
              <p className="font-medium text-slate-800">Tiquete {a.numeroTiquete}</p>
              <p className="text-slate-500">{a.fechaAuditoria}</p>
            </div>
            <span
              className={
                a.estado === 'error-sync'
                  ? 'text-rose-600 self-center text-xs font-semibold'
                  : 'text-amber-600 self-center text-xs font-semibold'
              }
            >
              {a.estado === 'error-sync' ? 'Reintentando…' : 'Pendiente'}
            </span>
          </div>
        ))}
        {(pendientesLocales ?? []).length === 0 && (
          <p className="text-slate-400 text-sm">No hay auditorías pendientes en este dispositivo.</p>
        )}
      </div>

      <PendingSyncBadge />
    </div>
  );
}
