// AR ageing (FR-AR-005): buckets computed live from open items as at a chosen date.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../../store';
import type { Customer, OpenItem } from '../../../store';
import { Button, DateField, ScopeLine, KpiTile, DataTable, TwoLine, Pill } from '../../../components/ui';
import type { Column } from '../../../components/ui';
import { ageingBucket, fmtMoney, today, toCSV, downloadText, daysBetween } from '../../../lib/format';

export interface AgeingRow { customerId: string; customer: string; gstin?: string; current: number; d030: number; d3160: number; d6190: number; d90p: number; total: number; overdue: number; credits: number; net: number; oldestDays: number; creditLimit: number }

export function computeAgeing(asAt: string, companyId?: string): AgeingRow[] {
  const items = db.where<OpenItem>(C.openItems, (o) => o.partyType === 'Customer' && (!o.companyId || o.companyId === companyId) && o.date <= asAt && (o.status === 'Open' || o.status === 'Partially Settled'));
  const map = new Map<string, AgeingRow>();
  items.forEach((o) => {
    const c = db.find<Customer>(C.customers, o.partyId);
    const row = map.get(o.partyId) ?? { customerId: o.partyId, customer: o.partyName, gstin: c?.gstin, current: 0, d030: 0, d3160: 0, d6190: 0, d90p: 0, total: 0, overdue: 0, credits: 0, net: 0, oldestDays: 0, creditLimit: c?.creditLimit ?? 0 };
    // settlements after as-at are added back so the report is point-in-time
    const later = o.settlements.filter((s) => s.date > asAt).reduce((a, s) => a + s.amount, 0);
    const amt = (o.baseOutstanding + later * o.rate) || 0;
    if (o.direction === 'Credit') row.credits += amt;
    else {
      const b = ageingBucket(o.dueDate, asAt);
      row[b] += amt;
      row.total += amt;
      if (b !== 'current') { row.overdue += amt; row.oldestDays = Math.max(row.oldestDays, daysBetween(o.dueDate, asAt)); }
    }
    row.net = row.total - row.credits;
    map.set(o.partyId, row);
  });
  return Array.from(map.values()).filter((r) => r.total > 0.005 || r.credits > 0.005).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
}

export default function ArAgeing() {
  const s = useSession();
  const [asAt, setAsAt] = useState(today());
  useCollection(C.openItems);
  const rows = useMemo(() => computeAgeing(asAt, s.state.companyId), [asAt, s.state.companyId]);
  const tot = (k: keyof AgeingRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const cur = s.currency;
  const columns: Column<AgeingRow>[] = [
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={<span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`sales/statements/${r.customerId}`); }}>{r.customer}</span>} secondary={r.gstin} mono />, value: (r) => r.customer },
    { key: 'current', label: 'Current', align: 'right', render: (r) => <span className="money" style={{ color: r.current ? '#12784E' : '#B0B5BF' }}>{r.current ? fmtMoney(r.current, cur) : '—'}</span>, value: (r) => r.current, total: () => <span className="money">{fmtMoney(tot('current'), cur)}</span> },
    { key: 'd030', label: '1–30 days', align: 'right', render: (r) => <span className="money" style={{ color: r.d030 ? '#F97316' : '#B0B5BF' }}>{r.d030 ? fmtMoney(r.d030, cur) : '—'}</span>, value: (r) => r.d030, total: () => <span className="money">{fmtMoney(tot('d030'), cur)}</span> },
    { key: 'd3160', label: '31–60 days', align: 'right', render: (r) => <span className="money" style={{ color: r.d3160 ? '#EF8C1E' : '#B0B5BF' }}>{r.d3160 ? fmtMoney(r.d3160, cur) : '—'}</span>, value: (r) => r.d3160, total: () => <span className="money">{fmtMoney(tot('d3160'), cur)}</span> },
    { key: 'd6190', label: '61–90 days', align: 'right', render: (r) => <span className="money" style={{ color: r.d6190 ? '#E07014' : '#B0B5BF' }}>{r.d6190 ? fmtMoney(r.d6190, cur) : '—'}</span>, value: (r) => r.d6190, total: () => <span className="money">{fmtMoney(tot('d6190'), cur)}</span> },
    { key: 'd90p', label: '> 90 days', align: 'right', render: (r) => <span className="money" style={{ color: r.d90p ? '#C0393F' : '#B0B5BF' }}>{r.d90p ? fmtMoney(r.d90p, cur) : '—'}</span>, value: (r) => r.d90p, total: () => <span className="money">{fmtMoney(tot('d90p'), cur)}</span> },
    { key: 'total', label: 'Total', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.total, cur)}</span>, value: (r) => r.total, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(tot('total'), cur)}</span> },
    { key: 'credits', label: 'Unapplied credits', align: 'right', render: (r) => <span className="money" style={{ color: r.credits ? '#12784E' : '#B0B5BF' }}>{r.credits ? `−${fmtMoney(r.credits, cur)}` : '—'}</span>, value: (r) => r.credits, total: () => <span className="money">−{fmtMoney(tot('credits'), cur)}</span> },
    { key: 'overdue', label: 'Overdue', align: 'right', sortable: true, render: (r) => (r.overdue > 0 ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}><span className="money" style={{ color: '#C0393F', fontWeight: 600 }}>{fmtMoney(r.overdue, cur)}</span><Pill tone="critical">{r.oldestDays} d</Pill></div> : <span style={{ color: '#B0B5BF' }}>—</span>), value: (r) => r.overdue, total: () => <span className="money" style={{ color: '#C0393F', fontWeight: 600 }}>{fmtMoney(tot('overdue'), cur)}</span> },
    { key: 'limit', label: 'Credit limit', align: 'right', render: (r) => (r.creditLimit ? <span className="money" style={{ color: r.net > r.creditLimit ? '#C0393F' : '#5F6368' }}>{fmtMoney(r.creditLimit, cur)}</span> : '—'), value: (r) => r.creditLimit },
  ];
  const buckets = [{ label: 'Current', val: tot('current'), color: '#12784E' }, { label: '1–30 days', val: tot('d030'), color: '#F97316' }, { label: '31–60 days', val: tot('d3160'), color: '#EF8C1E' }, { label: '61–90 days', val: tot('d6190'), color: '#E07014' }, { label: '> 90 days', val: tot('d90p'), color: '#C0393F' }, { label: 'Total outstanding', val: tot('total'), color: '#0A0A0A' }];
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">AR ageing</h1><div className="page-subtitle"><ScopeLine extra={`as at ${asAt}`} /></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <DateField label="As at" value={asAt} onChange={setAsAt} max={today()} size="sm" />
          <Button variant="secondary" onClick={() => nav.go('sales/collections')}>Collections follow-up</Button>
          <Button variant="secondary" onClick={() => downloadText(`ar-ageing-${asAt}.csv`, toCSV(rows.map((r) => ({ customer: r.customer, gstin: r.gstin, current: r.current, d030: r.d030, d3160: r.d3160, d6190: r.d6190, d90p: r.d90p, total: r.total, credits: r.credits, overdue: r.overdue }))))}>Export CSV</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 12 }}>
        {buckets.map((b) => <KpiTile key={b.label} label={b.label} value={<span style={{ color: b.color, fontSize: 18 }}>{fmtMoney(b.val, cur)}</span>} sub={b.val && tot('total') ? `${Math.round((b.val / tot('total')) * 100)}%` : undefined} />)}
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.customerId} onRowClick={(r) => nav.go(`sales/statements/${r.customerId}`)} totalsLabel={`Totals for ${rows.length} customer${rows.length === 1 ? '' : 's'}`} emptyTitle="Nothing outstanding" emptyDescription="No open receivables as at this date." />
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Buckets are by due date as at {asAt}; settlements after that date are added back so the report is point-in-time. Base currency {cur}.</div>
    </div>
  );
}
