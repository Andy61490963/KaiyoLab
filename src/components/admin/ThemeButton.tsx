import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const storageKey = 'kaiyo-theme';

export default function ThemeButton() {
  const [theme, setTheme] = useState<Theme>('light');
  const manualChoice = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    const system = matchMedia('(prefers-color-scheme: dark)');
    const storedTheme = (): Theme | null => {
      try {
        const saved = localStorage.getItem(storageKey);
        return saved === 'light' || saved === 'dark' ? saved : null;
      } catch {
        return null;
      }
    };
    const sync = () => {
      const current = root.dataset.theme === 'dark' ? 'dark' : 'light';
      setTheme(current);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', current === 'dark' ? '#202025' : '#f8f4e6');
    };
    const followSystem = () => {
      if (!manualChoice.current && !storedTheme())
        root.dataset.theme = system.matches ? 'dark' : 'light';
    };
    const followStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      manualChoice.current = false;
      root.dataset.theme = storedTheme() || (system.matches ? 'dark' : 'light');
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    sync();
    system.addEventListener('change', followSystem);
    window.addEventListener('storage', followStorage);
    return () => {
      observer.disconnect();
      system.removeEventListener('change', followSystem);
      window.removeEventListener('storage', followStorage);
    };
  }, []);
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      className="admin-icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        manualChoice.current = true;
        const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          /* A blocked store must not disable themes. */
        }
      }}
    >
      {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
