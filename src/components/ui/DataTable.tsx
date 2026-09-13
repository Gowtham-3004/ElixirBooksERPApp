import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { SortIcon, SearchIcon, FilterIcon, DownloadIcon, ColumnsIcon, ChevronDownIcon } from '../Icons';
import { Button, CountBadge, EmptyState } from './primitives';
import { ActionMenu, type MenuAction } from './overlays';
import { toCSV, downloadText } from '../../lib/format';
import { db, C, engine } from '../../store';

export interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  /** value for sorting/export when render is custom */
  value?: (row: T) => string | number | undefined | null;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  sortable?: boolean;
  hidden?: boolean;
  /** show a totals value in tfoot */
  total?: (rows: T[]) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => MenuAction[];
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  dense?: boolean;
  compact?: boolean;
  empty?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowClass?: (row: T) => string | undefined;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (s: { key: string; dir: 'asc' | 'desc' }) => void;
  totalsLabel?: ReactNode;
  showTotals?: boolean;
  style?: CSSProperties;
  maxHeight?: number | string;
  stickyHeader?: boolean;
}

export function DataTable<T extends Record<string, any>>({ rows, columns, rowKey, onRowClick, rowActions, selectable, selected, onSelect, dense, compact, empty, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, rowClass, sort, onSort, totalsLabel, showTotals, style, maxHeight, stickyHeader }: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<{ key: string; dir: 'asc' | 'desc' } | undefined>();
  const s = sort ?? localSort;
  const setS = onSort ?? setLocalSort;
  const key = rowKey ?? ((r: T) => String(r.id));
  const cols = columns.filter((c) => !c.hidden);
  const sorted = useMemo(() => {
    if (!s) return rows;
    const col = columns.find((c) => c.key === s.key);
    const get = (r: T) => (col?.value ? col.value(r) : r[s.key]);
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va === vb) return 0;
      if (va === undefined || va === null) return 1;
      if (vb === undefined || vb === null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return s.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, s, columns]);
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(key(r)));
  const toggleAll = () => {
    if (!onSelect) return;
    onSelect(allSelected ? new Set() : new Set(rows.map(key)));
  };
  const hasTotals = showTotals ?? cols.some((c) => c.total);
  if (rows.length === 0) {
    return (
      <div className="card" style={{ overflow: 'hidden', ...style }}>
        {empty ?? <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />}
      </div>
    );
  }
  return (
    <div className="card" style={{ overflow: 'auto', maxHeight, ...style }}>
      <table className={`data-table ${dense ? 'dense' : ''} ${compact ? 'compact' : ''}`}>
        <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 1 } : undefined}>
          <tr>
            {selectable && (
              <th style={{ width: 40 }}>
                <input type="checkbox" className="checkbox" checked={!!allSelected} onChange={toggleAll} onClick={(e) => e.stopPropagation()} />
              </th>
            )}
            {cols.map((c) => (
              <th key={c.key} className={`${c.align === 'right' ? 'right' : ''} ${c.sortable ? 'sortable' : ''} ${c.className ?? ''}`} style={{ width: c.width, textAlign: c.align }} onClick={() => c.sortable && setS({ key: c.key, dir: s?.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' })}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: c.align === 'right' ? 'flex-end' : undefined }}>
                  {c.label}
                  {c.sortable && <SortIcon size={11} />}
                </span>
              </th>
            ))}
            {rowActions && <th style={{ width: 48 }} />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const k = key(r);
            const isSel = selected?.has(k);
            return (
              <tr key={k} className={`${onRowClick ? 'clickable' : ''} ${isSel ? 'selected' : ''} ${rowClass?.(r) ?? ''}`} onClick={() => onRowClick?.(r)}>
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="checkbox" checked={!!isSel} onChange={() => { if (!onSelect) return; const n = new Set(selected); if (n.has(k)) n.delete(k); else n.add(k); onSelect(n); }} />
                  </td>
                )}
                {cols.map((c) => (
                  <td key={c.key} className={`${c.align === 'right' ? 'right' : ''} ${c.className ?? ''}`} style={{ textAlign: c.align }}>
                    {c.render ? c.render(r, i) : (r[c.key] ?? '—')}
                  </td>
                ))}
                {rowActions && (
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <ActionMenu actions={rowActions(r)} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {hasTotals && (
          <tfoot>
            <tr>
              {selectable && <td />}
              {cols.map((c, i) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : ''} style={{ textAlign: c.align }}>
                  {i === 0 && !c.total ? (totalsLabel ?? `Totals for ${rows.length} row${rows.length === 1 ? '' : 's'}`) : c.total ? c.total(rows) : ''}
                </td>
              ))}
              {rowActions && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Register page (design §6.3) ───────────────────────────────────────────

export interface FilterDef {
  key: string;
  label: string;
  type: 'select' | 'text' | 'date-range' | 'amount-range';
  options?: { value: string; label: string }[];
}

export interface RegisterProps<T> extends Omit<DataTableProps<T>, 'rows' | 'selected' | 'onSelect'> {
  title: ReactNode;
  subtitle?: ReactNode;
  rows: T[];
  /** free-text search over these fields */
  searchKeys?: string[];
  searchPlaceholder?: string;
  tabs?: { id: string; label: string; filter?: (r: T) => boolean; count?: number }[];
  filters?: FilterDef[];
  applyFilter?: (r: T, values: Record<string, any>) => boolean;
  actions?: ReactNode;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean; reason?: string };
  importAction?: () => void;
  exportName?: string;
  bulkActions?: (ids: Set<string>, rows: T[]) => MenuAction[];
  pageSize?: number;
  headerExtra?: ReactNode;
  /** show the scope line under the title automatically */
  scope?: boolean;
  entity?: string;
}

export function RegisterPage<T extends Record<string, any>>(props: RegisterProps<T>) {
  const { title, subtitle, rows, searchKeys = [], searchPlaceholder = 'Search…', tabs, filters, applyFilter, actions, primaryAction, importAction, exportName, bulkActions, pageSize: initialPageSize = 25, headerExtra, columns, selectable, entity, ...tableProps } = props;
  const [tab, setTab] = useState(tabs?.[0]?.id ?? 'all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [fv, setFv] = useState<Record<string, any>>({});
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);

  const activeTab = tabs?.find((t) => t.id === tab);
  const filtered = useMemo(() => {
    let out = rows;
    if (activeTab?.filter) out = out.filter(activeTab.filter);
    const term = q.trim().toLowerCase();
    if (term) out = out.filter((r) => searchKeys.some((k) => String(k.split('.').reduce((o: any, p) => o?.[p], r) ?? '').toLowerCase().includes(term)) || JSON.stringify(r).toLowerCase().includes(term));
    if (applyFilter && Object.keys(fv).some((k) => fv[k] !== undefined && fv[k] !== '')) out = out.filter((r) => applyFilter(r, fv));
    return out;
  }, [rows, activeTab, q, searchKeys, fv, applyFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const cols = columns.map((c) => ({ ...c, hidden: c.hidden || hiddenCols.has(c.key) }));
  const activeFilterCount = Object.values(fv).filter((v) => v !== undefined && v !== '').length;

  const doExport = (format: 'CSV' | 'XLSX' | 'PDF') => {
    const exportCols = cols.filter((c) => !c.hidden).map((c) => ({ key: c.key, label: typeof c.label === 'string' ? c.label : c.key }));
    const data = filtered.map((r) => Object.fromEntries(exportCols.map((c) => { const col = columns.find((x) => x.key === c.key); return [c.key, col?.value ? col.value(r) : r[c.key]]; })));
    const name = `${exportName ?? entity ?? 'export'}-${new Date().toISOString().slice(0, 10)}`;
    const scope = engine.ctx();
    if (filtered.length > 500) {
      db.insert(C.exportJobs, { name, entity: entity ?? exportName ?? 'register', format, filters: { q, tab, ...fv }, scope: `${scope.company?.tradeName ?? ''} · ${scope.branchId}`, status: 'Queued', rows: filtered.length, requestedBy: scope.userName, masked: true, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
      engine.notify({ type: 'export', title: `Export queued: ${name}`, body: `${filtered.length} rows · ${format} · you will be notified when ready`, link: 'admin/jobs' });
      return;
    }
    engine.audit({ action: 'export', objectType: entity ?? 'Register', detail: `${format} · ${filtered.length} rows · filters ${JSON.stringify({ q, tab, ...fv })}` });
    downloadText(`${name}.${format === 'PDF' ? 'txt' : 'csv'}`, toCSV(data, exportCols));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {actions}
          {importAction && <Button variant="secondary" onClick={importAction}>Import</Button>}
          <ActionMenu trigger={<Button variant="secondary" icon={<DownloadIcon size={14} />}>Export <ChevronDownIcon size={12} /></Button>} actions={[{ label: 'CSV', onClick: () => doExport('CSV') }, { label: 'XLSX', onClick: () => doExport('XLSX') }, { label: 'PDF', onClick: () => doExport('PDF') }]} />
          {primaryAction && <Button variant="primary" onClick={primaryAction.onClick} disabled={primaryAction.disabled} reason={primaryAction.reason}>+ {primaryAction.label}</Button>}
        </div>
      </div>
      {headerExtra}
      {tabs && (
        <div style={{ display: 'flex', borderBottom: '1px solid #EFEFEF', marginTop: -4 }}>
          {tabs.map((t) => {
            const n = t.count ?? (t.filter ? rows.filter(t.filter).length : rows.length);
            return (
              <button key={t.id} type="button" className={`filter-tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setPage(1); setSelected(new Set()); }}>
                {t.label} <CountBadge n={n} />
              </button>
            );
          })}
        </div>
      )}
      {selected.size > 0 && bulkActions ? (
        <div className="bulk-bar">
          <strong>{selected.size} selected</strong>
          <span>·</span>
          {bulkActions(selected, rows.filter((r) => selected.has(String(r.id)))).map((a, i) => (
            <Button key={i} size="sm" variant={a.danger ? 'danger' : 'secondary'} onClick={a.onClick} disabled={a.disabled} reason={a.reason}>{a.label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Clear</Button>
        </div>
      ) : (
        <div className="toolbar">
          <div className="search-input" style={{ width: 280 }}>
            <SearchIcon size={14} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={searchPlaceholder} />
          </div>
          {filters && filters.length > 0 && (
            <Button size="sm" variant="secondary" icon={<FilterIcon size={13} />} onClick={() => setShowFilters(!showFilters)}>
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ position: 'relative' }}>
            <Button size="sm" variant="secondary" icon={<ColumnsIcon size={13} />} onClick={() => setShowCols(!showCols)}>Columns</Button>
            {showCols && (
              <div className="menu" style={{ right: 0, top: '100%', marginTop: 4, padding: 8 }}>
                {columns.map((c) => (
                  <label key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 6px', cursor: 'pointer' }}>
                    <input type="checkbox" className="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => { const n = new Set(hiddenCols); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); setHiddenCols(n); }} />
                    {typeof c.label === 'string' ? c.label : c.key}
                  </label>
                ))}
              </div>
            )}
          </span>
        </div>
      )}
      {showFilters && filters && (
        <div className="card" style={{ padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {filters.map((f) => (
            <div key={f.key} style={{ minWidth: 160 }}>
              <label className="field-label">{f.label}</label>
              {f.type === 'select' ? (
                <select className="field-input sm" value={fv[f.key] ?? ''} onChange={(e) => { setFv({ ...fv, [f.key]: e.target.value }); setPage(1); }}>
                  <option value="">Any</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'date-range' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="date" className="field-input sm" value={fv[f.key + 'From'] ?? ''} onChange={(e) => setFv({ ...fv, [f.key + 'From']: e.target.value })} />
                  <input type="date" className="field-input sm" value={fv[f.key + 'To'] ?? ''} onChange={(e) => setFv({ ...fv, [f.key + 'To']: e.target.value })} />
                </div>
              ) : f.type === 'amount-range' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" placeholder="Min" className="field-input sm num" value={fv[f.key + 'Min'] ?? ''} onChange={(e) => setFv({ ...fv, [f.key + 'Min']: e.target.value })} />
                  <input type="number" placeholder="Max" className="field-input sm num" value={fv[f.key + 'Max'] ?? ''} onChange={(e) => setFv({ ...fv, [f.key + 'Max']: e.target.value })} />
                </div>
              ) : (
                <input className="field-input sm" value={fv[f.key] ?? ''} onChange={(e) => setFv({ ...fv, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setFv({})}>Clear filters</Button>
        </div>
      )}
      {activeFilterCount > 0 && !showFilters && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(fv).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => (
            <span key={k} className="chip selected" onClick={() => setFv({ ...fv, [k]: '' })}>{k}: {String(v)} <span className="x">✕</span></span>
          ))}
        </div>
      )}
      <DataTable
        {...tableProps}
        columns={cols}
        rows={paged}
        selectable={selectable ?? !!bulkActions}
        selected={selected}
        onSelect={setSelected}
        emptyTitle={q || activeFilterCount ? `No ${entity ?? 'records'} match these filters` : tableProps.emptyTitle ?? `No ${entity ?? 'records'} yet`}
        emptyAction={q || activeFilterCount ? <Button variant="link" onClick={() => { setQ(''); setFv({}); }}>Clear filters</Button> : tableProps.emptyAction ?? (primaryAction ? <Button variant="primary" onClick={primaryAction.onClick}>+ {primaryAction.label}</Button> : undefined)}
        totalsLabel={`Totals for ${filtered.length} filtered row${filtered.length === 1 ? '' : 's'}`}
      />
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#5F6368' }}>
          <span>
            Show{' '}
            <select className="field-input sm" style={{ width: 70, display: 'inline-block', height: 30 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>{' '}
            per page · {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button size="sm" variant="ghost" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹ Prev</Button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              const p = totalPages <= 7 ? i + 1 : Math.max(1, Math.min(totalPages - 6, safePage - 3)) + i;
              return <Button key={p} size="sm" variant={p === safePage ? 'primary' : 'ghost'} onClick={() => setPage(p)}>{p}</Button>;
            })}
            <Button size="sm" variant="ghost" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next ›</Button>
          </div>
        </div>
      )}
    </div>
  );
}
