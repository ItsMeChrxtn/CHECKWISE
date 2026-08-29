import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `initialising` covers the first token check on page load, so protected
  // routes wait instead of flashing the login screen for a signed-in user.
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!authService.getToken()) {
        setInitialising(false);
        return;
      }

      try {
        const me = await authService.me();
        if (!cancelled) setUser(me);
      } catch {
        authService.clearToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { user: authed, token } = await authService.login(credentials);
    authService.storeToken(token);
    setUser(authed);
    return authed;
  }, []);

  const register = useCallback(async (payload) => {
    const { user: created, token } = await authService.register(payload);
    authService.storeToken(token);
    setUser(created);
    return created;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    authService.clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      initialising,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      login,
      register,
      logout,
    }),
    [user, initialising, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
