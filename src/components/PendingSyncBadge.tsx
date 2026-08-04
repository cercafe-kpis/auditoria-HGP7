import clsx from 'clsx';
import { useSyncQueue } from '../offline/useSyncQueue';

/** Indicador siempre visible de estado de conexión y auditorías
 * pendientes por sincronizar, con acción manual de reintento. */
export function PendingSyncBadge() {
  const { online, pendientes, sincronizando, sincronizarAhora, limiteAdvertencia } = useSyncQueue();

  if (pendientes === 0 && online) return null;

  const cercaDelLimite = pendientes >= limiteAdvertencia;

  return (
    <div
      className={clsx(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2',
        cercaDelLimite ? 'bg-rose-600 text-white' : online ? 'bg-amber-500 text-white' : 'bg-slate-700 text-white',
      )}
    >
      <span>{online ? '🌐' : '📴'}</span>
      <span>
        {pendientes > 0
          ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de sincronizar`
          : 'Sin conexión'}
      </span>
      {online && pendientes > 0 && (
        <button
          onClick={() => void sincronizarAhora()}
          disabled={sincronizando}
          className="underline underline-offset-2"
        >
          {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      )}
      {cercaDelLimite && <span className="ml-1">— revisa tu conexión</span>}
    </div>
  );
}
