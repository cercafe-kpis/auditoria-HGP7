import { AuthProvider } from './auth/AuthProvider';
import { AppRouter } from './router/AppRouter';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
