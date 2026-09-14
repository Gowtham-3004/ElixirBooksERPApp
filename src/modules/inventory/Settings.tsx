// Inventory settings — negative-stock policy, valuation method, default transit / scrap warehouses (additive keys on company.defaults).
import { useState } from 'react';
import { useSession } from '../../store';
import { Button, SelectField, NumberField, useToast, PageHeader, Banner, RadioCards } from '../../components/ui';
import * as A from './actions';
import type { InventorySettings } from './types';

export function InventorySettingsPage() {
  const s = useSession();
  const toast = useToast();
  const [v, setV] = useState<InventorySettings>(() => A.inventorySettings(s.company));
  const canEdit = s.can('admin.company.edit') || s.can('inventory.settings.edit') || s.isTenantOwner || s.can('inventory.*');
  const whs = A.activeWarehouses();
  return (
    <div className="page">
      <PageHeader title="Inventory settings" subtitle={`${s.company?.tradeName} · posted movements keep their valuation snapshot`} actions={<Button variant="primary" disabled={!canEdit} reason={!canEdit ? 'Requires company admin' : undefined} onClick={() => { try { A.saveInventorySettings(v); toast.success('Inventory settings saved'); } catch (e: any) { toast.error(e.message); } }}>Save settings</Button>} />
      {!canEdit && <Banner tone="info">Read-only — ask a Finance Admin or the tenant owner to change these.</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-title">Stock control</div>
          <RadioCards label="Negative stock policy (FR-INV-003)" value={v.negativeStockPolicy} onChange={(x) => setV({ ...v, negativeStockPolicy: x as InventorySettings['negativeStockPolicy'] })} columns={3} options={[{ value: 'Block', label: 'Block', description: 'Issues that would go negative are rejected' }, { value: 'Warn', label: 'Warn', description: 'Allowed with a warning and audit entry' }, { value: 'Allow', label: 'Allow', description: 'No check (not recommended)' }]} />
          <SelectField label="Valuation method (FR-INV-008)" value={v.valuationMethod} onChange={(x) => setV({ ...v, valuationMethod: x as InventorySettings['valuationMethod'] })} options={[{ value: 'AVCO', label: 'Weighted average (AVCO)' }, { value: 'FIFO', label: 'FIFO (reported as AVCO in this edition)', disabled: true }, { value: 'Standard', label: 'Standard cost (reported as AVCO in this edition)', disabled: true }]} disabled={!canEdit} />
          <NumberField label="Count variance tolerance (%)" value={v.countTolerancePct} onChange={(x) => setV({ ...v, countTolerancePct: x })} decimals={1} min={0} max={100} disabled={!canEdit} help="Informational highlight on count sheets" />
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-title">Default warehouses</div>
          <SelectField label="Transit warehouse (transfers in flight)" value={v.transitWarehouseId} onChange={(x) => setV({ ...v, transitWarehouseId: x })} options={whs.map((w) => ({ value: w.id, label: `${w.name}${w.type !== 'Standard' ? ' · ' + w.type : ''}` }))} disabled={!canEdit} />
          <SelectField label="Scrap warehouse (transit damage / shortage, QC scrap)" value={v.scrapWarehouseId} onChange={(x) => setV({ ...v, scrapWarehouseId: x })} options={whs.map((w) => ({ value: w.id, label: `${w.name}${w.type !== 'Standard' ? ' · ' + w.type : ''}` }))} disabled={!canEdit} />
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Warehouses and bins are maintained under Masters › Warehouses.</div>
        </div>
      </div>
    </div>
  );
}
