import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../offline/db';
import { AuditoriaWizard } from './AuditoriaWizard';
import type { SesionActivaLocal } from '../../types/entities';

/**
 * "Clasificación / medición": el segundo botón de la sesión. Reutiliza la
 * Fecha/Planta/Metodología/Auditor/Operario de la sesión activa — el
 * wizard (AuditoriaWizard) ya no pide esos campos, arranca directo en
 * Tiquete. Reemplaza a la antigua MisAuditoriasPage (misma lista de
 * pendientes en este dispositivo, solo que ahora anidada bajo la sesión).
 */
export function ClasificacionMedicionView({
  sesion,
  onVolver,
}: {
  sesion: SesionActivaLocal;
  onVolver: () => void;
}) {
  const [creando, setCreando] = useState(false);
  const pendientesLocales = useLiveQuery(() => db.auditoriasPendientes.toArray(), [], []);

  if (creando) {
    return <AuditoriaWizard sesion={sesion} onGuardada={() => setCreando(false)} />;
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <button type="button" onClick={onVolver} className="text-sm text-blue-600 font-semibold mb-4">
        ← Volver
      </button>
      <h1 className="text-xl font-bold text-slate-800 mb-4">Clasificación / medición</h1>
      <button
        onClick={() => setCreando(true)}
        className="w-full h-14 rounded-xl bg-blue-600 text-white text-lg font-semibold mb-6"
      >
        + Nueva auditoría de canal
      </button>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">EN ESTE DISPOSITIVO</h2>
      <div className="space-y-2">
        {(pendientesLocales ?? []).map((a) => (
          <div key={a.idCliente} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex justify-between">
              <div>
                <p className="font-medium text-slate-800">Tiquete {a.numeroTiquete}</p>
                <p className="text-slate-500">{a.fechaAuditoria}</p>
              </div>
              {/* Antes 'local-pendiente' y 'sincronizando' se veían idénticos
                  ("Pendiente" en ambos casos), lo que hacía imposible saber
                  desde la pantalla si un registro seguía en cola, estaba
                  subiéndose en ese momento, o ya había fallado y estaba
                  esperando su próximo reintento — un dato clave para
                  diagnosticar problemas de sincronización a distancia. */}
              <span
                className={
                  a.estado === 'error-sync'
                    ? 'text-rose-600 self-center text-xs font-semibold whitespace-nowrap'
                    : a.estado === 'sincronizando'
                      ? 'text-blue-600 self-center text-xs font-semibold whitespace-nowrap'
                      : 'text-amber-600 self-center text-xs font-semibold whitespace-nowrap'
                }
              >
                {a.estado === 'error-sync'
                  ? 'Reintentando…'
                  : a.estado === 'sincronizando'
                    ? 'Sincronizando…'
                    : 'Pendiente'}
              </span>
            </div>
            {a.estado === 'error-sync' && a.ultimoError && (
              <p className="mt-1 text-xs text-rose-500">{a.ultimoError}</p>
            )}
          </div>
        ))}
        {(pendientesLocales ?? []).length === 0 && (
          <p className="text-slate-400 text-sm">No hay auditorías pendientes en este dispositivo.</p>
        )}
      </div>
    </div>
  );
}
