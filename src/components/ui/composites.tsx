// Module shell, page header, import wizard, checklist, period banner.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db, C, engine, nav, useRoute, useSession } from '../../store';
import type { ImportJob } from '../../store';
import { Button, Badge, Meter, Banner, SummaryBlock } from './primitives';
import { Drawer } from './overlays';
import { CheckboxField, SelectField } from './fields';
import { toCSV, downloadText } from '../../lib/format';

// ── Module shell with left sub-nav (design §6.2 / register anatomy) ────────

export interface SubNavItem { id: string; label: string; group?: string; badge?: number; hidden?: boolean }

export function ModuleShell({ module, title, items, children, defaultSub }: { module: string; title: string; items: SubNavItem[]; children: (sub: string) => ReactNode; defaultSub?: string }) {
  const route = useRoute();
  const visible = items.filter((i) => !i.hidden);
  const sub = route.sub || defaultSub || visible[0]?.id || '';
  const groups = Array.from(new Set(visible.map((i) => i.group ?? '')));
  // Sub-nav items may nest ("consolidation/runs"); highlight the deepest match.
  const path = route.path.startsWith(`${module}/`) ? route.path.slice(module.length + 1) : route.path;
  const matches = (id: string) => path === id || path.startsWith(`${id}/`);
  const isActive = (id: string) => (id.includes('/') ? matches(id) : sub === id && !visible.some((x) => x.id !== id && x.id.startsWith(`${id}/`) && matches(x.id)));
  const navRef = useRef<HTMLElement>(null);
  // on phones the sub-nav is a horizontal chip strip — scroll the active chip into view
  useEffect(() => {
    const el = navRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const active = el.querySelector<HTMLElement>('.nav-item.active');
    if (active) el.scrollTo({ left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
  }, [route.path]);
  return (
    <div className="module-shell">
      <nav className="sub-nav" ref={navRef}>
        <div className="section-label" style={{ padding: '4px 12px 8px', fontSize: 12, color: '#0A0A0A', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{title}</div>
        {groups.map((g) => (
          <div key={g}>
            {g && <div className="section-label group-label">{g}</div>}
            {visible.filter((i) => (i.group ?? '') === g).map((i) => (
              <button key={i.id} type="button" className={`nav-item ${isActive(i.id) ? 'active' : ''}`} style={{ width: '100%', border: 'none', textAlign: 'left', background: isActive(i.id) ? undefined : 'transparent' }} onClick={() => nav.go(`${module}/${i.id}`)}>
                <span style={{ flex: 1 }}>{i.label}</span>
                {i.badge !== undefined && i.badge > 0 && <span style={{ background: '#325CFF', color: '#fff', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '0 6px', minWidth: 18, textAlign: 'center', lineHeight: '18px' }}>{i.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="module-content">{children(sub)}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { label: string; path: string } }) {
  return (
    <div className="page-header">
      <div>
        {back && <button type="button" className="btn-link" style={{ color: '#5F6368', marginBottom: 6 }} onClick={() => nav.go(back.path)}>← {back.label}</button>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Standard scope line: company · branch · period · currency · freshness (FR-RPT-006). */
export function ScopeLine({ extra, asOf }: { extra?: ReactNode; asOf?: string }) {
  const s = useSession();
  return (
    <span>
      {s.company?.tradeName ?? s.company?.legalName} · {s.branch?.name ?? 'All branches'} · {s.period?.label ?? s.state.periodCode} · {s.currency}{extra ? <> · {extra}</> : null} · Updated {asOf ?? new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

/** Warning banner when the current period is locked for the given date. */
export function PeriodBanner({ date }: { date?: string }) {
  const s = useSession();
  const check = useMemo(() => engine.postingCheck(date ?? new Date().toISOString().slice(0, 10)), [date, s.state.companyId]);
  if (check.ok) return null;
  return <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('admin/periods')}>Request reopen</Button>}>{check.reason}</Banner>;
}

// ── Checklist (design §7.15) ──────────────────────────────────────────────

export interface ChecklistRow { id: string; label: string; status: 'Done' | 'Pending' | 'Blocked' | 'Warning'; detail?: ReactNode; count?: number; link?: string; onClick?: () => void }

export function Checklist({ title, rows, action }: { title?: ReactNode; rows: ChecklistRow[]; action?: ReactNode }) {
  const done = rows.filter((r) => r.status === 'Done').length;
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {(title || action) && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #EFEFEF' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', rowGap: 6, marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#5F6368' }}>{done} of {rows.length} complete {action}</div>
          </div>
          <Meter value={done} max={rows.length} tone={done === rows.length ? 'good' : undefined} />
        </div>
      )}
      {rows.map((r) => (
        <div key={r.id} className="checklist-row" style={{ cursor: r.link || r.onClick ? 'pointer' : undefined }} onClick={() => (r.onClick ? r.onClick() : r.link ? nav.go(r.link) : undefined)}>
          <span style={{ width: 20, textAlign: 'center' }}>{r.status === 'Done' ? '✓' : r.status === 'Blocked' ? '⛔' : r.status === 'Warning' ? '⚠' : '○'}</span>
          <span style={{ flex: 1 }}>
            {r.label}
            {r.detail && <div style={{ fontSize: 12, color: r.status === 'Blocked' ? '#C0393F' : '#6E6E71' }}>{r.detail}</div>}
          </span>
          {r.count !== undefined && r.count > 0 && <span style={{ background: '#F3F3F5', borderRadius: 9999, padding: '0 6px', fontSize: 11 }}>{r.count}</span>}
          <Badge status={r.status === 'Done' ? 'Posted' : r.status === 'Blocked' ? 'Rejected' : r.status === 'Warning' ? 'Returned' : 'Draft'}>{r.status}</Badge>
          {(r.link || r.onClick) && <span style={{ color: '#B0B5BF' }}>›</span>}
        </div>
      ))}
    </div>
  );
}

// ── Import wizard (design §6.5 / §7.16, FR-MDM-003, FR-IMP-001) ───────────

export interface ImportField { key: string; label: string; required?: boolean; validate?: (v: string, row: Record<string, string>) => string | null; type?: 'text' | 'number' | 'date' }

export interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  entity: string;
  fields: ImportField[];
  /** unique-key fields used to detect duplicates against existing rows */
  duplicateKeys?: string[];
  existing?: Record<string, any>[];
  onCommit: (rows: Record<string, string>[]) => void | number;
  sampleRows?: Record<string, string>[];
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => {
    const out: string[] = [];
    let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => { const vals = split(l); return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])); });
}

function fingerprint(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'fp_' + (h >>> 0).toString(16);
}

export function ImportWizard({ open, onClose, entity, fields, duplicateKeys = [], existing = [], onCommit, sampleRows }: ImportWizardProps) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importValidOnly, setImportValidOnly] = useState(false);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [fp, setFp] = useState('');
  const s = useSession();
  const reset = () => { setStep(0); setRaw([]); setHeaders([]); setMapping({}); setFixes({}); setFileName(''); setImportValidOnly(false); };
  const close = () => { reset(); onClose(); };
  const load = (text: string, name: string) => {
    const rows = parseCSV(text);
    setRaw(rows);
    setFileName(name);
    setFp(fingerprint(text));
    const hs = rows.length ? Object.keys(rows[0]) : [];
    setHeaders(hs);
    const auto: Record<string, string> = {};
    fields.forEach((f) => { const m = hs.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === f.label.toLowerCase().replace(/[^a-z0-9]/g, '') || h.toLowerCase() === f.key.toLowerCase()); if (m) auto[f.key] = m; });
    setMapping(auto);
    setStep(1);
  };
  const mapped = useMemo(() => raw.map((r, i) => { const o: Record<string, string> = {}; fields.forEach((f) => { o[f.key] = fixes[`${i}:${f.key}`] ?? (mapping[f.key] ? r[mapping[f.key]] ?? '' : ''); }); return o; }), [raw, mapping, fields, fixes]);
  const analysis = useMemo(() => {
    const errors: { row: number; field: string; code: string; message: string }[] = [];
    const dupes: { row: number; match: any }[] = [];
    const seen = new Set<string>();
    mapped.forEach((r, i) => {
      fields.forEach((f) => {
        const v = r[f.key];
        if (f.required && !v) errors.push({ row: i + 1, field: f.label, code: 'REQUIRED', message: `${f.label} is required` });
        else if (v && f.type === 'number' && isNaN(Number(v))) errors.push({ row: i + 1, field: f.label, code: 'FORMAT', message: `${f.label} must be a number` });
        else if (v && f.validate) { const e = f.validate(v, r); if (e) errors.push({ row: i + 1, field: f.label, code: 'INVALID', message: e }); }
      });
      if (duplicateKeys.length) {
        const key = duplicateKeys.map((k) => (r[k] ?? '').toLowerCase()).join('|');
        if (key.replace(/\|/g, '')) {
          if (seen.has(key)) errors.push({ row: i + 1, field: duplicateKeys.join('/'), code: 'DUP_IN_FILE', message: 'Duplicate of an earlier row in this file' });
          seen.add(key);
          const match = existing.find((e) => duplicateKeys.map((k) => String(e[k] ?? '').toLowerCase()).join('|') === key);
          if (match) dupes.push({ row: i + 1, match });
        }
      }
    });
    const errRows = new Set(errors.map((e) => e.row));
    const dupRows = new Set(dupes.map((d) => d.row));
    return { errors, dupes, valid: mapped.length - new Set([...errRows, ...dupRows]).size, errRows, dupRows };
  }, [mapped, fields, duplicateKeys, existing]);
  const prior = db.get<ImportJob>(C.importJobs).find((j) => j.fingerprint === fp && j.status === 'Committed');
  const commit = () => {
    const rows = mapped.filter((_, i) => !analysis.errRows.has(i + 1) && !analysis.dupRows.has(i + 1));
    const n = onCommit(rows);
    db.insert<ImportJob>(C.importJobs, { entity, fileName, fingerprint: fp, rows: mapped.length, valid: rows.length, errors: analysis.errors.length, duplicates: analysis.dupes.length, status: 'Committed', errorRows: analysis.errors, committedAt: new Date().toISOString(), by: s.user?.name ?? 'system' });
    engine.audit({ action: 'import.committed', objectType: entity, detail: `${fileName}: ${typeof n === 'number' ? n : rows.length} rows imported, ${analysis.errors.length} errors, ${analysis.dupes.length} duplicates skipped` });
    engine.notify({ type: 'import', title: `Import complete: ${entity}`, body: `${rows.length} rows imported from ${fileName}` });
    close();
  };
  const downloadTemplate = () => downloadText(`${entity.toLowerCase().replace(/\s+/g, '-')}-template.csv`, toCSV(sampleRows ?? [Object.fromEntries(fields.map((f) => [f.label, '']))], fields.map((f) => ({ key: f.label, label: f.label }))));
  const steps = ['Upload', 'Map columns', 'Dry-run', 'Commit'];
  return (
    <Drawer open={open} onClose={close} title={`Import ${entity}`} subtitle={steps.map((st, i) => (i === step ? `● ${st}` : `○ ${st}`)).join('   ')} width={820}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel import</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
            {step === 1 && <Button variant="primary" onClick={() => setStep(2)} disabled={fields.some((f) => f.required && !mapping[f.key])}>Run dry-run</Button>}
            {step === 2 && <Button variant="primary" onClick={() => setStep(3)} disabled={!!prior || analysis.valid === 0}>Review commit</Button>}
            {step === 3 && <Button variant="primary" onClick={commit} disabled={!!prior || (analysis.errors.length + analysis.dupes.length > 0 && !importValidOnly)}>Import {importValidOnly ? analysis.valid : mapped.length} rows</Button>}
          </div>
        </>
      }
    >
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ border: '2px dashed #DADCE0', borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer', color: '#5F6368' }}>
            <input type="file" accept=".csv,.txt,.xlsx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then((t) => load(t, f.name)); }} />
            <div style={{ fontSize: 28 }}>📥</div>
            <div style={{ fontSize: 14, color: '#0A0A0A', fontWeight: 500 }}>Drop a CSV here or click to choose</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>UTF-8 CSV · first row must be column headers · max 10,000 rows per file</div>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
            {sampleRows && <Button variant="ghost" onClick={() => load(toCSV(sampleRows, fields.map((f) => ({ key: f.label, label: f.label }))), 'sample.csv')}>Load sample data</Button>}
          </div>
          <div className="banner info">Every import runs a dry-run first. Nothing is written until you commit, and re-importing the same file is blocked.</div>
        </div>
      )}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 13, color: '#5F6368', marginBottom: 12 }}>{fileName} · {raw.length} rows · map each field to a column in your file.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fields.map((f) => (
              <SelectField key={f.key} label={f.label} required={f.required} value={mapping[f.key] ?? ''} onChange={(v) => setMapping({ ...mapping, [f.key]: v })} options={headers.map((h) => ({ value: h, label: h }))} placeholder="— Not mapped —" size="sm" />
            ))}
          </div>
        </div>
      )}
      {(step === 2 || step === 3) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {prior && <Banner tone="danger">This exact file was already imported on {prior.committedAt?.slice(0, 10)} by {prior.by}. Re-import is blocked — change the file to retry.</Banner>}
          <SummaryBlock items={[{ label: 'Rows', value: mapped.length }, { label: 'Valid', value: analysis.valid, tone: 'good' }, { label: 'Errors', value: analysis.errors.length, tone: analysis.errors.length ? 'danger' : undefined }, { label: 'Duplicates', value: analysis.dupes.length, tone: analysis.dupes.length ? 'warn' : undefined }]} />
          {analysis.errors.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Row errors — fix in place or download</div>
                <Button size="sm" variant="secondary" onClick={() => downloadText('import-errors.csv', toCSV(analysis.errors))}>Download errors (CSV)</Button>
              </div>
              <div className="card" style={{ overflow: 'auto', maxHeight: 280 }}>
                <table className="data-table dense">
                  <thead><tr><th>Row</th><th>Field</th><th>Code</th><th>Message</th><th>Fix</th></tr></thead>
                  <tbody>
                    {analysis.errors.map((e, i) => {
                      const f = fields.find((x) => x.label === e.field);
                      return (
                        <tr key={i} className="error-row">
                          <td>{e.row}</td><td>{e.field}</td><td className="identifier">{e.code}</td><td style={{ color: '#C0393F' }}>{e.message}</td>
                          <td>{f && <input className="field-input grid" placeholder="Enter value" value={fixes[`${e.row - 1}:${f.key}`] ?? mapped[e.row - 1]?.[f.key] ?? ''} onChange={(ev) => setFixes({ ...fixes, [`${e.row - 1}:${f.key}`]: ev.target.value })} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {analysis.dupes.length > 0 && (
            <div>
              <div className="section-title">Duplicates of existing records (will be skipped)</div>
              <div className="card" style={{ overflow: 'auto', maxHeight: 200 }}>
                <table className="data-table dense"><thead><tr><th>Row</th><th>Matches existing</th></tr></thead><tbody>{analysis.dupes.map((d, i) => <tr key={i}><td>{d.row}</td><td>{d.match.name ?? d.match.code ?? d.match.id}</td></tr>)}</tbody></table>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="section-title">Preview (first 10 rows)</div>
              <div className="card" style={{ overflow: 'auto' }}>
                <table className="data-table dense"><thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead><tbody>{mapped.slice(0, 10).map((r, i) => <tr key={i} className={analysis.errRows.has(i + 1) ? 'error-row' : ''}>{fields.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}</tr>)}</tbody></table>
              </div>
            </div>
          )}
          {step === 3 && analysis.errors.length + analysis.dupes.length > 0 && (
            <CheckboxField checked={importValidOnly} onChange={setImportValidOnly} label={`Import ${analysis.valid} valid rows only and skip ${analysis.errors.length + analysis.dupes.length} rows with errors or duplicates`} help="Skipped rows are listed in the import log for a corrected retry." />
          )}
        </div>
      )}
    </Drawer>
  );
}
