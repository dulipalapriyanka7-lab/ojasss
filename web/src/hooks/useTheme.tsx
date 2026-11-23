import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'ojasss-theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

const Ctx = createContext<{ pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#09090F' : '#f7f6fa');
  }, [resolved]);

  const value = useMemo(() => ({
    pref,
    resolved,
    setPref: (p: ThemePref) => {
      setPrefState(p);
      try {
        localStorage.setItem(KEY, p);
      } catch {
        /* storage unavailable: preference lasts for this session */
      }
    },
  }), [pref, resolved]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
