import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useRef, useState } from 'react';
import { useCatalogosOffline } from './useCatalogosOffline';
import { useAuthToken } from '../../auth/useAuthToken';
import { crearUsuario, editarUsuario, getUsuarios } from '../../graph/lists';
import type { UsuarioApp } from '../../types/entities';

const usuarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  correo: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  rol: z.enum(['Administrador', 'Auditor', 'Consulta', 'Supervisor']),
  activo: z.boolean(),
});
type UsuarioForm = z.infer<typeof usuarioSchema>;

const vacio: UsuarioForm = { nombre: '', correo: '', rol: 'Auditor', activo: true };

/**
 * Pantalla de administración de Usuarios — crear + editar (rol, correo,
 * nombre, plantas asignadas y activo/inactivo). Mismo patrón de aviso
 * "Editando: X" + desplazamiento automático que MetodologiasAdmin /
 * OperariosAdmin. El correo debe coincidir EXACTAMENTE con la cuenta de
 * Microsoft 365 de la persona (su UPN): es la clave que useCurrentUser()
 * usa para resolver el rol al iniciar sesión.
 */
export function UsuariosAdmin() {
  const { plantas } = useCatalogosOffline();
  const { getAccessToken } = useAuthToken();
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plantasSeleccionadas, setPlantasSeleccionadas] = useState<string[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UsuarioForm>({ resolver: zodResolver(usuarioSchema), defaultValues: vacio });

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

  function editar(u: UsuarioApp) {
    setEditandoId(u.id);
    setEditandoNombre(u.nombre);
    setError(null);
    reset({ nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo });
    setPlantasSeleccionadas(u.plantasAsignadas);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEditandoNombre(null);
    setError(null);
    reset(vacio);
    setPlantasSeleccionadas([]);
  }

  async function onSubmit(values: UsuarioForm) {
    setGuardando(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (editandoId) {
        await editarUsuario(token, editandoId, { ...values, plantasAsignadas: plantasSeleccionadas });
        setUsuarios((actuales) =>
          actuales.map((u) =>
            u.id === editandoId ? { ...u, ...values, plantasAsignadas: plantasSeleccionadas } : u,
          ),
        );
        setEditandoId(null);
        setEditandoNombre(null);
      } else {
        const nuevo = await crearUsuario(token, { ...values, plantasAsignadas: plantasSeleccionadas });
        setUsuarios((actuales) => [...actuales, nuevo]);
      }
      reset(vacio);
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

      {editandoNombre && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Editando: <span className="font-semibold">{editandoNombre}</span> — modifica los campos y presiona
          "Guardar cambios".
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 scroll-mt-4"
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
            {...register('correo')}
            placeholder="Correo (igual a su cuenta de M365)"
            className="w-full h-11 rounded-lg border border-slate-300 px-3"
          />
          {errors.correo && <p className="text-xs text-rose-600 mt-1">{errors.correo.message}</p>}
        </div>
        <div>
          <select {...register('rol')} className="w-full h-11 rounded-lg border border-slate-300 px-3">
            <option value="Administrador">Administrador</option>
            <option value="Auditor">Auditor</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Consulta">Consulta</option>
          </select>
          {errors.rol && <p className="text-xs text-rose-600 mt-1">{errors.rol.message}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" {...register('activo')} />
          Activo
        </label>

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

        <div className="sm:col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar usuario'}
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2">{u.nombre}</td>
                <td>{u.correo}</td>
                <td>{u.rol}</td>
                <td>{u.activo ? 'Sí' : 'No'}</td>
                <td className="text-right">
                  <button type="button" onClick={() => editar(u)} className="text-blue-600 text-xs font-semibold">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
