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
  const { usuario, cargando } = useCurrentUser();

  if (cargando) return <div className="p-6 text-slate-500">Cargando…</div>;
  if (!usuario || !permitido.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
