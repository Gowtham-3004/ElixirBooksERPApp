// Approvals & Activity module: inbox (default) and activity feed (approvals/activity).
import type { ModuleProps } from '../registry';
import { nav } from '../../store';
import { Tabs } from '../../components/ui';
import Inbox from './Inbox';
import ActivityFeed from './ActivityFeed';

export default function Module({ route }: ModuleProps) {
  const tab = route.sub === 'activity' ? 'activity' : 'inbox';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '0 28px', background: '#FFFFFF', borderBottom: '1px solid #EFEFEF' }}>
        <Tabs variant="doc" value={tab} onChange={(v) => nav.go(v === 'activity' ? 'approvals/activity' : 'approvals')} tabs={[{ id: 'inbox', label: 'Inbox' }, { id: 'activity', label: 'Activity feed' }]} />
      </div>
      {tab === 'activity' ? <ActivityFeed /> : <Inbox openId={route.params.id} />}
    </div>
  );
}
