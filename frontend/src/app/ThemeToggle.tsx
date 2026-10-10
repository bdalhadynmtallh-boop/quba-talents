import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
type Theme = 'light' | 'dark';
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const media = matchMedia('(prefers-color-scheme: dark)');
    function systemChanged(event: MediaQueryListEvent) {
      try {
        if (!localStorage.getItem('quba-theme')) setTheme(event.matches ? 'dark' : 'light');
      } catch {
        setTheme(event.matches ? 'dark' : 'light');
      }
    }
    media.addEventListener('change', systemChanged);
    return () => media.removeEventListener('change', systemChanged);
  }, [theme]);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('quba-theme', next);
    } catch {
      /* Theme still works without storage. */
    }
  }
  return (
    <button
      className="icon-button theme-button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
    >
      {theme === 'dark' ? <Sun size={21} /> : <Moon size={21} />}
    </button>
  );
}
