// Banking settings — reconciliation suggestion tolerances (additive keys on company.defaults).
import { useState } from 'react';
import { useSession } from '../../store';
import { Button, NumberField, MoneyField, useToast, PageHeader, Banner } from '../../components/ui';
import * as A from './actions';
import type { BankingSettings } from './types';

export function BankingSettingsPage() {
  const s = useSession();
  const toast = useToast();
  const [v, setV] = useState<BankingSettings>(() => A.bankingSettings(s.company));
  const canEdit = s.can('admin.company.edit') || s.can('banking.settings.edit') || s.isTenantOwner || s.can('banking.*');
  return (
    <div className="page">
      <PageHeader title="Banking settings" subtitle="Suggestion engine tuning for the reconciliation workbench (FR-REC-004)" actions={<Button variant="primary" disabled={!canEdit} reason={!canEdit ? 'Requires company admin' : undefined} onClick={() => { try { A.saveBankingSettings(v); toast.success('Banking settings saved'); } catch (e: any) { toast.error(e.message); } }}>Save settings</Button>} />
      {!canEdit && <Banner tone="info">Read-only — ask a Finance Admin or the tenant owner to change these.</Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        <NumberField label="Date tolerance (days)" value={v.reconToleranceDays} onChange={(x) => setV({ ...v, reconToleranceDays: x })} decimals={0} min={0} max={30} disabled={!canEdit} help="Book entries within this many days score as 'close'; up to 30 days are still considered" />
        <MoneyField label="Amount tolerance" value={v.reconToleranceAmt} onChange={(x) => setV({ ...v, reconToleranceAmt: x })} disabled={!canEdit} help="Rounding difference allowed for a suggestion (exact match still required to Match)" />
        <NumberField label="Auto-suggest threshold (%)" value={v.reconAutoSuggestThreshold} onChange={(x) => setV({ ...v, reconAutoSuggestThreshold: x })} decimals={0} min={40} max={99} disabled={!canEdit} help="Suggestions at or above this confidence show as green (High / Medium); below as amber" />
      </div>
      <div className="card" style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)' }}>Scoring: amount equal (60) + same day (15) / within tolerance (10) − days beyond tolerance · description / party word hits (+8 each, max 25) · reference digits (+10). Suggestions never post anything; a user must Match, Unmatch or Create adjustment, and every action is audited.</div>
    </div>
  );
}
