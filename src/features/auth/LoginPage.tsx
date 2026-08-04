import { useMsal } from '@azure/msal-react';
import { graphLoginRequest } from '../../auth/msalConfig';

export function LoginPage() {
  const { instance } = useMsal();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Auditoría HGP7</h1>
        <p className="text-slate-500 mb-8">
          Ingresa con tu cuenta corporativa de Microsoft 365 para continuar.
        </p>
        <button
          onClick={() => instance.loginRedirect(graphLoginRequest)}
          className="w-full h-14 rounded-xl bg-blue-600 text-white text-lg font-semibold shadow-sm active:scale-[0.98] transition-transform"
        >
          Iniciar sesión con Microsoft
        </button>
      </div>
    </div>
  );
}
