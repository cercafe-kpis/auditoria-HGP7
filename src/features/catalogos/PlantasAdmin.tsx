import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useCatalogosOffline } from './useCatalogosOffline';
import { useAuthToken } from '../../auth/useAuthToken';
import { crearPlanta } from '../../graph/lists';
import { db } from '../../offline/db';

const plantaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  codigo: z.string().min(1, 'El código es obligatorio'),
  ciudad: z.string().min(1, 'La ciudad es obligatoria'),
});
type PlantaForm = z.infer<typeof plantaSchema>;

/**
 * Pantalla de administración de Plantas — patrón de referencia para las
 * demás pantallas de catálogo (Metodologías, Operarios, Usuarios), que se
 * construyen replicando esta misma estructura: tabla + formulario +
 * llamada a Graph + refresco del caché local.
 */
export function PlantasAdmin() {
  const { plantas } = useCatalogosOffline();
  const { getAccessToken } = useAuthToken();
  const [guardando, setGuardando] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlantaForm>({ resolver: zodResolver(plantaSchema) });

  async function onSubmit(values: PlantaForm) {
    setGuardando(true);
    try {
      const token = await getAccessToken();
      const nueva = await crearPlanta(token, { ...values, activa: true });
      await db.plantas.put(nueva);
      reset();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Plantas</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div>
          <input {...register('nombre')} placeholder="Nombre" className="w-full h-11 rounded-lg border border-slate-300 px-3" />
          {errors.nombre && <p className="text-xs text-rose-600 mt-1">{errors.nombre.message}</p>}
        </div>
        <div>
          <input {...register('codigo')} placeholder="Código" className="w-full h-11 rounded-lg border border-slate-300 px-3" />
          {errors.codigo && <p className="text-xs text-rose-600 mt-1">{errors.codigo.message}</p>}
        </div>
        <div>
          <input {...register('ciudad')} placeholder="Ciudad" className="w-full h-11 rounded-lg border border-slate-300 px-3" />
          {errors.ciudad && <p className="text-xs text-rose-600 mt-1">{errors.ciudad.message}</p>}
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="sm:col-span-3 h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Agregar planta'}
        </button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2">Nombre</th>
            <th>Código</th>
            <th>Ciudad</th>
          </tr>
        </thead>
        <tbody>
          {plantas.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-2">{p.nombre}</td>
              <td>{p.codigo}</td>
              <td>{p.ciudad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
