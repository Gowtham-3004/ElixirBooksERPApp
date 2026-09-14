// Address / contact editors shared by customer & supplier forms (FR-PTY-003).
import type { Address, Contact, PartyAddress } from '../../store';
import { Button, IdentifierField, SelectField, TextField, CheckboxField, Badge } from '../../components/ui';
import { INDIA_STATES, stateCodeOf, uid, validateEmail } from '../../lib/format';

export const emptyAddress = (): Address => ({ line1: '', city: '', state: '', stateCode: '', pin: '', country: 'IN' });

export function AddressFields({ value, onChange, disabled }: { value: Address; onChange: (a: Address) => void; disabled?: boolean }) {
  const set = (p: Partial<Address>) => onChange({ ...value, ...p });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <TextField label="Address line 1" value={value.line1} onChange={(v) => set({ line1: v })} size="sm" disabled={disabled} style={{ gridColumn: '1 / -1' }} />
      <TextField label="Line 2" value={value.line2 ?? ''} onChange={(v) => set({ line2: v })} size="sm" disabled={disabled} style={{ gridColumn: '1 / -1' }} />
      <TextField label="City" value={value.city} onChange={(v) => set({ city: v })} size="sm" disabled={disabled} />
      {value.country === 'IN' ? (
        <SelectField label="State" value={value.state} onChange={(v) => set({ state: v, stateCode: stateCodeOf(v) })} options={INDIA_STATES.map((s) => ({ value: s.name, label: `${s.code} · ${s.name}` }))} size="sm" disabled={disabled} placeholder="— State —" />
      ) : (
        <TextField label="State / region" value={value.state} onChange={(v) => set({ state: v, stateCode: '' })} size="sm" disabled={disabled} />
      )}
      {value.country === 'IN' ? <IdentifierField kind="PIN" label="PIN" value={value.pin} onChange={(v) => set({ pin: v })} size="sm" disabled={disabled} /> : <TextField label="Postal code" value={value.pin ?? ''} onChange={(v) => set({ pin: v })} size="sm" disabled={disabled} />}
      <SelectField label="Country" value={value.country} onChange={(v) => set({ country: v, state: v === 'IN' ? value.state : value.state, stateCode: v === 'IN' ? stateCodeOf(value.state) : '' })} options={['IN', 'AE', 'US', 'GB', 'SG', 'DE', 'JP'].map((c) => ({ value: c, label: c }))} size="sm" disabled={disabled} />
    </div>
  );
}

export function AddressesEditor({ value, onChange, error }: { value: PartyAddress[]; onChange: (v: PartyAddress[]) => void; error?: string | null }) {
  const update = (id: string, patch: Partial<PartyAddress>) => {
    let next = value.map((a) => (a.id === id ? { ...a, ...patch } : a));
    if (patch.isDefault || patch.purpose) {
      // one default per purpose (Both counts for both)
      const me = next.find((a) => a.id === id)!;
      if (me.isDefault) {
        const covers = (p: PartyAddress['purpose']) => (me.purpose === 'Both' ? true : p === 'Both' || p === me.purpose);
        next = next.map((a) => (a.id !== id && a.isDefault && covers(a.purpose) ? { ...a, isDefault: false } : a));
      }
    }
    onChange(next);
  };
  const add = () => onChange([...value, { id: uid('adr'), purpose: value.length ? 'Shipping' : 'Both', isDefault: !value.length, address: emptyAddress() }]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {value.map((a, i) => (
        <div key={a.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <SelectField label={`Address ${i + 1} · purpose`} value={a.purpose} onChange={(v) => update(a.id, { purpose: v as PartyAddress['purpose'] })} options={['Billing', 'Shipping', 'Both']} size="sm" style={{ width: 160 }} />
            <TextField label="Label" value={a.label ?? ''} onChange={(v) => update(a.id, { label: v })} size="sm" placeholder="Head office, Godown…" style={{ flex: 1 }} />
            <IdentifierField kind="GSTIN" label="GSTIN (if different)" value={a.gstin ?? ''} onChange={(v) => update(a.id, { gstin: v })} size="sm" style={{ width: 200 }} />
            <div style={{ paddingBottom: 8 }}><CheckboxField checked={a.isDefault} onChange={(v) => update(a.id, { isDefault: v })} label="Default" /></div>
            <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((x) => x.id !== a.id))} title="Remove address">✕</Button>
          </div>
          <AddressFields value={a.address} onChange={(addr) => update(a.id, { address: addr })} />
        </div>
      ))}
      {error && <div className="field-error">{error}</div>}
      <div><Button variant="secondary" size="sm" onClick={add}>+ Add address</Button></div>
    </div>
  );
}

export function ContactsEditor({ value, onChange }: { value: Contact[]; onChange: (v: Contact[]) => void }) {
  const update = (id: string, patch: Partial<Contact>) => {
    let next = value.map((c) => (c.id === id ? { ...c, ...patch } : c));
    if (patch.isDefault) next = next.map((c) => (c.id !== id ? { ...c, isDefault: false } : c));
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.map((c) => (
        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr 1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
          <TextField label="Name" value={c.name} onChange={(v) => update(c.id, { name: v })} size="sm" />
          <TextField label="Email" value={c.email ?? ''} onChange={(v) => update(c.id, { email: v })} size="sm" error={c.email ? validateEmail(c.email) : null} />
          <TextField label="Phone" value={c.phone ?? ''} onChange={(v) => update(c.id, { phone: v })} size="sm" />
          <TextField label="Designation" value={c.designation ?? ''} onChange={(v) => update(c.id, { designation: v })} size="sm" />
          <SelectField label="Purpose" value={c.purpose ?? 'General'} onChange={(v) => update(c.id, { purpose: v as Contact['purpose'] })} options={['General', 'Billing', 'Delivery', 'Escalation']} size="sm" />
          <div style={{ paddingBottom: 8 }}><CheckboxField checked={c.isDefault} onChange={(v) => update(c.id, { isDefault: v })} label="Default" /></div>
          <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((x) => x.id !== c.id))} title="Remove contact" style={{ marginBottom: 2 }}>✕</Button>
        </div>
      ))}
      <div><Button variant="secondary" size="sm" onClick={() => onChange([...value, { id: uid('ct'), name: '', isDefault: !value.length, purpose: 'General' }])}>+ Add contact</Button></div>
    </div>
  );
}

export function AddressCard({ a }: { a: PartyAddress }) {
  return (
    <div className="card" style={{ padding: 12, fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <Badge status="Draft">{a.purpose}</Badge>
        {a.isDefault && <Badge status="Approved">Default</Badge>}
        {a.label && <span style={{ color: 'var(--ink-3)' }}>{a.label}</span>}
      </div>
      {a.address.line1}{a.address.line2 ? <>, {a.address.line2}</> : null}<br />
      {a.address.city}, {a.address.state} {a.address.pin}<br />
      <span style={{ color: 'var(--ink-3)' }}>{a.address.country}{a.address.stateCode ? ` · state code ${a.address.stateCode}` : ''}{a.gstin ? ` · ${a.gstin}` : ''}</span>
    </div>
  );
}

export function ContactCard({ c }: { c: Contact }) {
  return (
    <div className="card" style={{ padding: 12, fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>{c.name}</strong>
        {c.isDefault && <Badge status="Approved">Default</Badge>}
        {c.purpose && c.purpose !== 'General' && <Badge status="Draft">{c.purpose}</Badge>}
      </div>
      <div style={{ color: 'var(--ink-3)' }}>{[c.designation, c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
    </div>
  );
}
