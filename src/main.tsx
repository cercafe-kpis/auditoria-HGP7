import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initializeMsal } from './auth/AuthProvider';

// MSAL debe terminar de inicializarse antes de que la app (y en particular
// MsalProvider) intente usarlo — ver comentario en AuthProvider.tsx.
await initializeMsal();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
