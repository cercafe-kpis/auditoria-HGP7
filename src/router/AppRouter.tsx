import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { LoginPage } from '../features/auth/LoginPage';
import { SesionPage } from '../features/sesion/SesionPage';
import { PlantasAdmin } from '../features/catalogos/PlantasAdmin';
import { MetodologiasAdmin } from '../features/catalogos/MetodologiasAdmin';
import { OperariosAdmin } from '../features/catalogos/OperariosAdmin';
import { UsuariosAdmin } from '../features/catalogos/UsuariosAdmin';
import { IndicadoresPage } from '../features/indicadores/IndicadoresPage';
import { RoleGuard } from '../components/RoleGuard';
import { useCurrentUser } from '../features/auth/useCurrentUser';
import { cercafeLogoDataUrl } from '../assets/cercafeLogo';

/**
 * Enrutamiento con HashRouter (no BrowserRouter): GitHub Pages no soporta
 * de forma nativa el enrutamiento "history" de una SPA en subrutas, así
 * que se evita esa clase entera de problemas usando rutas tipo
 * "#/auditorias" en vez de "/auditorias".
 */
export function AppRouter() {
  return (
    <HashRouter>
      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <AppShell />
      </AuthenticatedTemplate>
    </HashRouter>
  );
}

function AppShell() {
  const { usuario } = useCurrentUser();
  const { instance } = useMsal();

  function cerrarSesion() {
    // logoutRedirect limpia la cuenta activa y la caché de MSAL, y luego
    // regresa a postLogoutRedirectUri (configurado en msalConfig.ts como
    // la misma redirectUri de la app), donde UnauthenticatedTemplate
    // vuelve a mostrar el LoginPage.
    void instance.logoutRedirect();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 text-sm font-medium overflow-x-auto">
        <img src={cercafeLogoDataUrl} alt="Cercafe" className="h-8 w-auto shrink-0" />
        <Link to="/" className="text-slate-700 whitespace-nowrap">
          Auditorías
        </Link>
        {(usuario?.rol === 'Administrador' || usuario?.rol === 'Consulta' || usuario?.rol === 'Supervisor') && (
          <Link to="/indicadores" className="text-slate-700 whitespace-nowrap">
            Indicadores
          </Link>
        )}
        {usuario?.rol === 'Administrador' && (
          <Link to="/admin/plantas" className="text-slate-700 whitespace-nowrap">
            Plantas
          </Link>
        )}
        {usuario?.rol === 'Administrador' && (
          <Link to="/admin/metodologias" className="text-slate-700 whitespace-nowrap">
            Metodologías
          </Link>
        )}
        {usuario?.rol === 'Administrador' && (
          <Link to="/admin/operarios" className="text-slate-700 whitespace-nowrap">
            Operarios
          </Link>
        )}
        {usuario?.rol === 'Administrador' && (
          <Link to="/admin/usuarios" className="text-slate-700 whitespace-nowrap">
            Usuarios
          </Link>
        )}
        <span className="ml-auto text-slate-400 whitespace-nowrap">{usuario?.rol ?? '…'}</span>
        <button
          type="button"
          onClick={cerrarSesion}
          className="text-slate-500 whitespace-nowrap font-semibold"
        >
          Cerrar sesión
        </button>
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            <RoleGuard permitido={['Auditor', 'Administrador', 'Supervisor']}>
              <SesionPage />
            </RoleGuard>
          }
        />
        <Route
          path="/indicadores"
          element={
            <RoleGuard permitido={['Administrador', 'Consulta', 'Auditor', 'Supervisor']}>
              <IndicadoresPage />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/plantas"
          element={
            <RoleGuard permitido={['Administrador']}>
              <PlantasAdmin />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/metodologias"
          element={
            <RoleGuard permitido={['Administrador']}>
              <MetodologiasAdmin />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/operarios"
          element={
            <RoleGuard permitido={['Administrador']}>
              <OperariosAdmin />
            </RoleGuard>
          }
        />
        <Route
          path="/admin/usuarios"
          element={
            <RoleGuard permitido={['Administrador']}>
              <UsuariosAdmin />
            </RoleGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <footer className="text-center text-xs text-slate-400 py-6">
        Desarrollado por Gestión técnica especializada
      </footer>
    </div>
  );
}
