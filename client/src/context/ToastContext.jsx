import { createContext, useCallback, useMemo, useRef, useState } from "react";

export const ToastContext = createContext(null);

const DURATION = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type, message) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, type, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION));
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toasts,
      dismiss,
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [toasts, push, dismiss]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
