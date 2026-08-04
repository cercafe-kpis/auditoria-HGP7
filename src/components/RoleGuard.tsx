import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../features/auth/useCurrentUser';
import type { Rol } from '../types/entities';

/**
 * Oculta rutas según el rol — esto es solo UX. La aplicación real de
 * permisos ocurre del lado de SharePoint (grupos por rol sobre cada
 * Lista/Biblioteca); si alguien manipulara el cliente para saltarse esto,
 * Graph igual rechazaría las operaciones no autorizadas.
 */
export function RoleGuard({
  permitido,
  children,
}: {
  permitido: Rol[];
  children: ReactNode;
}) {
  const { usuario, cargando, correo, error } = useCurrentUser();

  if (cargando) return <div className="p-6 text-slate-500">Cargando…</div>;

  // Si el correo autenticado no tiene un registro en la Lista "Usuarios"
  // (o la consulta falló), no hay una ruta segura a la que redirigir — si
  // esta misma pantalla es la ruta de inicio ("/"), un <Navigate to="/">
  // aquí produciría un bucle silencioso en blanco. En vez de eso, se
  // muestra un mensaje explícito para poder diagnosticarlo.
  if (!usuario) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="font-semibold text-slate-800 mb-2">
          Tu cuenta no tiene un rol asignado en esta app.
        </p>
        <p className="text-sm text-slate-600 mb-1">
          Correo detectado: <span className="font-mono">{correo ?? '(sin sesión)'}</span>
        </p>
        <p className="text-sm text-slate-600">
          Pide a un Administrador que te agregue en la pantalla "Usuarios" con este correo EXACTO
          (debe coincidir con tu cuenta de Microsoft 365, sin espacios ni mayúsculas distintas).
        </p>
        {error && <p className="text-xs text-rose-600 mt-3">Detalle técnico: {error}</p>}
      </div>
    );
  }

  if (!permitido.includes(usuario.rol)) {
    // El usuario existe y tiene un rol válido, pero no para ESTA ruta.
    // Se manda a una ruta que sí tenga permitida para su rol — nunca a la
    // misma ruta que lo bloqueó, para evitar otro bucle en blanco.
    const destino = usuario.rol === 'Consulta' ? '/indicadores' : '/';
    return <Navigate to={destino} replace />;
  }

  return <>{children}</>;
}
