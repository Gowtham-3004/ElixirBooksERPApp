// Integrations & credentials (FR-CMP-008, FRD §21): provider credentials (add / rotate / revoke, masked, access log),
// API keys (shown once), webhooks (events from §21.2, test-send → integrationLogs), integration log viewer with retry.
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { ProviderCredential, ApiKey, Webhook, IntegrationLog, Company } from '../../store';
import { fmtDateTime, correlationId, addDays, today } from '../../lib/format';
import { PageHeader, Card, Button, Badge, Drawer, TextField, SelectField, ChipGroup, TextArea, ConfirmDialog, KV, Tabs, TwoLine, Identifier, useToast, Banner, MaskedValue, DataTable, Pill } from '../../components/ui';
import type { Column } from '../../components/ui';
import { API_SCOPES, DOMAIN_EVENTS, randomKey, useCompany } from './shared';

const PROVIDERS: ProviderCredential['provider'][] = ['IRP', 'EWB', 'GSTN', 'Bank', 'RateProvider', 'Email', 'SMS'];
type Tab = 'credentials' | 'keys' | 'webhooks' | 'log';

export default function Integrations({ initialTab }: { initialTab?: string }) {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>((['credentials', 'keys', 'webhooks', 'log'].includes(initialTab ?? '') ? initialTab : 'credentials') as Tab);
  const creds = useCollection<ProviderCredential>(C.providerCredentials).filter((c) => c.companyId === co?.id);
  const keys = useCollection<ApiKey>(C.apiKeys).filter((k) => k.companyId === co?.id);
  const hooks = useCollection<Webhook>(C.webhooks).filter((w) => w.companyId === co?.id);
  const logs = useCollection<IntegrationLog>(C.integrationLogs).filter((l) => l.companyId === co?.id || !l.companyId).sort((a, b) => b.at.localeCompare(a.at));
  const canEdit = s.can('admin.integrations.edit') || s.can('admin.integrations.*') || s.isTenantOwner;
  const [cred, setCred] = useState<Partial<ProviderCredential> & { secret?: string } | null>(null);
  const [revoke, setRevoke] = useState<{ kind: 'cred' | 'key'; id: string; label: string } | null>(null);
  const [rotate, setRotate] = useState<ProviderCredential | null>(null);
  const [key, setKey] = useState<{ name: string; scopes: string[]; expiresDays: number } | null>(null);
  const [shown, setShown] = useState<{ name: string; key: string } | null>(null);
  const [hook, setHook] = useState<Partial<Webhook> | null>(null);
  const [log, setLog] = useState<IntegrationLog | null>(null);
  if (!co) return null;
  const regs = (co as Company).registrations;
  const auditSensitive = (action: string, objectType: string, objectId: string, objectNumber: string, detail?: string) => engine.audit({ action, objectType, objectId, objectNumber, detail, sensitive: true });

  const saveCred = () => {
    if (!cred) return;
    if (!cred.label?.trim() || !cred.username?.trim() || !cred.secret) { toast.error('Label, username and secret are required'); return; }
    const now = new Date().toISOString();
    const c = db.insert<ProviderCredential>(C.providerCredentials, { companyId: co.id, provider: cred.provider ?? 'IRP', registrationId: cred.registrationId || undefined, label: cred.label.trim(), username: cred.username.trim(), secretMasked: '••••••••••' + cred.secret.slice(-4), rotatedAt: now, expiresAt: cred.expiresAt || undefined, status: 'Active', accessLog: [{ at: now, by: s.user?.name ?? 'system', action: 'Created' }] });
    auditSensitive('credential.created', 'ProviderCredential', c.id, c.label, `${c.provider} · secret encrypted at rest, masked in UI`);
    toast.success('Credential stored (encrypted) — the secret will not be shown again');
    setCred(null);
  };
  const doRotate = (reason: string) => {
    if (!rotate) return;
    const now = new Date().toISOString();
    const secret = randomKey('', 12);
    db.update<ProviderCredential>(C.providerCredentials, rotate.id, { secretMasked: '••••••••••' + secret.slice(-4), rotatedAt: now, status: 'Active', expiresAt: addDays(today(), 365), accessLog: [...rotate.accessLog, { at: now, by: s.user?.name ?? 'system', action: `Rotated · ${reason}` }] });
    auditSensitive('credential.rotated', 'ProviderCredential', rotate.id, rotate.label, reason);
    toast.success(`${rotate.label} rotated`);
  };
  const doRevoke = (reason: string) => {
    if (!revoke) return;
    const now = new Date().toISOString();
    if (revoke.kind === 'cred') { const c = creds.find((x) => x.id === revoke.id)!; db.update<ProviderCredential>(C.providerCredentials, c.id, { status: 'Revoked', accessLog: [...c.accessLog, { at: now, by: s.user?.name ?? 'system', action: `Revoked · ${reason}` }] }); auditSensitive('credential.revoked', 'ProviderCredential', c.id, c.label, reason); }
    else { db.update<ApiKey>(C.apiKeys, revoke.id, { status: 'Revoked', revokedAt: now, revokedReason: reason }); auditSensitive('apikey.revoked', 'ApiKey', revoke.id, revoke.label, reason); }
    toast.success(`${revoke.label} revoked`);
  };
  const createKey = () => {
    if (!key) return;
    if (!key.name.trim() || !key.scopes.length) { toast.error('Name and at least one scope are required'); return; }
    const full = randomKey('ebk_live_', 32);
    const k = db.insert<ApiKey>(C.apiKeys, { companyId: co.id, name: key.name.trim(), prefix: full.slice(0, 11), keyMasked: full.slice(0, 11) + '••••••••••••••••' + full.slice(-4), scopes: key.scopes, status: 'Active', expiresAt: key.expiresDays ? addDays(today(), key.expiresDays) : undefined });
    auditSensitive('apikey.created', 'ApiKey', k.id, k.name, `${key.scopes.length} scope(s)`);
    setShown({ name: k.name, key: full });
    setKey(null);
  };
  const saveHook = () => {
    if (!hook) return;
    if (!/^https:\/\//.test(hook.url ?? '')) { toast.error('Webhook URL must start with https://'); return; }
    if (!hook.events?.length) { toast.error('Choose at least one event'); return; }
    if (hook.id) { db.update<Webhook>(C.webhooks, hook.id, { url: hook.url, description: hook.description, events: hook.events, status: hook.status ?? 'Active' }); engine.audit({ action: 'webhook.updated', objectType: 'Webhook', objectId: hook.id, objectNumber: hook.url }); }
    else { const secret = randomKey('whsec_', 24); const w = db.insert<Webhook>(C.webhooks, { companyId: co.id, url: hook.url!, description: hook.description, events: hook.events, secretMasked: 'whsec_••••••••' + secret.slice(-4), status: 'Active', failures: 0 }); engine.audit({ action: 'webhook.created', objectType: 'Webhook', objectId: w.id, objectNumber: w.url, detail: `${hook.events.length} event(s)`, sensitive: true }); setShown({ name: `Webhook secret for ${w.url}`, key: secret }); }
    toast.success('Webhook saved');
    setHook(null);
  };
  const testSend = (w: Webhook) => {
    const now = new Date().toISOString();
    const fail = w.status !== 'Active';
    const corr = correlationId();
    db.insert<IntegrationLog>(C.integrationLogs, { companyId: co.id, provider: 'Webhook', action: 'TestDelivery', objectType: 'Webhook', objectId: w.id, objectNumber: w.url, requestFingerprint: 'fp_' + Date.now().toString(36), idempotencyKey: `webhook-test:${w.id}:${Date.now()}`, request: { url: w.url, event: 'DocumentPosted', sample: { docType: 'Sales Invoice', number: 'INV/26-27/0118' }, signature: 'sha256=…' }, response: fail ? { status: 503, body: 'endpoint paused' } : { status: 200, body: 'ok', latencyMs: 142 }, status: fail ? 'Failed' : 'Accepted', errorCode: fail ? 'HTTP_503' : undefined, errorMessage: fail ? 'Endpoint paused' : undefined, at: now, correlationId: corr });
    db.update<Webhook>(C.webhooks, w.id, { lastDeliveryAt: now, lastStatus: fail ? 'Failed' : 'Success', failures: fail ? w.failures + 1 : 0 });
    engine.audit({ action: fail ? 'webhook.test_failed' : 'webhook.test_sent', objectType: 'Webhook', objectId: w.id, objectNumber: w.url, result: fail ? 'Failure' : 'Success', correlationId: corr });
    toast[fail ? 'error' : 'success'](fail ? `Test delivery failed (${w.status.toLowerCase()} endpoint) — see integration log` : 'Test event delivered · 200 OK');
    setTab('log');
  };
  const retry = (l: IntegrationLog) => {
    const idempotent = /^(GenerateIRN|GenerateEWB|FetchStatement|FetchRates|TestDelivery|Send)$/.test(l.action) || l.provider === 'Webhook';
    if (!idempotent) { toast.error(`${l.action} is not idempotent — retry from the document instead (FRD §20)`); return; }
    const now = new Date().toISOString();
    const n = db.insert<IntegrationLog>(C.integrationLogs, { ...l, id: undefined, createdAt: undefined, updatedAt: undefined, version: undefined, status: 'Accepted', response: { ...(l.response ?? {}), retried: true, status: 200 }, errorCode: undefined, errorMessage: undefined, at: now, idempotencyKey: l.idempotencyKey } as any);
    engine.audit({ action: 'integration.retried', objectType: l.objectType, objectId: l.objectId, objectNumber: l.objectNumber, detail: `${l.provider} ${l.action} · same idempotency key ${l.idempotencyKey}`, correlationId: l.correlationId });
    toast.success(`Retried ${l.action} — accepted`);
    setLog(n);
  };

  const credCols: Column<ProviderCredential>[] = [
    { key: 'label', label: 'Credential', render: (c) => <TwoLine primary={c.label} secondary={`${c.provider}${c.registrationId ? ' · ' + (regs.find((r) => r.id === c.registrationId)?.number ?? c.registrationId) : ' · company-wide'}`} /> },
    { key: 'username', label: 'Username', render: (c) => <span className="identifier" style={{ fontSize: 12 }}>{c.username}</span> },
    { key: 'secret', label: 'Secret', render: (c) => <span className="identifier" style={{ fontSize: 12 }}>{c.secretMasked}</span> },
    { key: 'rotatedAt', label: 'Rotated', render: (c) => <span style={{ fontSize: 12, color: '#5F6368' }}>{fmtDateTime(c.rotatedAt)}</span> },
    { key: 'expiresAt', label: 'Expires', render: (c) => <span style={{ fontSize: 12, color: c.expiresAt && c.expiresAt < new Date().toISOString() ? '#C0393F' : '#5F6368' }}>{c.expiresAt ? fmtDateTime(c.expiresAt).slice(7) : '—'}</span> },
    { key: 'access', label: 'Last access', render: (c) => { const last = c.accessLog[c.accessLog.length - 1]; return <span style={{ fontSize: 12, color: '#5F6368' }}>{last ? `${last.action} · ${last.by}` : '—'}</span>; } },
    { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
  ];
  const keyCols: Column<ApiKey>[] = [
    { key: 'name', label: 'Key', render: (k) => <TwoLine primary={k.name} secondary={<span className="identifier">{k.keyMasked}</span>} /> },
    { key: 'scopes', label: 'Scopes', render: (k) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{k.scopes.map((sc) => <span key={sc} className="chip" style={{ fontSize: 10 }}>{sc}</span>)}</div> },
    { key: 'lastUsedAt', label: 'Last used', render: (k) => <span style={{ fontSize: 12, color: '#5F6368' }}>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : 'never'}</span> },
    { key: 'expiresAt', label: 'Expires', render: (k) => <span style={{ fontSize: 12, color: '#5F6368' }}>{k.expiresAt ? fmtDateTime(k.expiresAt).slice(7) : 'never'}</span> },
    { key: 'status', label: 'Status', render: (k) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={k.status} />{k.revokedReason && <span style={{ fontSize: 11, color: '#6E6E71' }}>{k.revokedReason}</span>}</span> },
  ];
  const hookCols: Column<Webhook>[] = [
    { key: 'url', label: 'Endpoint', render: (w) => <TwoLine primary={<span className="identifier">{w.url}</span>} secondary={w.description} /> },
    { key: 'events', label: 'Events', render: (w) => <span style={{ fontSize: 12, color: '#5F6368' }}>{w.events.length} · {w.events.slice(0, 3).join(', ')}{w.events.length > 3 ? '…' : ''}</span> },
    { key: 'secret', label: 'Signing secret', render: (w) => <span className="identifier" style={{ fontSize: 12 }}>{w.secretMasked}</span> },
    { key: 'last', label: 'Last delivery', render: (w) => <span style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{w.lastDeliveryAt ? fmtDateTime(w.lastDeliveryAt) : '—'}{w.lastStatus && <Badge status={w.lastStatus === 'Success' ? 'Success' : 'Failed'} />}{w.failures > 0 && <Pill tone="critical">{w.failures} failed</Pill>}</span> },
    { key: 'status', label: 'Status', render: (w) => <Badge status={w.status === 'Paused' ? 'Hold' : w.status === 'Disabled' ? 'Inactive' : 'Active'}>{w.status}</Badge> },
  ];
  const logCols: Column<IntegrationLog>[] = [
    { key: 'at', label: 'When', render: (l) => <span style={{ fontSize: 12, color: '#5F6368', whiteSpace: 'nowrap' }}>{fmtDateTime(l.at)}</span> },
    { key: 'provider', label: 'Provider · action', render: (l) => <TwoLine primary={`${l.provider} · ${l.action}`} secondary={`${l.objectType} ${l.objectNumber ?? ''}`} /> },
    { key: 'ref', label: 'Provider ref', render: (l) => <span className="identifier" style={{ fontSize: 12 }}>{l.providerRef ?? '—'}</span> },
    { key: 'error', label: 'Error', render: (l) => <span style={{ fontSize: 12, color: '#C0393F' }}>{l.errorCode ? `${l.errorCode} · ${l.errorMessage}` : ''}</span> },
    { key: 'corr', label: 'Correlation', render: (l) => <Identifier style={{ fontSize: 11 }}>{l.correlationId}</Identifier> },
    { key: 'status', label: 'Status', render: (l) => <Badge status={l.status} /> },
  ];

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHeader title="Integrations & credentials" subtitle={`${co.legalName} · credentials are company/registration scoped, encrypted, masked and access-audited (FR-CMP-008)`}
        actions={tab === 'credentials' ? <Button variant="primary" disabled={!canEdit} reason={canEdit ? undefined : 'Requires admin.integrations.edit'} onClick={() => setCred({ provider: 'IRP', registrationId: regs[0]?.id })}>+ Add credential</Button>
          : tab === 'keys' ? <Button variant="primary" disabled={!canEdit} onClick={() => setKey({ name: '', scopes: [], expiresDays: 365 })}>+ Create API key</Button>
          : tab === 'webhooks' ? <Button variant="primary" disabled={!canEdit} onClick={() => setHook({ url: 'https://', events: [], status: 'Active' })}>+ Add webhook</Button> : undefined} />
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'credentials', label: 'Provider credentials', count: creds.length }, { id: 'keys', label: 'API keys', count: keys.length }, { id: 'webhooks', label: 'Webhooks', count: hooks.length }, { id: 'log', label: 'Integration log', count: logs.length }]} />
      {tab === 'credentials' && (
        <DataTable rows={creds} columns={credCols} emptyTitle="No provider credentials" emptyDescription="Add IRP, e-Way bill, GSTN, bank or messaging credentials scoped to a registration." rowActions={(c) => [
          { label: 'Rotate secret', onClick: () => setRotate(c), disabled: !canEdit || c.status === 'Revoked' },
          { label: 'Access log', onClick: () => setCred({ ...c, secret: undefined }) },
          { label: 'Revoke', onClick: () => setRevoke({ kind: 'cred', id: c.id, label: c.label }), disabled: !canEdit || c.status === 'Revoked', danger: true, separator: true },
        ]} />
      )}
      {tab === 'keys' && <DataTable rows={keys} columns={keyCols} emptyTitle="No API keys" rowActions={(k) => [{ label: 'Revoke', onClick: () => setRevoke({ kind: 'key', id: k.id, label: k.name }), disabled: !canEdit || k.status === 'Revoked', danger: true }]} />}
      {tab === 'webhooks' && <DataTable rows={hooks} columns={hookCols} emptyTitle="No webhooks" onRowClick={(w) => setHook({ ...w })} rowActions={(w) => [
        { label: 'Edit', onClick: () => setHook({ ...w }), disabled: !canEdit },
        { label: 'Send test event', onClick: () => testSend(w) },
        { label: w.status === 'Active' ? 'Pause' : 'Resume', onClick: () => { db.update<Webhook>(C.webhooks, w.id, { status: w.status === 'Active' ? 'Paused' : 'Active', failures: w.status === 'Active' ? w.failures : 0 }); engine.audit({ action: w.status === 'Active' ? 'webhook.paused' : 'webhook.resumed', objectType: 'Webhook', objectId: w.id, objectNumber: w.url }); }, disabled: !canEdit },
        { label: 'Disable', onClick: () => { db.update<Webhook>(C.webhooks, w.id, { status: 'Disabled' }); engine.audit({ action: 'webhook.disabled', objectType: 'Webhook', objectId: w.id, objectNumber: w.url, sensitive: true }); }, disabled: !canEdit || w.status === 'Disabled', danger: true, separator: true },
      ]} />}
      {tab === 'log' && <DataTable rows={logs} columns={logCols} emptyTitle="No integration calls yet" emptyDescription="e-Invoice, e-Way bill, bank and webhook calls appear here with request/response payloads." onRowClick={(l) => setLog(l)} rowActions={(l) => [{ label: 'View request / response', onClick: () => setLog(l) }, { label: 'Retry', onClick: () => retry(l), disabled: !(l.status === 'Failed' || l.status === 'Timeout' || l.status === 'Rejected'), reason: 'Only failed or rejected calls can be retried' }]} />}

      {/* Credential drawer (add or access log) */}
      <Drawer open={!!cred} onClose={() => setCred(null)} title={cred?.id ? cred.label ?? '' : 'Add provider credential'} subtitle={cred?.id ? `${cred.provider} · rotated ${fmtDateTime(cred.rotatedAt)}` : 'Secrets are encrypted at rest and shown masked afterwards'} width={560} footer={!cred?.id ? <><Button variant="secondary" onClick={() => setCred(null)}>Discard</Button><Button variant="primary" onClick={saveCred}>Store credential</Button></> : undefined}>
        {cred && !cred.id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="grid-2">
              <SelectField label="Provider" value={cred.provider ?? 'IRP'} onChange={(v) => setCred({ ...cred, provider: v as ProviderCredential['provider'] })} options={PROVIDERS} />
              <SelectField label="Scope (registration)" value={cred.registrationId ?? ''} onChange={(v) => setCred({ ...cred, registrationId: v })} options={regs.map((r) => ({ value: r.id, label: `${r.number} · ${r.state ?? ''}` }))} allowEmpty placeholder="Company-wide" />
            </div>
            <TextField label="Label" required value={cred.label ?? ''} onChange={(v) => setCred({ ...cred, label: v })} placeholder="IRP · Maharashtra" />
            <div className="grid-2">
              <TextField label="Username / client ID" required value={cred.username ?? ''} onChange={(v) => setCred({ ...cred, username: v })} />
              <TextField label="Secret / password" required type="password" value={cred.secret ?? ''} onChange={(v) => setCred({ ...cred, secret: v })} />
            </div>
            <TextField label="Expires (optional)" type="date" value={cred.expiresAt ?? ''} onChange={(v) => setCred({ ...cred, expiresAt: v })} />
            <Banner tone="info">The secret is never displayed after saving. Rotation and every worker access are written to the access log and audit.</Banner>
          </div>
        )}
        {cred?.id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <KV items={[{ k: 'Username', v: cred.username }, { k: 'Secret', v: cred.secretMasked }, { k: 'Status', v: <Badge status={cred.status} /> }, { k: 'Expires', v: cred.expiresAt ? fmtDateTime(cred.expiresAt) : '—' }]} />
            <div className="section-label">Access log</div>
            <table className="data-table dense"><thead><tr><th>When</th><th>By</th><th>Action</th></tr></thead><tbody>{(cred.accessLog ?? []).slice().reverse().map((a, i) => <tr key={i}><td style={{ fontSize: 12 }}>{fmtDateTime(a.at)}</td><td>{a.by}</td><td>{a.action}</td></tr>)}</tbody></table>
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={!!rotate} onClose={() => setRotate(null)} title={`Rotate secret for ${rotate?.label}?`} statement="A new secret is generated and the old one stops working immediately. Update the provider portal to match." consequences={[{ engine: 'Statutory', text: 'In-flight submissions using the old secret will fail and need retry', tone: 'warning' }]} reasonRequired confirmLabel="Rotate secret" cancelLabel="Keep current secret" onConfirm={doRotate} />
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} title={`Revoke ${revoke?.label}?`} statement="Revocation is immediate and permanent; create a new credential or key to restore access." consequences={[{ engine: 'Workflow', text: 'Any integration using it starts failing with AUTH_REVOKED', tone: 'danger' }]} reasonRequired confirmLabel="Revoke" cancelLabel="Keep active" danger onConfirm={doRevoke} />

      {/* API key create */}
      <Drawer open={!!key} onClose={() => setKey(null)} title="Create API key" subtitle="The full key is shown exactly once." width={520} footer={<><Button variant="secondary" onClick={() => setKey(null)}>Discard</Button><Button variant="primary" onClick={createKey}>Create key</Button></>}>
        {key && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Name" required value={key.name} onChange={(v) => setKey({ ...key, name: v })} placeholder="e.g. warehouse-sync" autoFocus />
            <ChipGroup label="Scopes" multiple value={key.scopes} onChange={(v: string[]) => setKey({ ...key, scopes: v })} options={API_SCOPES} />
            <SelectField label="Expires" value={String(key.expiresDays)} onChange={(v) => setKey({ ...key, expiresDays: Number(v) })} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }, { value: '0', label: 'Never' }]} />
            <div style={{ fontSize: 12, color: '#6E6E71' }}>Keys carry the same entitlement and permission checks as the UI (FR-PLT-004, FR-IAM-005).</div>
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!shown} onClose={() => setShown(null)} title={shown?.name ?? ''} statement="Copy this secret now — it is stored hashed and cannot be shown again." confirmLabel="I have copied it" cancelLabel="Close" onConfirm={() => setShown(null)}>
        {shown && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}><code style={{ flex: 1, padding: '10px 12px', background: '#F3F5F5', borderRadius: 8, fontSize: 13, wordBreak: 'break-all' }}>{shown.key}</code><Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(shown.key); toast.success('Copied'); }}>Copy</Button></div>}
      </ConfirmDialog>

      {/* Webhook drawer */}
      <Drawer open={!!hook} onClose={() => setHook(null)} title={hook?.id ? 'Edit webhook' : 'Add webhook'} subtitle="Events publish through a transactional outbox; deliveries are signed with the secret (FRD §21.2)." width={600} footer={<><Button variant="secondary" onClick={() => setHook(null)}>Discard</Button><Button variant="primary" onClick={saveHook} disabled={!canEdit}>Save webhook</Button></>}>
        {hook && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Endpoint URL" required value={hook.url ?? ''} onChange={(v) => setHook({ ...hook, url: v })} placeholder="https://…" />
            <TextArea label="Description" value={hook.description ?? ''} onChange={(v) => setHook({ ...hook, description: v })} rows={2} />
            <ChipGroup label="Events" multiple value={hook.events ?? []} onChange={(v: string[]) => setHook({ ...hook, events: v })} options={DOMAIN_EVENTS} />
            {hook.id && <KV items={[{ k: 'Signing secret', v: hook.secretMasked }, { k: 'Status', v: hook.status }, { k: 'Failures', v: hook.failures }]} />}
          </div>
        )}
      </Drawer>

      {/* Integration log detail */}
      <Drawer open={!!log} onClose={() => setLog(null)} title={log ? `${log.provider} · ${log.action}` : ''} subtitle={log ? `${fmtDateTime(log.at)} · ${log.objectType} ${log.objectNumber ?? ''}` : ''} width={640} headerRight={log && <Badge status={log.status} />}
        footer={log && (log.status === 'Failed' || log.status === 'Timeout' || log.status === 'Rejected') ? <><span style={{ fontSize: 12, color: '#6E6E71' }}>Retry reuses idempotency key {log.idempotencyKey}</span><Button variant="primary" onClick={() => retry(log)}>Retry</Button></> : undefined}>
        {log && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <KV items={[{ k: 'Correlation ID', v: <span style={{ display: 'inline-flex', gap: 8 }}><Identifier>{log.correlationId}</Identifier><button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(log.correlationId)}>Copy</button></span> }, { k: 'Idempotency key', v: <Identifier>{log.idempotencyKey}</Identifier> }, { k: 'Fingerprint', v: <Identifier>{log.requestFingerprint}</Identifier> }, { k: 'Provider ref', v: log.providerRef ?? '—' }, { k: 'Error', v: log.errorCode ? `${log.errorCode} · ${log.errorMessage}` : '—' }]} />
            <div><div className="section-label" style={{ marginBottom: 4 }}>Request</div><pre style={{ background: '#F9FBFC', padding: 10, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(log.request, null, 2)}</pre></div>
            <div><div className="section-label" style={{ marginBottom: 4 }}>Response</div><pre style={{ background: '#F9FBFC', padding: 10, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 200 }}>{log.response ? JSON.stringify(log.response, null, 2) : '— no response (timeout)'}</pre></div>
            <MaskedValue value={log.idempotencyKey} canReveal={false} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
