// Jobs & exports (FRD §20, FR-RPT-008, FR-IMP-001): background job monitor (retry / dead-letter / replay with permission),
// export jobs (Queued → Running → Ready simulation, expiry, download), import log with error rows.
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { BackgroundJob, ExportJob, ImportJob } from '../../store';
import { fmtDateTime, toCSV, downloadText, addDays, today } from '../../lib/format';
import { PageHeader, Button, Badge, Drawer, KV, Tabs, TwoLine, Identifier, useToast, DataTable, Pill, ConfirmDialog, Banner } from '../../components/ui';
import type { Column } from '../../components/ui';

type Tab = 'jobs' | 'exports' | 'imports';

export default function Jobs({ initialTab }: { initialTab?: string }) {
  const s = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>((['jobs', 'exports', 'imports'].includes(initialTab ?? '') ? initialTab : 'jobs') as Tab);
  const jobs = useCollection<BackgroundJob>(C.jobs).filter((j) => j.companyId === s.state.companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const exportsRows = useCollection<ExportJob>(C.exportJobs).filter((j) => j.companyId === s.state.companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const imports = useCollection<ImportJob>(C.importJobs).filter((j) => j.companyId === s.state.companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [job, setJob] = useState<BackgroundJob | null>(null);
  const [imp, setImp] = useState<ImportJob | null>(null);
  const [replay, setReplay] = useState<BackgroundJob | null>(null);
  const canReplay = s.can('admin.jobs.edit') || s.can('admin.jobs.*') || s.isTenantOwner;

  const runJob = (j: BackgroundJob, forceFail = false) => {
    const now = new Date().toISOString();
    db.update<BackgroundJob>(C.jobs, j.id, { status: 'Running', attempts: j.attempts + 1, startedAt: now });
    setTimeout(() => {
      const fail = forceFail || /timeout|fail/i.test(j.lastError ?? '') && j.attempts + 1 < j.maxAttempts && j.type === 'gstr';
      const dead = fail && j.attempts + 1 >= j.maxAttempts;
      db.update<BackgroundJob>(C.jobs, j.id, { status: fail ? (dead ? 'Dead-letter' : 'Retrying') : 'Completed', finishedAt: new Date().toISOString(), lastError: fail ? j.lastError ?? 'Provider error' : undefined });
      if (!fail && j.type === 'export' && j.payload?.exportJobId) {
        const e = db.find<ExportJob>(C.exportJobs, String(j.payload.exportJobId));
        if (e) db.update<ExportJob>(C.exportJobs, e.id, { status: 'Ready', readyAt: new Date().toISOString(), expiresAt: addDays(today(), 7) });
        engine.notify({ type: 'export', title: `Export ready: ${e?.name ?? j.name}`, body: `${e?.rows ?? ''} rows · expires in 7 days`, link: 'admin/jobs?tab=exports' });
      }
      engine.audit({ action: fail ? (dead ? 'job.dead_lettered' : 'job.failed') : 'job.completed', objectType: 'Job', objectId: j.id, objectNumber: j.name, result: fail ? 'Failure' : 'Success', correlationId: j.correlationId, detail: fail ? j.lastError : undefined, channel: 'worker' });
    }, 600);
  };
  const doReplay = (reason: string) => {
    if (!replay) return;
    engine.audit({ action: 'job.replayed', objectType: 'Job', objectId: replay.id, objectNumber: replay.name, detail: `${reason} · idempotency ${replay.idempotencyKey}`, correlationId: replay.correlationId, sensitive: true });
    db.update<BackgroundJob>(C.jobs, replay.id, { attempts: 0, maxAttempts: replay.maxAttempts + 1, lastError: undefined });
    runJob({ ...replay, attempts: 0, lastError: undefined });
    toast.success('Job replayed with the same idempotency key');
  };
  const runExport = (e: ExportJob) => {
    db.update<ExportJob>(C.exportJobs, e.id, { status: 'Running' });
    setTimeout(() => { db.update<ExportJob>(C.exportJobs, e.id, { status: 'Ready', readyAt: new Date().toISOString(), expiresAt: addDays(today(), 7) }); engine.notify({ type: 'export', title: `Export ready: ${e.name}`, body: `${e.rows} rows · ${e.format} · expires in 7 days`, link: 'admin/jobs?tab=exports' }); }, 800);
  };
  const download = (e: ExportJob) => {
    if (e.status !== 'Ready') { toast.error(e.status === 'Expired' ? 'This export has expired — request it again from the register' : 'Not ready yet'); return; }
    const sample = Array.from({ length: Math.min(e.rows, 25) }).map((_, i) => ({ row: i + 1, entity: e.entity, scope: e.scope, masked: e.masked ? 'yes' : 'no' }));
    downloadText(`${e.name}.${e.format === 'PDF' ? 'txt' : 'csv'}`, toCSV(sample));
    engine.audit({ action: 'export.downloaded', objectType: 'Export', objectId: e.id, objectNumber: e.name, detail: `${e.rows} rows · ${e.format} · ${e.masked ? 'masked' : 'unmasked'} · filters ${JSON.stringify(e.filters)}` });
  };

  const jobCols: Column<BackgroundJob>[] = [
    { key: 'name', label: 'Job', render: (j) => <TwoLine primary={j.name} secondary={`${j.type} · ${j.correlationId}`} mono /> },
    { key: 'attempts', label: 'Attempts', render: (j) => <span style={{ fontFeatureSettings: '"tnum" 1' }}>{j.attempts} / {j.maxAttempts}</span> },
    { key: 'startedAt', label: 'Started', render: (j) => <span style={{ fontSize: 12, color: '#5F6368' }}>{j.startedAt ? fmtDateTime(j.startedAt) : '—'}</span> },
    { key: 'finishedAt', label: 'Finished', render: (j) => <span style={{ fontSize: 12, color: '#5F6368' }}>{j.finishedAt ? fmtDateTime(j.finishedAt) : '—'}</span> },
    { key: 'lastError', label: 'Last error', render: (j) => <span style={{ fontSize: 12, color: '#C0393F' }}>{j.lastError ?? ''}</span> },
    { key: 'status', label: 'Status', render: (j) => <Badge status={j.status} /> },
  ];
  const expCols: Column<ExportJob>[] = [
    { key: 'name', label: 'Export', render: (e) => <TwoLine primary={e.name} secondary={`${e.entity} · ${e.format} · ${e.scope}`} /> },
    { key: 'rows', label: 'Rows', align: 'right', render: (e) => e.rows.toLocaleString('en-IN') },
    { key: 'filters', label: 'Filters', render: (e) => <span style={{ fontSize: 11, color: '#5F6368' }} className="identifier">{JSON.stringify(e.filters)}</span> },
    { key: 'requestedBy', label: 'Requested by', render: (e) => <TwoLine primary={e.requestedBy} secondary={fmtDateTime(e.createdAt)} /> },
    { key: 'expiresAt', label: 'Expires', render: (e) => <span style={{ fontSize: 12, color: e.status === 'Expired' ? '#C0393F' : '#5F6368' }}>{e.expiresAt ? fmtDateTime(e.expiresAt) : '—'}</span> },
    { key: 'masked', label: 'Masking', render: (e) => (e.masked ? <Pill tone="warning">masked</Pill> : <Pill tone="neutral">full</Pill>) },
    { key: 'status', label: 'Status', render: (e) => <Badge status={e.status} /> },
  ];
  const impCols: Column<ImportJob>[] = [
    { key: 'entity', label: 'Import', render: (i) => <TwoLine primary={`${i.entity} · ${i.fileName}`} secondary={`${i.fingerprint} · by ${i.by}`} mono /> },
    { key: 'rows', label: 'Rows', align: 'right' },
    { key: 'valid', label: 'Valid', align: 'right', render: (i) => <span style={{ color: '#12784E' }}>{i.valid}</span> },
    { key: 'errors', label: 'Errors', align: 'right', render: (i) => <span style={{ color: i.errors ? '#C0393F' : undefined }}>{i.errors}</span> },
    { key: 'duplicates', label: 'Duplicates', align: 'right', render: (i) => <span style={{ color: i.duplicates ? '#8A4B0F' : undefined }}>{i.duplicates}</span> },
    { key: 'committedAt', label: 'Committed', render: (i) => <span style={{ fontSize: 12, color: '#5F6368' }}>{i.committedAt ? fmtDateTime(i.committedAt) : '—'}</span> },
    { key: 'status', label: 'Status', render: (i) => <Badge status={i.status} /> },
  ];

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHeader title="Jobs & exports" subtitle={`${jobs.filter((j) => j.status === 'Dead-letter').length} dead-lettered · ${exportsRows.filter((e) => e.status === 'Ready').length} exports ready · ${imports.length} imports logged`} />
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'jobs', label: 'Background jobs', count: jobs.length }, { id: 'exports', label: 'Export jobs', count: exportsRows.length }, { id: 'imports', label: 'Import log', count: imports.length }]} />
      {tab === 'jobs' && <DataTable rows={jobs} columns={jobCols} emptyTitle="No background jobs" onRowClick={(j) => setJob(j)} rowClass={(j) => (j.status === 'Dead-letter' ? 'error-row' : undefined)} rowActions={(j) => [
        { label: 'Details', onClick: () => setJob(j) },
        { label: 'Run now', onClick: () => runJob(j), disabled: !(j.status === 'Queued' || j.status === 'Retrying'), reason: 'Only queued / retrying jobs' },
        { label: 'Replay (dead-letter)', onClick: () => setReplay(j), disabled: j.status !== 'Dead-letter' || !canReplay, reason: j.status !== 'Dead-letter' ? 'Only dead-lettered jobs' : canReplay ? undefined : 'Requires admin.jobs.edit', danger: true, separator: true },
      ]} />}
      {tab === 'exports' && <DataTable rows={exportsRows} columns={expCols} emptyTitle="No export jobs" emptyDescription="Registers with more than 500 rows export asynchronously and land here (FR-RPT-008)." rowActions={(e) => [
        { label: 'Download', onClick: () => download(e), disabled: e.status !== 'Ready', reason: e.status === 'Expired' ? 'Expired' : e.status !== 'Ready' ? 'Not ready' : undefined },
        { label: 'Run now', onClick: () => runExport(e), disabled: e.status !== 'Queued', reason: 'Only queued exports' },
        { label: 'Request again', onClick: () => { const n = db.insert<ExportJob>(C.exportJobs, { ...e, id: undefined, createdAt: undefined, updatedAt: undefined, version: undefined, status: 'Queued', readyAt: undefined, expiresAt: addDays(today(), 7), requestedBy: s.user?.name ?? e.requestedBy } as any); engine.audit({ action: 'export.queued', objectType: 'Export', objectId: n.id, objectNumber: n.name }); toast.success('Export queued'); }, disabled: e.status !== 'Expired' && e.status !== 'Failed' },
      ]} />}
      {tab === 'imports' && <DataTable rows={imports} columns={impCols} emptyTitle="No imports yet" onRowClick={(i) => setImp(i)} rowActions={(i) => [{ label: 'Error rows', onClick: () => setImp(i) }, { label: 'Download errors (CSV)', onClick: () => downloadText(`${i.fileName}-errors.csv`, toCSV(i.errorRows)), disabled: !i.errorRows.length }]} />}

      <Drawer open={!!job} onClose={() => setJob(null)} title={job?.name ?? ''} subtitle={job ? `${job.type} · ${job.status}` : ''} width={560} headerRight={job && <Badge status={job.status} />}
        footer={job && job.status === 'Dead-letter' ? <><span style={{ fontSize: 12, color: '#6E6E71' }}>Replay requires admin.jobs.edit</span><Button variant="danger" onClick={() => setReplay(job)} disabled={!canReplay}>Replay job</Button></> : job && (job.status === 'Queued' || job.status === 'Retrying') ? <><span /><Button variant="primary" onClick={() => { runJob(job); setJob(null); }}>Run now</Button></> : undefined}>
        {job && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {job.status === 'Dead-letter' && <Banner tone="danger">Dead-lettered after {job.attempts} attempts: {job.lastError}. Replay re-runs with the same idempotency key so the effect cannot duplicate (FRD §20).</Banner>}
            <KV items={[{ k: 'Correlation', v: <Identifier>{job.correlationId}</Identifier> }, { k: 'Idempotency', v: <Identifier>{job.idempotencyKey ?? '—'}</Identifier> }, { k: 'Attempts', v: `${job.attempts} / ${job.maxAttempts}` }, { k: 'Started', v: job.startedAt ? fmtDateTime(job.startedAt) : '—' }, { k: 'Finished', v: job.finishedAt ? fmtDateTime(job.finishedAt) : '—' }, { k: 'Last error', v: job.lastError ?? '—' }]} />
            <div><div className="section-label" style={{ marginBottom: 4 }}>Payload</div><pre style={{ background: '#F9FBFC', padding: 10, borderRadius: 8, fontSize: 11, overflow: 'auto' }}>{JSON.stringify(job.payload ?? {}, null, 2)}</pre></div>
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!replay} onClose={() => setReplay(null)} title={`Replay ${replay?.name}?`} statement="The job re-runs with its original idempotency key; a provider that already accepted the request returns the same result." consequences={[{ engine: 'Workflow', text: 'Attempts reset; the job goes back to Running', tone: 'warning' }, { engine: 'Notification', text: 'Audited as a sensitive operator action' }]} reasonRequired confirmLabel="Replay job" cancelLabel="Leave dead-lettered" danger onConfirm={doReplay} />
      <Drawer open={!!imp} onClose={() => setImp(null)} title={imp ? `${imp.entity} · ${imp.fileName}` : ''} subtitle={imp ? `${imp.rows} rows · ${imp.valid} valid · ${imp.errors} errors · ${imp.duplicates} duplicates · ${imp.status}` : ''} width={680}>
        {imp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <KV items={[{ k: 'Fingerprint', v: <Identifier>{imp.fingerprint}</Identifier> }, { k: 'By', v: imp.by }, { k: 'Committed', v: imp.committedAt ? fmtDateTime(imp.committedAt) : 'not committed' }]} />
            {imp.errorRows.length === 0 ? <div style={{ fontSize: 13, color: '#12784E' }}>No row errors.</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="section-title" style={{ marginBottom: 0 }}>Row errors</div><Button size="sm" variant="secondary" onClick={() => downloadText(`${imp.fileName}-errors.csv`, toCSV(imp.errorRows))}>Download errors (CSV)</Button></div>
                <table className="data-table dense"><thead><tr><th>Row</th><th>Field</th><th>Code</th><th>Message</th></tr></thead><tbody>{imp.errorRows.map((e, i) => <tr key={i} className="error-row"><td>{e.row}</td><td>{e.field}</td><td className="identifier">{e.code}</td><td style={{ color: '#C0393F' }}>{e.message}</td></tr>)}</tbody></table>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
