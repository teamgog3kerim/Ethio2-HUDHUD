import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getGetProfileQueryKey, useGetProfile } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

export type Lang = 'ar' | 'en';

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  dark: boolean;
  toggleDark: () => void;
  t: (ar: string, en: string) => string;
};

const AppCtx = createContext<Ctx | null>(null);

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (readLS('hh-lang') === 'en' ? 'en' : 'ar'));
  const [dark, setDark] = useState<boolean>(() => readLS('hh-dark') === '1');

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'ar' ? 'rtl' : 'ltr';
    el.classList.toggle('dark', dark);
  }, [lang, dark]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('hh-lang', l); } catch { /* ignore */ }
  }, []);
  const toggleDark = useCallback(() => {
    setDark((d) => {
      try { localStorage.setItem('hh-dark', d ? '0' : '1'); } catch { /* ignore */ }
      return !d;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, dark, toggleDark, t: (ar, en) => (lang === 'ar' ? ar : en) }),
    [lang, setLang, dark, toggleDark],
  );

  return (
    <AppCtx.Provider value={value}>
      <ProfileLangSync />
      {children}
    </AppCtx.Provider>
  );
}

// The backend profile is the source of truth for language: adopt it whenever
// a (new) profile identity is loaded.
function ProfileLangSync() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isLoaded && isSignedIn,
      staleTime: 30_000,
    },
  });
  const { setLang } = useApp();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (data && seen.current !== data.id) {
      seen.current = data.id;
      setLang(data.language);
    }
  }, [data, setLang]);
  return null;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider missing');
  return c;
}
