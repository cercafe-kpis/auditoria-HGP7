import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { useCatalogosOffline } from './useCatalogosOffline';
import { useAuthToken } from '../../auth/useAuthToken';
import { crearUsuario, getUsuarios } from '../../graph/lists';
import type { UsuarioApp } from '../../types/entities';

const usuarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  correo: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  rol: z.enum(['Administrador', 'Auditor', 'Consulta']),
});
type UsuarioForm = z.infer<typeof usuarioSchema>;

/**
 * Pantalla de administración de Usuarios (asignación de rol) — sigue el
 * mismo patrón que PlantasAdmin.tsx (tabla + formulario + llamada a Graph).
 * El correo debe coincidir EXACTAMENTE con la cuenta de Microsoft 365 de
 * la persona (su UPN): es la clave que useCurrentUser() usa para resolver
 * el rol al iniciar sesión. Si el correo no coincide, esa persona podrá
 * iniciar sesión con Microsoft pero la app no sabrá qué rol darle.
 */
export function UsuariosAdmin() {
  const { plantas } = useCatalogosOffline();
  const { getAccessToken } = useAuthToken();
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plantasSeleccionadas, setPlantasSeleccionadas] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UsuarioForm>({ resolver: zodResolver(usuarioSchema) });

  useEffect(() => {
    void cargarUsuarios();
  }, []);

  async function cargarUsuarios() {
    setCargando(true);
    try {
      const token = await getAccessToken();
      setUsuarios(await getUsuarios(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  async function onSubmit(values: UsuarioForm) {
    setGuardando(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const nuevo = await crearUsuario(token, {
        ...values,
        plantasAsignadas: plantasSeleccionadas,
        activo: true,
      });
      setUsuarios((actuales) => [...actuales, nuevo]);
      reset();
      setPlantasSeleccionadas([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  function togglePlanta(id: string) {
    setPlantasSeleccionadas((actuales) =>
      actuales.includes(id) ? actuales.filter((p) => p !== id) : [...actuales, id],
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Usuarios</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
            {...register('correo')}
            placeholder="Correo (igual a su cuenta de M365)"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          />
          {errors.correo && <p className="text-xs text-rose-600 mt-1">{errors.correo.message}</p>}
        </div>
        <div>
          <select
            {...register('rol')}
            defaultValue="Auditor"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          >
            <option value="Administrador">Administrador</option>
            <option value="Auditor">Auditor</option>
            <option value="Consulta">Consulta</option>
          </select>
          {errors.rol && <p className="text-xs text-rose-600 mt-1">{errors.rol.message}</p>}
        </div>

        {plantas.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-sm text-slate-600 mb-1">
              Plantas asignadas (opcional — hoy es solo informativo, no restringe acceso)
            </p>
            <div className="flex flex-wrap gap-2">
              {plantas.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-1 text-sm border border-slate-300 rounded-lg px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={plantasSeleccionadas.includes(p.id)}
                    onChange={() => togglePlanta(p.id)}
                  />
                  {p.nombre}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="sm:col-span-2 text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={guardando}
          className="sm:col-span-2 h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Agregar usuario'}
        </button>
      </form>

      {cargando ? (
        <p className="text-sm text-slate-500">Cargando usuarios…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2">Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2">{u.nombre}</td>
                <td>{u.correo}</td>
                <td>{u.rol}</td>
                <td>{u.activo ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
