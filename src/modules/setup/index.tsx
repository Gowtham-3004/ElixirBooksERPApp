// Setup module — the All Settings hub plus the user's own preferences page.
import type { ModuleProps } from '../registry';
import SetupHub from './SetupHub';
import Preferences from './Preferences';

export default function SetupModule({ route }: ModuleProps) {
  if (route.sub === 'preferences') return <Preferences />;
  return <SetupHub />;
}
