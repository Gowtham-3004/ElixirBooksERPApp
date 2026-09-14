// Light ↔ dark switch shared by the auth backdrop and the shell header. It writes through the prefs
// store so the Setup › Preferences picker shows the same choice; picking here always lands on an
// explicit 'light' / 'dark' (never 'system'), which is what a one-click toggle should mean.
import { prefs } from '../store/prefs';
import { useResolvedTheme } from '../lib/theme';
import { SunIcon, MoonIcon } from './Icons';

export default function ThemeToggle({ variant = 'ghost', className = '' }: { variant?: 'ghost' | 'secondary'; className?: string }) {
  const theme = useResolvedTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  const base = variant === 'secondary' ? 'btn-secondary btn-sm' : 'btn-ghost';
  return (
    <button
      type="button"
      className={`${base} theme-toggle ${className}`.trim()}
      style={{ padding: '0 8px' }}
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={label}
      onClick={() => prefs.setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </button>
  );
}
