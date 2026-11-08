import { useCallback, useEffect, useRef } from "react";

// Each mounted owner cancels its own delayed work, including nested callbacks.
export default function useTimeouts() {
  const timers = useRef(new Set());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const pending = timers.current;
    return () => {
      active.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  const schedule = useCallback((callback, delay) => {
    if (!active.current) return null;
    const id = setTimeout(() => {
      timers.current.delete(id);
      if (active.current) callback();
    }, delay);
    timers.current.add(id);
    return id;
  }, []);
  const cancel = useCallback((id) => {
    clearTimeout(id);
    timers.current.delete(id);
  }, []);
  return { schedule, cancel };
}
