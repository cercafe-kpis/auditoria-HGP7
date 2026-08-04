import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRef, useState } from 'react';
import { useCatalogosOffline } from './useCatalogosOffline';
import { useAuthToken } from '../../auth/useAuthToken';
import { crearMetodologia, editarMetodologia } from '../../graph/lists';
import { db } from '../../offline/db';
import type { Metodologia } from '../../types/entities';

const metodologiaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  version: z.string().min(1, 'La versión es obligatoria'),
  descripcion: z.string(),
  activa: z.boolean(),
});
type MetodologiaForm = z.infer<typeof metodologiaSchema>;

const vacio: MetodologiaForm = { nombre: '', version: '', descripcion: '', activa: true };

/**
 * Pantalla de administración de Metodologías — crear + editar. Al hacer
 * clic en "Editar" se muestra un aviso claro ("Editando: X") arriba del
 * formulario y la página se desplaza hasta ahí, para que quede obvio que
 * el formulario se precargó con esos valores (en vez de que parezca que
 * el botón no hizo nada). Cualquier error de la llamada a Graph se
 * muestra en pantalla en vez de fallar en silencio.
 */
export function MetodologiasAdmin() {
  const { metodologias } = useCatalogosOffline();
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
  } = useForm<MetodologiaForm>({ resolver: zodResolver(metodologiaSchema), defaultValues: vacio });

  function editar(m: Metodologia) {
    setEditandoId(m.id);
    setEditandoNombre(m.nombre);
    setError(null);
    reset({ nombre: m.nombre, version: m.version, descripcion: m.descripcion, activa: m.activa });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEditandoNombre(null);
    setError(null);
    reset(vacio);
  }

  async function onSubmit(values: MetodologiaForm) {
    setGuardando(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (editandoId) {
        await editarMetodologia(token, editandoId, values);
        await db.metodologias.update(editandoId, values);
        setEditandoId(null);
        setEditandoNombre(null);
      } else {
        const nueva = await crearMetodologia(token, values);
        await db.metodologias.put(nueva);
      }
      reset(vacio);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Metodologías</h1>

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
            {...register('version')}
            placeholder="Versión"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          />
          {errors.version && <p className="text-xs text-rose-600 mt-1">{errors.version.message}</p>}
        </div>
        <div className="sm:col-span-2">
          <textarea
            {...register('descripcion')}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" {...register('activa')} />
          Activa
        </label>

        {error && <p className="sm:col-span-2 text-sm text-rose-600">{error}</p>}

        <div className="sm:col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar metodología'}
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
            <th>Versión</th>
            <th>Activa</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {metodologias.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="py-2">{m.nombre}</td>
              <td>{m.version}</td>
              <td>{m.activa ? 'Sí' : 'No'}</td>
              <td className="text-right">
                <button type="button" onClick={() => editar(m)} className="text-blue-600 text-xs font-semibold">
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
