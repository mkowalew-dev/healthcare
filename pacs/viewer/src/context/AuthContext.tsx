import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { login as apiLogin, type PacsUser } from '../api/pacs';

interface AuthContextValue {
  user: PacsUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PacsUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('pacs_token');
    const storedUser = localStorage.getItem('pacs_user');
    if (stored && storedUser) {
      try {
        setToken(stored);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('pacs_token');
        localStorage.removeItem('pacs_user');
      }
    }
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const result = await apiLogin(email, password);
    localStorage.setItem('pacs_token', result.token);
    localStorage.setItem('pacs_user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem('pacs_token');
    localStorage.removeItem('pacs_user');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
