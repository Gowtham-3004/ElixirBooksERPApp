// Home module: role dashboard (default) and Help & Support (home/help).
import type { ModuleProps } from '../registry';
import Dashboard from './Dashboard';
import Help from './Help';

export default function Module({ route }: ModuleProps) {
  if (route.sub === 'help') return <Help />;
  return <Dashboard />;
}
