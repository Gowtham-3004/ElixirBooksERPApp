// Production settings — additive keys on company.defaults.production (FR-MFG-001/009/012).
import { useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import { PageHeader, Button, Badge, RadioCards, PercentField, MoneyField, Toggle, EntityPicker, useWarehouseOptions, useAccountOptions, KV, useToast, Banner } from '../../components/ui';
import { fmtMoney } from '../../lib/format';
import type { MfgSettings } from './types';
import { mfgSettings, saveMfgSettings, whName } from './core';
import { SectionCard } from './shared';

export function ProductionSettingsPage() {
  const s = useSession();
  const toast = useToast();
  const current = mfgSettings();
  const whs = useWarehouseOptions();
  const accounts = useAccountOptions((a) => a.type === 'Expense');
  const [f, setF] = useState<MfgSettings>(current);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<MfgSettings>) => { setF({ ...f, ...patch }); setDirty(true); };
  const save = () => { saveMfgSettings(f); setDirty(false); toast.success('Production settings saved'); };
  const canEdit = s.can('production.settings.edit') || s.can('admin.company.edit') || s.isTenantOwner;
  return (
    <div className="page">
      <PageHeader title="Production settings" subtitle="Stored on the company record under defaults.production — applies to new documents only"
        actions={<><Button onClick={() => { setF(current); setDirty(false); }} disabled={!dirty}>Discard</Button><Button variant="primary" onClick={save} disabled={!dirty || !canEdit} reason={!canEdit ? 'Requires company administration rights' : !dirty ? 'No changes' : undefined}>Save settings</Button></>} />
      {dirty && <Banner tone="info">Unsaved changes — settings take effect on documents created after saving. Posted documents are never recalculated.</Banner>}
      <div className="grid-2">
        <SectionCard title="Manufacturing mode">
          <RadioCards label="Production mode" value={f.mode} onChange={(v) => set({ mode: v })} columns={2} options={[{ value: 'discrete', label: 'Discrete', description: 'Countable units, serial/lot genealogy, routings per operation' }, { value: 'process', label: 'Process', description: 'Continuous / batch output with by-products and yield' }]} />
          <div style={{ height: 12 }} />
          <RadioCards label="Default planning strategy" value={f.planning} onChange={(v) => set({ planning: v })} columns={2} options={[{ value: 'MTS', label: 'Make to stock', description: 'MRP replenishes finished-goods stock to safety levels' }, { value: 'MTO', label: 'Make to order', description: 'Orders are created against sales-order demand' }]} />
        </SectionCard>
        <SectionCard title="Costing">
          <RadioCards label="Costing method" value={f.costingMethod} onChange={(v) => set({ costingMethod: v })} columns={2} options={[{ value: 'Actual', label: 'Actual', description: 'Receipts valued at costs incurred ÷ units produced' }, { value: 'Standard', label: 'Standard', description: 'Receipts at item standard cost; difference posts as variance on close' }]} />
          <div style={{ marginTop: 12 }}>
            <KV items={[{ k: 'WIP account', v: '1220 Work in Progress' }, { k: 'Variance account', v: '5710 Production Variances' }, { k: 'Scrap account', v: '5700 Scrap & Rework' }, { k: 'Subcontracting', v: '5720 Subcontracting Charges' }]} />
          </div>
        </SectionCard>
      </div>
      <div className="grid-2">
        <SectionCard title="Shop-floor policy">
          <PercentField label="Over-issue tolerance" value={f.overIssueTolerancePct} onChange={(v) => set({ overIssueTolerancePct: v })} help="Material issues above planned quantity + tolerance are blocked" />
          <div style={{ height: 12 }} />
          <Toggle on={f.backflushDefault} onChange={(v) => set({ backflushDefault: v })} label="Backflush components by default on output receipt" help="Auto-issues per BOM for the received quantity" />
          <div style={{ height: 12 }} />
          <Toggle on={f.qcRequiredForFG} onChange={(v) => set({ qcRequiredForFG: v })} label="QC required on finished-goods receipts" help="Receipts are held until the inspection is accepted" />
          <div style={{ height: 12 }} />
          <MoneyField label="Auto-release threshold for MRP production suggestions" value={f.autoReleaseThreshold} onChange={(v) => set({ autoReleaseThreshold: v })} help={f.autoReleaseThreshold > 0 ? `Converted production orders below ${fmtMoney(f.autoReleaseThreshold, s.currency)} are released without review` : 'Zero = every order is reviewed and released manually'} />
        </SectionCard>
        <SectionCard title="Default locations">
          <EntityPicker label="Finished goods warehouse" value={f.fgWarehouseId} onChange={(v) => set({ fgWarehouseId: v ?? '' })} options={whs.filter((w) => w.raw?.type === 'Standard')} />
          <div style={{ height: 12 }} />
          <EntityPicker label="Raw material warehouse" value={f.rmWarehouseId} onChange={(v) => set({ rmWarehouseId: v ?? '' })} options={whs.filter((w) => w.raw?.type === 'Standard')} />
          <div style={{ height: 12 }} />
          <EntityPicker label="WIP warehouse" value={f.wipWarehouseId} onChange={(v) => set({ wipWarehouseId: v ?? '' })} options={whs.filter((w) => w.raw?.type === 'WIP')} />
          <div style={{ height: 12 }} />
          <EntityPicker label="Scrap warehouse" value={f.scrapWarehouseId} onChange={(v) => set({ scrapWarehouseId: v ?? '' })} options={whs.filter((w) => w.raw?.type === 'Scrap' || w.raw?.type === 'Standard')} />
          <div style={{ height: 12 }} />
          <EntityPicker label="Subcontractor location" value={f.subcontractWarehouseId} onChange={(v) => set({ subcontractWarehouseId: v ?? '' })} options={whs.filter((w) => w.raw?.type === 'Transit')} help="Materials sent out stay on your books here" />
        </SectionCard>
      </div>
      <SectionCard title="Absorption accounts">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <EntityPicker label="Labour absorbed" value={f.labourAbsorbedAccountId} onChange={(v) => set({ labourAbsorbedAccountId: v ?? '' })} options={accounts} help="Credited when an operation is completed" />
          <EntityPicker label="Machine & overhead absorbed" value={f.overheadAbsorbedAccountId} onChange={(v) => set({ overheadAbsorbedAccountId: v ?? '' })} options={accounts} />
        </div>
      </SectionCard>
      <SectionCard title="Current effective configuration">
        <KV columns={2} items={[
          { k: 'Mode', v: <Badge status="Active">{f.mode}</Badge> }, { k: 'Planning', v: f.planning },
          { k: 'Costing', v: f.costingMethod }, { k: 'Over-issue tolerance', v: `${f.overIssueTolerancePct}%` },
          { k: 'Backflush', v: f.backflushDefault ? 'On by default' : 'Manual' }, { k: 'FG QC', v: f.qcRequiredForFG ? 'Required' : 'Optional' },
          { k: 'FG warehouse', v: whName(f.fgWarehouseId) }, { k: 'RM warehouse', v: whName(f.rmWarehouseId) },
          { k: 'WIP warehouse', v: whName(f.wipWarehouseId) }, { k: 'Scrap warehouse', v: whName(f.scrapWarehouseId) },
          { k: 'Subcontractor location', v: whName(f.subcontractWarehouseId) }, { k: 'Auto-release threshold', v: f.autoReleaseThreshold > 0 ? fmtMoney(f.autoReleaseThreshold, s.currency) : 'Disabled' },
        ]} />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button variant="link" onClick={() => nav.go('admin/workflows')}>Production order release workflow →</Button>
          <Button variant="link" onClick={() => nav.go('admin/numbering')}>Number series →</Button>
          <Button variant="link" onClick={() => nav.go('masters/warehouses')}>Warehouses →</Button>
        </div>
      </SectionCard>
    </div>
  );
}
