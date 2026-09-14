// Help & Support (home/help): documentation links, contact, keyboard shortcuts and a "Report a problem"
// form that files a support job + notification so it is visible under Jobs.
import { useState } from 'react';
import { db, C, engine, nav, useSession } from '../../store';
import type { BackgroundJob } from '../../store';
import { Button, Card, KV, Kbd, Badge, PageHeader, TextField, TextArea, SelectField, useToast } from '../../components/ui';
import { fmtDateTime, correlationId } from '../../lib/format';

const DOCS = [
  { title: 'Getting started', desc: 'Company setup, periods, users and roles', path: 'admin/company' },
  { title: 'Sales-to-cash', desc: 'Quotation → order → delivery → invoice → receipt (E2E-01)', path: 'sales' },
  { title: 'Purchase-to-pay', desc: 'Requisition → PO → GRN → vendor invoice → payment (E2E-02)', path: 'purchase' },
  { title: 'Period close', desc: 'Close checklist, lock, reopen with approval (E2E-03)', path: 'admin/periods' },
  { title: 'GST & e-Invoicing', desc: 'India pack: GSTR, IRP, e-Way bill, TDS/TCS', path: 'taxation' },
  { title: 'Imports', desc: 'Template → dry-run → row errors → commit', path: 'masters' },
];

export default function Help() {
  const s = useSession();
  const toast = useToast();
  const [area, setArea] = useState('General');
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Normal' | 'High' | 'Blocking'>('Normal');
  const [filed, setFiled] = useState<BackgroundJob | null>(null);
  const mine = db.get<BackgroundJob>(C.jobs).filter((j) => j.type === 'support' && j.companyId === s.state.companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const isWin = typeof navigator !== 'undefined' && /Win/.test(navigator.platform);
  const mod = isWin ? 'Ctrl' : '⌘';

  const submit = () => {
    if (!subject.trim() || detail.trim().length < 10) { toast.error('Add a subject and at least 10 characters of detail'); return; }
    const corr = correlationId();
    const job = db.insert<BackgroundJob>(C.jobs, { type: 'support', name: `Support ticket · ${subject.trim()}`, status: 'Queued', attempts: 0, maxAttempts: 1, correlationId: corr, idempotencyKey: `support:${corr}`, payload: { area, severity, detail: detail.trim(), route: window.location.hash, user: s.user?.email, company: s.company?.legalName } });
    engine.notify({ type: 'system', title: `Problem reported: ${subject.trim()}`, body: `${area} · ${severity} · ticket ${corr}`, link: 'admin/jobs' });
    engine.audit({ action: 'support.reported', objectType: 'Support', objectId: job.id, detail: `${area} · ${severity} · ${subject.trim()}`, correlationId: corr });
    setFiled(job);
    setSubject(''); setDetail('');
    toast.success('Problem reported — the ticket is tracked under Jobs', { label: 'View', path: 'admin/jobs' });
  };

  return (
    <div className="page">
      <PageHeader title="Help & Support" subtitle={`${s.company?.tradeName ?? 'Workspace'} · ${s.plan?.name ?? 'Growth'} plan · support hours 09:00–18:00 IST`} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Documentation">
            <div className="grid-2">
              {DOCS.map((d) => (
                <button key={d.title} type="button" className="card" style={{ padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => nav.go(d.path)}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2 }}>{d.desc}</div>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Report a problem">
            {filed && <div className="banner success" style={{ marginBottom: 12 }}>Ticket {filed.correlationId} filed at {fmtDateTime(filed.createdAt)}. Keep the correlation ID for follow-up.</div>}
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <SelectField label="Area" value={area} onChange={setArea} options={['General', 'Sign-in & access', 'Sales', 'Purchase', 'Inventory', 'Accounting', 'Banking', 'Taxation & e-Invoice', 'Payroll', 'Reports', 'Imports', 'Billing & plan']} />
              <SelectField label="Severity" value={severity} onChange={(v) => setSeverity(v as any)} options={['Low', 'Normal', 'High', 'Blocking']} />
            </div>
            <TextField label="Subject" required value={subject} onChange={setSubject} placeholder="e.g. e-Invoice rejected with error 2172" />
            <TextArea label="What happened?" required value={detail} onChange={setDetail} rows={4} placeholder="Steps to reproduce, the document number, and what you expected." minLength={10} style={{ marginTop: 12 }} />
            <div style={{ fontSize: 12, color: '#6E6E71', margin: '8px 0 12px' }}>We attach your current page ({window.location.hash || '#/home'}), company and a correlation ID. No document data is sent without your consent.</div>
            <Button variant="primary" onClick={submit}>Send report</Button>
            {mine.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="section-label" style={{ marginBottom: 6 }}>Your recent tickets</div>
                {mine.map((j) => (
                  <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F5F5F5', fontSize: 13 }}>
                    <span>{j.name.replace('Support ticket · ', '')} <span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{j.correlationId}</span></span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 12, color: '#6E6E71' }}>{fmtDateTime(j.createdAt)}</span><Badge status={j.status} /></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Contact">
            <KV items={[{ k: 'Email', v: 'support@elixirbooks.com' }, { k: 'Phone', v: '+91 80 4718 0000' }, { k: 'Status page', v: 'status.elixirbooks.com' }, { k: 'Your tenant', v: s.tenant?.name }, { k: 'Plan', v: `${s.plan?.name ?? '—'} · ${s.tenant?.subscriptionState ?? ''}` }]} />
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(`${s.tenant?.name} · ${s.company?.legalName} · ${s.user?.email} · ${window.location.hash}`); toast.info('Support context copied'); }}>Copy support context</Button>
              {s.isTenantOwner && <Button size="sm" variant="tinted" onClick={() => nav.go('admin/plan')}>Plan & usage</Button>}
            </div>
          </Card>
          <Card title="Keyboard shortcuts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              {[[`${mod} K`, 'Global search'], ['?', 'Show shortcuts'], ['Esc', 'Close drawer / dialog'], ['↑ ↓ Enter', 'Move and pick in lists'], ['Tab', 'Next field in a line grid']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#5F6368' }}>{v}</span><span style={{ display: 'flex', gap: 4 }}>{k.split(' ').map((x, i) => <Kbd key={i}>{x}</Kbd>)}</span></div>
              ))}
            </div>
          </Card>
          <Card title="About">
            <KV items={[{ k: 'Version', v: '2026.9 · build 4118' }, { k: 'Localization', v: `${s.company?.localizationPack ?? 'IN'} pack v${s.company?.localizationVersion ?? '1.4'}` }, { k: 'Data', v: 'In-memory demo store' }]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
