// Stock valuation (FR-INV-008): AVCO per item / warehouse + reconciliation to inventory control accounts.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, IDS } from '../../store';
import type { Account, StockMovement } from '../../store';
import { Button, DateField, SelectField, ScopeLine, SummaryBlock, Banner, KpiTile, TwoLine, DataTable, Pill } from '../../components/ui';
import { fmtMoney, fmtQty, today, toCSV, downloadText } from '../../lib/format';
import * as A from './actions';

export function Valuation() {
  const moves = useCollection<StockMovement>(C.stockMovements);
  const journals = useCollection<any>(C.journals);
  const [asOf, setAsOf] = useState(today());
  const [wh, setWh] = useState('');
  const whs = A.activeWarehouses();
  const rows = useMemo(() => A.stockItems().flatMap((item) => (wh ? [whs.find((w) => w.id === wh)!] : whs).map((w) => { const v = A.valuation(item.id, w.id, asOf); return { key: `${item.id}|${w.id}`, item, warehouse: w, ...v }; }).filter((r) => r.qty !== 0 || r.value !== 0)), [moves, asOf, wh]);
  const byAccount = useMemo(() => { const m = new Map<string, number>(); rows.forEach((r) => { const acc = r.item.inventoryAccountId ?? IDS.accInvFG; m.set(acc, Math.round(((m.get(acc) ?? 0) + r.value) * 100) / 100); }); return m; }, [rows]);
  // WIP (1220) is an inventory control account too — stock sitting on the shop floor is still stock,
  // so leaving it out made the total GL side short by the whole work-in-progress balance.
  // Scoped to the active company — the chart of accounts repeats codes across companies, and WIP
  // (1220) is an inventory control account too: stock on the shop floor is still stock.
  const controls = db.where<Account>(C.accounts, (a) => a.companyId === engine.ctx().companyId && (a.controlType === 'Inventory' || a.controlType === 'WIP') && a.status === 'Active');
  const recon = useMemo(() => controls.map((a) => { const gl = engine.accountBalance(a.id, { to: asOf }); const stock = byAccount.get(a.id) ?? 0; const openingStock = rows.filter((r) => (r.item.inventoryAccountId ?? IDS.accInvFG) === a.id).reduce((x, r) => x + A.valuation(r.item.id, r.warehouse.id, '2026-04-01').value, 0); return { account: a, gl: gl.net, glOpening: a.openingBalance ?? 0, glMovement: gl.dr - gl.cr, stock, stockOpening: Math.round(openingStock * 100) / 100, stockMovement: Math.round((stock - openingStock) * 100) / 100, diff: Math.round((stock - gl.net) * 100) / 100 }; }), [controls, byAccount, asOf, journals]);
  const totalStock = rows.reduce((x, r) => x + r.value, 0);
  const totalGl = recon.reduce((x, r) => x + r.gl, 0);
  const transitValue = rows.filter((r) => r.warehouse.type === 'Transit').reduce((x, r) => x + r.value, 0);
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Stock valuation</h1><div className="page-subtitle"><ScopeLine extra={`AVCO · as of ${asOf} · ${rows.length} item-warehouse rows`} /></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}><DateField label="As of" value={asOf} onChange={setAsOf} size="sm" /><SelectField label="Warehouse" size="sm" value={wh} onChange={setWh} options={[{ value: '', label: 'All' }, ...whs.map((w) => ({ value: w.id, label: w.name }))]} /><Button onClick={() => downloadText(`valuation-${asOf}.csv`, toCSV(rows.map((r) => ({ item: r.item.code, name: r.item.name, warehouse: r.warehouse.name, qty: r.qty, avgRate: r.avgRate, value: r.value, account: db.find<Account>(C.accounts, r.item.inventoryAccountId ?? IDS.accInvFG)?.code }))))}>Export</Button></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <KpiTile label="Stock value (ledger)" value={fmtMoney(totalStock)} sub={`${rows.length} rows`} />
        <KpiTile label="GL inventory control" value={fmtMoney(totalGl)} sub={controls.map((c) => c.code).join(' + ')} />
        <KpiTile label="Difference" value={fmtMoney(totalStock - totalGl)} deltaTone={Math.abs(totalStock - totalGl) < 1 ? 'good' : 'bad'} delta={Math.abs(totalStock - totalGl) < 1 ? 'Reconciled' : 'Needs explanation'} />
        <KpiTile label="In transit" value={fmtMoney(transitValue)} sub="included in stock value" />
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #EAEAEA', fontWeight: 600, fontSize: 13 }}>Reconciliation to inventory control accounts</div>
        <table className="data-table dense">
          <thead><tr><th>Account</th><th className="right">GL opening</th><th className="right">GL movement</th><th className="right">GL balance</th><th className="right">Stock opening</th><th className="right">Stock movement</th><th className="right">Stock value</th><th className="right">Difference</th><th>Explanation</th></tr></thead>
          <tbody>{recon.map((r) => <tr key={r.account.id} className="clickable" onClick={() => nav.go(`accounting/ledger?account=${r.account.id}`)}><td><TwoLine primary={`${r.account.code} · ${r.account.name}`} secondary={r.account.controlType} /></td><td className="right money">{fmtMoney(r.glOpening)}</td><td className="right money">{fmtMoney(r.glMovement)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(r.gl)}</td><td className="right money">{fmtMoney(r.stockOpening)}</td><td className="right money">{fmtMoney(r.stockMovement)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(r.stock)}</td><td className="right money" style={{ color: Math.abs(r.diff) < 1 ? '#12784E' : '#C0393F', fontWeight: 600 }}>{fmtMoney(r.diff)}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{Math.abs(r.diff) < 1 ? <Pill tone="good">Reconciled</Pill> : Math.abs(r.stockMovement - r.glMovement) < 1 ? `Opening difference ${fmtMoney(r.stockOpening - r.glOpening)}: stock ledger opening (physical, priced at purchase cost) vs GL opening balance carried from prior books — post an opening-balance journal to align. Movements since 1 Apr agree.` : `Movement difference ${fmtMoney(r.stockMovement - r.glMovement)}: postings on this account without a stock movement (or vice-versa) — check deliveries / COGS, manual journals and direct expense invoices of stock items.`}</td></tr>)}</tbody>
        </table>
      </div>
      {Math.abs(totalStock - totalGl) >= 1 && <Banner tone="warning">Stock ledger and GL differ by {fmtMoney(totalStock - totalGl)}. Differences are explained per account above; only the movement portion indicates a posting gap.</Banner>}
      <DataTable rows={rows} rowKey={(r) => r.key} dense columns={[
        { key: 'code', label: 'SKU', render: (r) => <span className="identifier">{r.item.code}</span> }, { key: 'name', label: 'Item', render: (r) => r.item.name }, { key: 'wh', label: 'Warehouse', render: (r) => r.warehouse.name },
        { key: 'account', label: 'Inventory account', render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{db.find<Account>(C.accounts, r.item.inventoryAccountId ?? IDS.accInvFG)?.code}</span> },
        { key: 'qty', label: 'Qty', align: 'right', render: (r) => <span className="money">{fmtQty(r.qty, r.item.baseUom)}</span> },
        { key: 'avgRate', label: 'AVCO rate', align: 'right', render: (r) => <span className="money">{fmtMoney(r.avgRate)}</span> },
        { key: 'std', label: 'Std / purchase', align: 'right', render: (r) => <span className="money" style={{ color: '#5F6368' }}>{fmtMoney(r.item.standardCost ?? r.item.purchasePrice)}</span> },
        { key: 'value', label: 'Value', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.value)}</span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.value, 0)) },
      ]} onRowClick={(r) => nav.go(`inventory/stock/${r.item.id}`)} />
      <SummaryBlock items={[{ label: 'Method', value: A.inventorySettings().valuationMethod }, { label: 'Landed cost included', value: 'Yes (value-only movements)' }, { label: 'Negative stock', value: A.inventorySettings().negativeStockPolicy }]} />
    </div>
  );
}

