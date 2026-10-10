import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AdminIdentity, LoginInput, SessionResponse } from '@quba/shared';
import { api } from '../../lib/api';
type AuthState = {
  admin: AdminIdentity | null;
  status: 'loading' | 'ready' | 'error';
  error: string;
};
type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const ready = (result: SessionResponse): AuthState => ({
  admin: result.admin,
  status: 'ready',
  error: '',
});
const failed = (error: unknown): AuthState => ({
  admin: null,
  status: 'error',
  error: error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.',
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ admin: null, status: 'loading', error: '' });
  const refresh = useCallback(async () => {
    try {
      setState(ready(await api<SessionResponse>('/auth/session')));
    } catch (error: unknown) {
      setState(failed(error));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<SessionResponse>('/auth/session', { signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setState(ready(result));
      },
      (error) => {
        if (!controller.signal.aborted) setState(failed(error));
      },
    );
    return () => controller.abort();
  }, []);
  async function login(input: LoginInput) {
    const result = await api<SessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setState(ready(result));
  }
  async function logout() {
    await api<void>('/auth/logout', { method: 'POST' });
    setState({ admin: null, status: 'ready', error: '' });
  }
  return (
    <AuthContext.Provider value={{ ...state, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider missing');
  return context;
}
