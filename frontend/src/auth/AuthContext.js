import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { API_URL } from '../config';
import apiClient, {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
} from '../lib/apiClient';

const AuthContext = createContext(null);

function readStoredUser() {
  const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
  const [user, setUser] = useState(() => readStoredUser());
  const [authLoading, setAuthLoading] = useState(() => Boolean(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)));
  const [setupRequired, setSetupRequired] = useState(null);

  const persistAuth = useCallback((nextToken, nextUser) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextToken);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
    startTransition(() => {
      setToken(nextToken);
      setUser(nextUser);
      setAuthLoading(false);
      setSetupRequired(false);
    });
  }, []);

  const clearLocalAuth = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    startTransition(() => {
      setToken(null);
      setUser(null);
      setAuthLoading(false);
    });
  }, []);

  const refreshSetupStatus = useCallback(async () => {
    const response = await apiClient.get(`${API_URL}/auth/bootstrap-status/`);
    setSetupRequired(Boolean(response.data.setup_required));
    return response.data;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null);
      setAuthLoading(false);
      return null;
    }

    setAuthLoading(true);
    try {
      const response = await apiClient.get(`${API_URL}/auth/me/`);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.data));
      setUser(response.data);
      return response.data;
    } catch (error) {
      clearLocalAuth();
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, [clearLocalAuth, token]);

  useEffect(() => {
    refreshSetupStatus().catch(() => {
      setSetupRequired(false);
    });
  }, [refreshSetupStatus]);

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      return;
    }

    refreshUser().catch(() => {});
  }, [refreshUser, token]);

  const login = useCallback(
    async (credentials) => {
      const response = await apiClient.post(`${API_URL}/auth/login/`, credentials);
      persistAuth(response.data.token, response.data.user);
      return response.data.user;
    },
    [persistAuth]
  );

  const bootstrap = useCallback(
    async (payload) => {
      const response = await apiClient.post(`${API_URL}/auth/bootstrap/`, payload);
      persistAuth(response.data.token, response.data.user);
      return response.data.user;
    },
    [persistAuth]
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiClient.post(`${API_URL}/auth/logout/`);
      }
    } catch {
      // Best effort logout.
    } finally {
      clearLocalAuth();
    }
  }, [clearLocalAuth, token]);

  const listSourceAccounts = useCallback(async () => {
    const response = await apiClient.get(`${API_URL}/auth/source-accounts/`);
    return response.data;
  }, []);

  const createSourceAccount = useCallback(async (payload) => {
    const response = await apiClient.post(`${API_URL}/auth/source-accounts/`, payload);
    return response.data;
  }, []);

  const value = useMemo(
    () => ({
      authLoading,
      bootstrap,
      createSourceAccount,
      isAuthenticated: Boolean(token && user),
      isRegie: user?.role === 'regie',
      isSource: user?.role === 'source',
      listSourceAccounts,
      login,
      logout,
      refreshSetupStatus,
      refreshUser,
      setupRequired,
      token,
      user,
    }),
    [
      authLoading,
      bootstrap,
      createSourceAccount,
      listSourceAccounts,
      login,
      logout,
      refreshSetupStatus,
      refreshUser,
      setupRequired,
      token,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
