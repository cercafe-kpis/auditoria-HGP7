import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../offline/db';
import { limpiarSesionActiva } from '../../offline/sesion';
import { useCatalogosOffline } from '../catalogos/useCatalogosOffline';
import { SesionForm } from './SesionForm';
import { InclinacionCounterForm } from '../inclinacion/InclinacionCounterForm';
import { ClasificacionMedicionView } from '../auditoria/ClasificacionMedicionView';
import { PendingSyncBadge } from '../../components/PendingSyncBadge';

type Vista = 'menu' | 'inclinacion' | 'clasificacion';

/**
 * Pantalla "Auditorías": primero pide la sesión del día (una sola vez —
 * ver SesionForm) y, una vez guardada, muestra dos botones que reutilizan
 * esa misma sesión sin volver a pedirla: "Inclinación de la herramienta"
 * (InclinacionCounterForm) y "Clasificación / medición"
 * (ClasificacionMedicionView, que contiene el wizard de auditoría de
 * canal). "Cambiar sesión" borra la sesión activa para empezar de nuevo
 * (por ejemplo, al cambiar de planta o de día).
 */
export function SesionPage() {
  const sesion = useLiveQuery(() => db.sesionActual.get('actual'), []);
  const { plantas, metodologias, operarios } = useCatalogosOffline();
  const [vista, setVista] = useState<Vista>('menu');

  if (!sesion) {
    return <SesionForm onGuardada={() => setVista('menu')} />;
  }

  if (vista === 'inclinacion') {
    return <InclinacionCounterForm sesion={sesion} onVolver={() => setVista('menu')} />;
  }

  if (vista === 'clasificacion') {
    return <ClasificacionMedicionView sesion={sesion} onVolver={() => setVista('menu')} />;
  }

  async function cambiarSesion() {
    await limpiarSesionActiva();
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Auditoría de hoy</h1>

      <div className="rounded-xl border border-slate-200 p-4 mb-6 text-sm space-y-1.5">
        <FilaResumen etiqueta="Fecha" valor={sesion.fechaAuditoria} />
        <FilaResumen etiqueta="Planta" valor={plantas.find((p) => p.id === sesion.plantaId)?.nombre ?? '—'} />
        <FilaResumen
          etiqueta="Metodología"
          valor={metodologias.find((m) => m.id === sesion.metodologiaId)?.nombre ?? '—'}
        />
        <FilaResumen etiqueta="Operario" valor={operarios.find((o) => o.id === sesion.operarioId)?.nombre ?? '—'} />
        <button
          type="button"
          onClick={() => void cambiarSesion()}
          className="text-blue-600 text-xs font-semibold pt-2"
        >
          Cambiar sesión
        </button>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setVista('inclinacion')}
          className="w-full h-20 rounded-xl bg-blue-600 text-white text-lg font-semibold"
        >
          Inclinación de la herramienta
        </button>
        <button
          onClick={() => setVista('clasificacion')}
          className="w-full h-20 rounded-xl bg-emerald-600 text-white text-lg font-semibold"
        >
          Clasificación / medición
        </button>
      </div>

      <PendingSyncBadge />
    </div>
  );
}

function FilaResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{etiqueta}</span>
      <span className="font-medium text-slate-800">{valor}</span>
    </div>
  );
}
