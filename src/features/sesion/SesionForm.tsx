import { useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useCatalogosOffline } from '../catalogos/useCatalogosOffline';
import { useCurrentUser } from '../auth/useCurrentUser';
import { crearSesionActiva } from '../../offline/sesion';

/**
 * "Pantalla inicial" del día: Fecha, Planta, Metodología, Auditor,
 * Operario. Se llena UNA sola vez — de ahí en adelante tanto la
 * Inclinación de la herramienta como la Clasificación/medición la
 * reutilizan sin volver a pedirla (ver SesionPage). Solo se muestra
 * cuando no hay una sesión activa guardada en este dispositivo.
 */
export function SesionForm({ onGuardada }: { onGuardada: () => void }) {
  const { accounts } = useMsal();
  const { usuario } = useCurrentUser();
  const { plantas, metodologias, operarios } = useCatalogosOffline();

  const [fechaAuditoria, setFechaAuditoria] = useState(() => new Date().toISOString().slice(0, 10));
  const [plantaId, setPlantaId] = useState('');
  const [metodologiaId, setMetodologiaId] = useState('');
  const [operarioId, setOperarioId] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const esAdministrador = usuario?.rol === 'Administrador';
  const auditorCorreo = accounts[0]?.username ?? '';

  const operariosDePlanta = useMemo(
    () => operarios.filter((o) => o.plantaId === plantaId),
    [operarios, plantaId],
  );

  async function continuar() {
    const faltan: string[] = [];
    if (!fechaAuditoria) faltan.push('Fecha');
    if (!plantaId) faltan.push('Planta');
    if (!metodologiaId) faltan.push('Metodología');
    if (!operarioId) faltan.push('Operario');
    setErrores(faltan);
    if (faltan.length > 0) return;

    setGuardando(true);
    try {
      await crearSesionActiva({ fechaAuditoria, plantaId, metodologiaId, operarioId, auditorCorreo });
      onGuardada();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Información general</h2>
      <p className="text-sm text-slate-500 mb-4">
        Estos datos no cambian durante el día — los diligencias una sola vez y luego eliges si vas a registrar
        la inclinación de la herramienta o la clasificación/medición de canales.
      </p>

      {errores.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <ul className="list-disc list-inside">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
          <input
            type="date"
            value={fechaAuditoria}
            onChange={(e) => setFechaAuditoria(e.target.value)}
            readOnly={!esAdministrador}
            className="w-full h-12 rounded-lg border border-slate-300 px-3 disabled:bg-slate-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Planta</label>
          <select
            value={plantaId}
            onChange={(e) => {
              setPlantaId(e.target.value);
              setOperarioId('');
            }}
            className="w-full h-12 rounded-lg border border-slate-300 px-3"
          >
            <option value="">Selecciona…</option>
            {plantas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Metodología</label>
          <select
            value={metodologiaId}
            onChange={(e) => setMetodologiaId(e.target.value)}
            className="w-full h-12 rounded-lg border border-slate-300 px-3"
          >
            <option value="">Selecciona…</option>
            {metodologias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} ({m.version})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Auditor</label>
          <input
            type="text"
            value={usuario?.nombre ?? auditorCorreo}
            readOnly
            className="w-full h-12 rounded-lg border border-slate-300 px-3 bg-slate-100 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Operario</label>
          <select
            value={operarioId}
            onChange={(e) => setOperarioId(e.target.value)}
            disabled={!plantaId}
            className="w-full h-12 rounded-lg border border-slate-300 px-3 disabled:bg-slate-100"
          >
            <option value="">{plantaId ? 'Selecciona…' : 'Primero elige una planta'}</option>
            {operariosDePlanta.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4">
        <button
          onClick={() => void continuar()}
          disabled={guardando}
          className="w-full h-14 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
