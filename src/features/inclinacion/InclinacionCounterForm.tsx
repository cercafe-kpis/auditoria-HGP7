import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../offline/db';
import type { InclinacionLocal, SesionActivaLocal } from '../../types/entities';

/**
 * Contador de inclinación de la herramienta: NO es un formulario con
 * campos — es un botón grande Sí/No por cada canal. El número de canal
 * avanza solo (empieza en 1) y cada toque guarda de inmediato, sumando al
 * agregado de la sesión (mismo `sesion.inclinacionId` en cada toque, ver
 * types/entities.ts). Al final de la jornada lo que importa es el total:
 * cuántas canales se revisaron y cuántas tenían la inclinación correcta.
 */
export function InclinacionCounterForm({
  sesion,
  onVolver,
}: {
  sesion: SesionActivaLocal;
  onVolver: () => void;
}) {
  const registro = useLiveQuery(
    () => db.inclinacionesPendientes.get(sesion.inclinacionId),
    [sesion.inclinacionId],
  );
  // Solo se recuerda el último toque (para poder deshacerlo) — no un
  // historial completo; si el auditor sale y vuelve a entrar, ya no se
  // puede deshacer el que quedó guardado en una visita anterior.
  const [ultimaFueCorrecta, setUltimaFueCorrecta] = useState<boolean | null>(null);

  const revisadas = registro?.canalesRevisadas ?? 0;
  const correctas = registro?.canalesCorrectas ?? 0;
  const numeroCanalActual = revisadas + 1;

  async function registrar(correcta: boolean) {
    const base: InclinacionLocal = registro ?? {
      idCliente: sesion.inclinacionId,
      fechaAuditoria: sesion.fechaAuditoria,
      plantaId: sesion.plantaId,
      metodologiaId: sesion.metodologiaId,
      auditorCorreo: sesion.auditorCorreo,
      operarioId: sesion.operarioId,
      canalesRevisadas: 0,
      canalesCorrectas: 0,
      capturadaEn: new Date().toISOString(),
      estado: 'local-pendiente',
      intentosSync: 0,
    };
    const actualizado: InclinacionLocal = {
      ...base,
      canalesRevisadas: base.canalesRevisadas + 1,
      canalesCorrectas: base.canalesCorrectas + (correcta ? 1 : 0),
      // Cada toque vuelve a marcarlo pendiente para que la cola de
      // sincronización reenvíe el total actualizado (ver syncService.ts).
      estado: 'local-pendiente',
    };
    await db.inclinacionesPendientes.put(actualizado);
    setUltimaFueCorrecta(correcta);
  }

  async function deshacerUltimo() {
    if (!registro || registro.canalesRevisadas === 0 || ultimaFueCorrecta === null) return;
    const actualizado: InclinacionLocal = {
      ...registro,
      canalesRevisadas: registro.canalesRevisadas - 1,
      canalesCorrectas: registro.canalesCorrectas - (ultimaFueCorrecta ? 1 : 0),
      estado: 'local-pendiente',
    };
    await db.inclinacionesPendientes.put(actualizado);
    setUltimaFueCorrecta(null);
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <button type="button" onClick={onVolver} className="text-sm text-blue-600 font-semibold mb-4">
        ← Volver
      </button>
      <h2 className="text-lg font-bold text-slate-800 mb-1">Inclinación de la herramienta</h2>
      <p className="text-sm text-slate-500 mb-8">
        Marca si la inclinación fue correcta en cada canal que revises. El número avanza solo.
      </p>

      <div className="text-center mb-8">
        <p className="text-sm text-slate-500">Canal</p>
        <p className="text-7xl font-bold text-slate-800">{numeroCanalActual}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          type="button"
          onClick={() => void registrar(true)}
          className="h-24 rounded-xl bg-emerald-600 text-white text-xl font-bold active:scale-[0.98] transition-transform"
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => void registrar(false)}
          className="h-24 rounded-xl bg-rose-600 text-white text-xl font-bold active:scale-[0.98] transition-transform"
        >
          No
        </button>
      </div>

      {ultimaFueCorrecta !== null && (
        <button
          type="button"
          onClick={() => void deshacerUltimo()}
          className="w-full text-sm text-slate-500 underline mb-6"
        >
          Deshacer el registro del canal {revisadas}
        </button>
      )}

      <div className="rounded-xl border border-slate-200 p-4 text-center">
        <p className="text-2xl font-bold text-slate-800">
          {correctas}/{revisadas}
        </p>
        <p className="text-xs text-slate-500 mt-1">canales con inclinación correcta en esta sesión</p>
      </div>
    </div>
  );
}
