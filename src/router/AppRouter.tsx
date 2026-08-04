import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { LoginPage } from '../features/auth/LoginPage';
import { MisAuditoriasPage } from '../features/auditoria/MisAuditoriasPage';
import { PlantasAdmin } from '../features/catalogos/PlantasAdmin';
import { IndicadoresPage } from '../features/indicadores/IndicadoresPage';
import { RoleGuard } from '../components/RoleGuard';
import { useCurrentUser } from '../features/auth/useCurrentUser';

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

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex gap-4 text-sm font-medium overflow-x-auto">
        <Link to="/" className="text-slate-700 whitespace-nowrap">
          Auditorías
        </Link>
        {(usuario?.rol === 'Administrador' || usuario?.rol === 'Consulta') && (
          <Link to="/indicadores" className="text-slate-700 whitespace-nowrap">
            Indicadores
          </Link>
        )}
        {usuario?.rol === 'Administrador' && (
          <Link to="/admin/plantas" className="text-slate-700 whitespace-nowrap">
            Plantas
          </Link>
        )}
        <span className="ml-auto text-slate-400 whitespace-nowrap">{usuario?.rol ?? '…'}</span>
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            <RoleGuard permitido={['Auditor', 'Administrador']}>
              <MisAuditoriasPage />
            </RoleGuard>
          }
        />
        <Route
          path="/indicadores"
          element={
            <RoleGuard permitido={['Administrador', 'Consulta', 'Auditor']}>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
