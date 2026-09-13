// Small shared UI helpers for the purchase / inventory / banking modules.
import { useState, type ReactNode } from 'react';
import { db, C, nav, useSession } from '../../store';
import type { DocHeader, Supplier, Item, Warehouse } from '../../store';
import { Badge, ConfirmDialog, KV, Pill, RailSection, PartyRail, Money, type Consequence } from '../../components/ui';
import { fmtDate, fmtDateTime, daysBetween, today } from '../../lib/format';

/** Declarative financial confirmation: `const confirm = useConfirm(); confirm.open({...})` + `<confirm.dialog />` */
export function useConfirm() {
  const [state, setState] = useState<null | { title: ReactNode; statement?: ReactNode; consequences?: Consequence[]; reasonRequired?: boolean; confirmLabel: string; cancelLabel?: string; danger?: boolean; onConfirm: (reason: string) => unknown; body?: ReactNode }>(null);
  const dialog = state ? <ConfirmDialog open onClose={() => setState(null)} onConfirm={async (r) => { await state.onConfirm(r); }} title={state.title} statement={state.statement} consequences={state.consequences} reasonRequired={state.reasonRequired} confirmLabel={state.confirmLabel} cancelLabel={state.cancelLabel} danger={state.danger}>{state.body}</ConfirmDialog> : null;
  return { open: (s: NonNullable<typeof state>) => setState(s), close: () => setState(null), dialog };
}

export function SupplierLink({ id, name }: { id?: string; name?: string }) {
  const s = db.find<Supplier>(C.suppliers, id);
  if (!id) return <span>{name ?? '—'}</span>;
  return <span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`masters/suppliers/${id}`); }}>{s?.name ?? name ?? id}</span>;
}

export function ItemLink({ id, name }: { id?: string; name?: string }) {
  const it = db.find<Item>(C.items, id);
  if (!id) return <span>{name ?? '—'}</span>;
  return <span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`masters/items/${id}`); }}>{it?.name ?? name ?? id}</span>;
}

export function DocLink({ path, number }: { path?: string; number?: string }) {
  if (!number) return <span style={{ color: '#B0B5BF' }}>—</span>;
  return <span className="identifier link" style={{ fontSize: 12 }} onClick={(e) => { e.stopPropagation(); if (path) nav.go(path); }}>{number}</span>;
}

export function whName(id?: string) {
  return db.find<Warehouse>(C.warehouses, id)?.name ?? '—';
}

export function OverduePill({ dueDate, outstanding }: { dueDate?: string; outstanding: number }) {
  if (!dueDate || outstanding <= 0) return null;
  const d = daysBetween(dueDate, today());
  if (d <= 0) return <Pill tone="good">Current</Pill>;
  return <Pill tone={d > 60 ? 'critical' : 'warning'}>Overdue {d} d</Pill>;
}

/** Standard document rail: party + header facts + posting metadata. */
export function StandardRail({ doc, partyLink, facts, children }: { doc: DocHeader; partyLink?: string; facts?: { k: ReactNode; v: ReactNode }[]; children?: ReactNode }) {
  const s = useSession();
  const posted = doc.status === 'Posted' || doc.status === 'Completed' || doc.status === 'Reversed' || doc.status === 'Closed';
  return (
    <>
      {(doc.partySnapshot || doc.partyName) && (
        <RailSection label="Supplier" snapshot={posted}>
          <PartyRail snapshot={doc.partySnapshot} name={doc.partyName} link={partyLink ?? (doc.partyId ? `masters/suppliers/${doc.partyId}` : undefined)} />
        </RailSection>
      )}
      <RailSection label="Document">
        <KV items={[{ k: 'Date', v: fmtDate(doc.date) }, ...(doc.dueDate ? [{ k: 'Due', v: fmtDate(doc.dueDate) }] : []), { k: 'Branch', v: db.find<any>(C.branches, doc.branchId)?.name ?? '—' }, { k: 'Currency', v: doc.currency !== s.currency ? `${doc.currency} @ ${doc.rate} (${doc.rateType ?? 'Spot'})` : doc.currency }, ...(doc.reference ? [{ k: 'Reference', v: doc.reference }] : []), ...(doc.sourceNumber ? [{ k: 'Source', v: doc.sourceNumber }] : []), ...(facts ?? [])]} />
      </RailSection>
      {children}
      <RailSection label="Audit">
        <KV items={[{ k: 'Created', v: `${fmtDateTime(doc.createdAt)} · ${doc.createdBy ?? '—'}` }, ...(doc.submittedAt ? [{ k: 'Submitted', v: `${fmtDateTime(doc.submittedAt)} · ${doc.submittedBy}` }] : []), ...(doc.postedAt ? [{ k: 'Posted', v: `${fmtDateTime(doc.postedAt)} · ${doc.postedBy}` }] : []), ...(doc.reversalReason ? [{ k: 'Reversed', v: doc.reversalReason }] : []), ...(doc.cancelReason ? [{ k: 'Cancelled', v: doc.cancelReason }] : []), { k: 'Version', v: `v${doc.version}` }]} />
      </RailSection>
    </>
  );
}

export function StatusCell({ status, extra }: { status: string; extra?: ReactNode }) {
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={status} />{extra}</span>;
}

export function MoneyCell({ value, currency = 'INR', bold }: { value: number; currency?: string; bold?: boolean }) {
  return <Money value={value} currency={currency} style={bold ? { fontWeight: 600 } : undefined} />;
}
