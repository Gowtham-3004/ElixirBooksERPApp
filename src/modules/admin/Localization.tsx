// Localization (FR-L10N-001..006, FR-ORG-009): active pack card, available packs/versions with status,
// compatibility check + upgrade flow, explicit failure of unsupported statutory actions.
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { Company, LocalizationPack } from '../../store';
import { PageHeader, Card, Button, Badge, KV, ConfirmDialog, Banner, useToast, Checklist, Pill } from '../../components/ui';
import { useCompany } from './shared';

const APP_VERSION = '2026.2';

function compat(pack: LocalizationPack, co: Company): { ok: boolean; rows: { id: string; label: string; status: 'Done' | 'Blocked' | 'Warning' | 'Pending'; detail?: string }[] } {
  const rows = [
    { id: 'country', label: `Pack country matches company (${co.country})`, status: pack.country === co.country ? 'Done' as const : 'Blocked' as const, detail: pack.country !== co.country ? `Pack is for ${pack.country}` : undefined },
    { id: 'status', label: 'Pack status is Approved', status: pack.status === 'Approved' ? 'Done' as const : pack.status === 'Beta' ? 'Warning' as const : 'Blocked' as const, detail: pack.status === 'Beta' ? 'Beta packs may be activated by the tenant owner only' : pack.status === 'Deprecated' ? 'Deprecated packs cannot be activated (FR-L10N-003)' : undefined },
    { id: 'app', label: `Compatible with app version ${APP_VERSION}`, status: pack.compatibleFrom <= APP_VERSION ? 'Done' as const : 'Blocked' as const, detail: pack.compatibleFrom > APP_VERSION ? `Requires ${pack.compatibleFrom}` : undefined },
    { id: 'newer', label: 'Newer than the active version', status: pack.packVersion > co.localizationVersion ? 'Done' as const : pack.packVersion === co.localizationVersion ? 'Pending' as const : 'Blocked' as const, detail: pack.packVersion < co.localizationVersion ? 'Downgrades are not supported' : pack.packVersion === co.localizationVersion ? 'Already active' : undefined },
    { id: 'history', label: 'Posted statutory documents keep their pack version', status: 'Done' as const, detail: `${db.count(C.salesInvoices, (d) => d.companyId === co.id && d.status === 'Posted')} posted documents retain v${co.localizationVersion} (FR-L10N-006)` },
  ];
  return { ok: rows.every((r) => r.status !== 'Blocked' && r.id !== 'newer' || (r.id === 'newer' && r.status === 'Done')), rows };
}

export default function Localization() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const packs = useCollection<LocalizationPack>(C.localizationPacks);
  const [target, setTarget] = useState<LocalizationPack | null>(null);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  if (!co) return null;
  const active = packs.find((p) => p.code === co.localizationPack && p.packVersion === co.localizationVersion) ?? packs.find((p) => p.code === co.localizationPack);
  const canUpgrade = s.can('admin.company.edit') || s.isTenantOwner;
  const check = target ? compat(target, co) : null;

  const upgrade = () => {
    if (!target || !check?.ok) return;
    db.update<Company>(C.companies, co.id, { localizationPack: target.code, localizationVersion: target.packVersion });
    engine.audit({ action: 'localization.upgraded', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: `${co.localizationPack} v${co.localizationVersion} → ${target.code} v${target.packVersion} · posted history not recalculated`, before: { pack: co.localizationPack, version: co.localizationVersion }, after: { pack: target.code, version: target.packVersion } });
    engine.notify({ type: 'system', title: `Localization pack upgraded to ${target.name} v${target.packVersion}`, body: target.releaseNotes, link: 'admin/localization' });
    toast.success(`Now on ${target.name} pack v${target.packVersion}`);
    setTarget(null);
  };
  const tryUnsupported = (action: string) => {
    const supported = active?.capabilities.some((c) => c.toLowerCase().includes(action.toLowerCase().split(' ')[0]));
    if (supported) { setDemoErr(null); toast.success(`${action} is supported by the ${active?.name} pack`); return; }
    const msg = `L10N_UNSUPPORTED: "${action}" is not provided by the ${active?.name ?? co.localizationPack} pack v${co.localizationVersion}. The action fails explicitly — India rules are never applied silently (FR-L10N-005).`;
    setDemoErr(msg);
    engine.audit({ action: 'localization.unsupported', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: action, result: 'Failure' });
  };

  return (
    <div className="page">
      <PageHeader title="Localization" subtitle={`${co.legalName} · ${co.country} · app version ${APP_VERSION}`} />
      <div className="grid-2">
        <Card title="Active pack">
          {active ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><span style={{ fontSize: 20, fontWeight: 700 }}>{active.name}</span><Badge status={active.status} /><Pill tone="neutral">v{co.localizationVersion}</Pill></div>
              <KV items={[{ k: 'Code', v: active.code }, { k: 'Compatible from', v: active.compatibleFrom }, { k: 'Release notes', v: active.releaseNotes }]} />
              <div className="section-label" style={{ margin: '12px 0 6px' }}>Capabilities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{active.capabilities.map((c) => <span key={c} className="chip selected" style={{ fontSize: 11 }}>{c}</span>)}</div>
            </>
          ) : <Banner tone="danger">No approved pack is active for {co.country}. Statutory actions will fail explicitly until one is activated.</Banner>}
        </Card>
        <Card title="Unsupported actions fail explicitly">
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 10 }}>Try a statutory action to see how the pack contract responds (FR-L10N-005).</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['e-Invoice (IRP)', 'GSTR-1/3B', 'VAT return', 'MTD submission', 'Form 26Q'].map((a) => <Button key={a} size="sm" variant="secondary" onClick={() => tryUnsupported(a)}>{a}</Button>)}
          </div>
          {demoErr && <div className="banner danger" style={{ marginTop: 12 }}><span style={{ flex: 1 }}>{demoErr}</span></div>}
        </Card>
      </div>
      <Card title="Available packs & versions">
        <table className="data-table dense">
          <thead><tr><th>Pack</th><th>Version</th><th>Status</th><th>Compatible from</th><th>Capabilities</th><th>Release notes</th><th /></tr></thead>
          <tbody>
            {packs.slice().sort((a, b) => a.code.localeCompare(b.code) || b.packVersion.localeCompare(a.packVersion)).map((p) => {
              const isActive = p.code === co.localizationPack && p.packVersion === co.localizationVersion;
              const c = compat(p, co);
              return (
                <tr key={p.id} style={{ background: isActive ? 'var(--accent-tint)' : undefined }}>
                  <td style={{ fontWeight: 500 }}>{p.name} <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>{p.code}</span></td>
                  <td className="identifier">v{p.packVersion}{isActive && <Badge status="Active" style={{ marginLeft: 6 }}>active</Badge>}</td>
                  <td><Badge status={p.status} /></td>
                  <td style={{ fontSize: 12 }}>{p.compatibleFrom}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.capabilities.length} · {p.capabilities.slice(0, 3).join(', ')}{p.capabilities.length > 3 ? '…' : ''}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.releaseNotes}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!isActive && <Button size="sm" variant={c.ok ? 'primary' : 'secondary'} onClick={() => setTarget(p)} disabled={!canUpgrade || p.country !== co.country} reason={p.country !== co.country ? `For ${p.country} companies` : canUpgrade ? undefined : 'Requires admin.company.edit'}>{c.ok ? 'Upgrade' : 'Check compatibility'}</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Every posted statutory document retains the pack version used at posting; upgrades validate compatibility and never recalculate posted history (FR-L10N-003/006).</div>

      <ConfirmDialog open={!!target} onClose={() => setTarget(null)} title={target ? `Upgrade to ${target.name} v${target.packVersion}?` : ''} statement="Pack upgrades change validation, tax rules and statutory formats for new documents only. Posted history is never recalculated." consequences={[{ engine: 'Tax', text: 'New documents use the upgraded rules and rule versions' }, { engine: 'Statutory', text: `Documents posted under v${co.localizationVersion} keep that version for reproduction`, tone: 'info' }, { engine: 'Workflow', text: 'Recorded as an audited company change' }]} confirmLabel="Upgrade pack" cancelLabel="Keep current pack" disabled={!check?.ok} onConfirm={upgrade}>
        {check && <div style={{ marginBottom: 12 }}><Checklist title="Compatibility check" rows={check.rows} />{!check.ok && <div className="banner danger" style={{ marginTop: 8 }}>Upgrade is blocked until every check passes.</div>}</div>}
      </ConfirmDialog>
    </div>
  );
}
