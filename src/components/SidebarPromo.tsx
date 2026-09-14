// A single dismissible card at the foot of the sidebar nav: the trial countdown for owners, otherwise a nudge
// to invite the team while the workspace is still small. Dismissals are remembered per browser (eb-promo).
import { useState } from 'react';
import { db, C, nav, useSession, usePrefs } from '../store';
import type { User } from '../store';
import { daysBetween, today } from '../lib/format';
import { dismissPromo, readPromoDismissed } from '../lib/decor';
import { Storyset, type StorysetName } from './ui/storyset';
import { Button } from './ui/primitives';
import { XIcon } from './Icons';

type Promo = { id: string; art: StorysetName; title: string; body: string; cta: string; path: string };

export default function SidebarPromo() {
  const s = useSession();
  const { decor } = usePrefs();
  const [dismissed, setDismissed] = useState<string[]>(() => readPromoDismissed());

  let promo: Promo | null = null;
  const tenant = s.tenant;
  if (tenant?.subscriptionState === 'Trial' && s.isTenantOwner) {
    const left = tenant.trialEndsAt ? Math.max(0, daysBetween(today(), tenant.trialEndsAt)) : undefined;
    promo = { id: `trial:${tenant.id}`, art: 'upgrade', title: left === undefined ? 'You are on a trial' : left === 0 ? 'Your trial ends today' : `${left} day${left === 1 ? '' : 's'} left in your trial`, body: 'Keep every module and your data by choosing a plan.', cta: 'Plan & usage', path: 'admin/plan' };
  } else if (tenant && (s.isTenantOwner || s.can('admin.user.create')) && db.get<User>(C.users).filter((u) => u.tenantId === tenant.id && u.status !== 'Deactivated').length < 3) {
    promo = { id: `invite:${tenant.id}`, art: 'add-user', title: 'Invite your team', body: 'Bring in your accountant and approvers — roles keep everyone in their lane.', cta: 'Invite users', path: 'admin/users' };
  }
  if (!promo || dismissed.includes(promo.id)) return null;
  const id = promo.id;
  const close = () => { dismissPromo(id); setDismissed((d) => [...d, id]); };

  return (
    <div className="sidebar-promo" role="complementary" aria-label={promo.title}>
      <button type="button" className="btn-icon" aria-label="Dismiss" onClick={close}><XIcon size={12} /></button>
      {decor === 'on' && <Storyset name={promo.art} width={88} bg={false} style={{ alignSelf: 'center', marginTop: -4 }} />}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, paddingRight: 16 }}>{promo.title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{promo.body}</div>
      <Button size="sm" variant="tinted" style={{ alignSelf: 'flex-start', marginTop: 2 }} onClick={() => nav.go(promo!.path)}>{promo.cta}</Button>
    </div>
  );
}
