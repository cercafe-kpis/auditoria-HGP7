import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRef, useState } from 'react';
import { useCatalogosOffline } from './useCatalogosOffline';
import { useAuthToken } from '../../auth/useAuthToken';
import { crearOperario, editarOperario } from '../../graph/lists';
import { db } from '../../offline/db';
import type { Operario } from '../../types/entities';

const operarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  plantaId: z.string().min(1, 'Selecciona una planta'),
  cargo: z.string().min(1, 'El cargo es obligatorio'),
  activo: z.boolean(),
});
type OperarioForm = z.infer<typeof operarioSchema>;

const vacio: OperarioForm = { nombre: '', documento: '', plantaId: '', cargo: '', activo: true };

/**
 * Pantalla de administración de Operarios — crear + editar. Mismo patrón
 * de aviso "Editando: X" + desplazamiento automático que MetodologiasAdmin
 * (ver ese archivo para el comentario de referencia).
 */
export function OperariosAdmin() {
  const { operarios, plantas } = useCatalogosOffline();
  const { getAccessToken } = useAuthToken();
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OperarioForm>({ resolver: zodResolver(operarioSchema), defaultValues: vacio });

  function editar(o: Operario) {
    setEditandoId(o.id);
    setEditandoNombre(o.nombre);
    setError(null);
    reset({ nombre: o.nombre, documento: o.documento, plantaId: o.plantaId, cargo: o.cargo, activo: o.activo });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEditandoNombre(null);
    setError(null);
    reset(vacio);
  }

  async function onSubmit(values: OperarioForm) {
    setGuardando(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (editandoId) {
        await editarOperario(token, editandoId, values);
        await db.operarios.update(editandoId, values);
        setEditandoId(null);
        setEditandoNombre(null);
      } else {
        const nuevo = await crearOperario(token, values);
        await db.operarios.put(nuevo);
      }
      reset(vacio);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  function nombrePlanta(plantaId: string) {
    return plantas.find((p) => p.id === plantaId)?.nombre ?? '—';
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Operarios</h1>

      {editandoNombre && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Editando: <span className="font-semibold">{editandoNombre}</span> — modifica los campos y presiona
          "Guardar cambios".
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 scroll-mt-4"
      >
        <div>
          <input
            {...register('nombre')}
            placeholder="Nombre"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          />
          {errors.nombre && <p className="text-xs text-rose-600 mt-1">{errors.nombre.message}</p>}
        </div>
        <div>
          <input
            {...register('documento')}
            placeholder="Documento"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          />
          {errors.documento && <p className="text-xs text-rose-600 mt-1">{errors.documento.message}</p>}
        </div>
        <div>
          <select {...register('plantaId')} className="w-full h-11 rounded-lg border border-slate-300 px-3">
            <option value="">Selecciona una planta…</option>
            {plantas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          {errors.plantaId && <p className="text-xs text-rose-600 mt-1">{errors.plantaId.message}</p>}
        </div>
        <div>
          <input
            {...register('cargo')}
            placeholder="Cargo"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          />
          {errors.cargo && <p className="text-xs text-rose-600 mt-1">{errors.cargo.message}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" {...register('activo')} />
          Activo
        </label>

        {error && <p className="sm:col-span-2 text-sm text-rose-600">{error}</p>}

        <div className="sm:col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar operario'}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="h-11 px-4 rounded-lg border border-slate-300 text-slate-600 font-semibold"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2">Nombre</th>
            <th>Documento</th>
            <th>Planta</th>
            <th>Cargo</th>
            <th>Activo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {operarios.map((o) => (
            <tr key={o.id} className="border-b border-slate-100">
              <td className="py-2">{o.nombre}</td>
              <td>{o.documento}</td>
              <td>{nombrePlanta(o.plantaId)}</td>
              <td>{o.cargo}</td>
              <td>{o.activo ? 'Sí' : 'No'}</td>
              <td className="text-right">
                <button type="button" onClick={() => editar(o)} className="text-blue-600 text-xs font-semibold">
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
