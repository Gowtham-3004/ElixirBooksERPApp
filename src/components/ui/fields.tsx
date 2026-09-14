import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fmtMoney, validateGSTIN, validateIFSC, validatePAN, validateEmail, validatePIN } from '../../lib/format';
import { db, C, engine, useCollection } from '../../store';
import type { BaseRecord } from '../../store';
import { SearchIcon, XIcon } from '../Icons';
import { TwoLine } from './primitives';

// ── Field wrapper ──────────────────────────────────────────────────────────

export interface FieldProps {
  label?: ReactNode;
  required?: boolean;
  error?: string | null;
  help?: ReactNode;
  style?: CSSProperties;
  className?: string;
  inline?: boolean;
  children?: ReactNode;
}

export function Field({ label, required, error, help, style, className = '', children }: FieldProps) {
  return (
    <div className={className} style={style}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <div className="field-error">{error}</div> : help ? <div className="field-help">{help}</div> : null}
    </div>
  );
}

type Size = 'md' | 'sm' | 'grid';
const sizeCls = (s?: Size) => (s === 'sm' ? 'sm' : s === 'grid' ? 'grid' : '');

export function TextField({ value, onChange, label, required, error, help, placeholder, disabled, size, type = 'text', autoFocus, style, inputStyle, onBlur, onKeyDown, maxLength, uppercase, prefix, suffix }: FieldProps & { value: string | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; size?: Size; type?: string; autoFocus?: boolean; inputStyle?: CSSProperties; onBlur?: () => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; maxLength?: number; uppercase?: boolean; prefix?: ReactNode; suffix?: ReactNode }) {
  const input = (
    <input
      className={`field-input ${sizeCls(size)} ${error ? 'error' : ''}`}
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      style={{ ...(prefix ? { paddingLeft: 40 } : {}), ...(suffix ? { paddingRight: 40 } : {}), ...inputStyle }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      maxLength={maxLength}
    />
  );
  return (
    <Field label={label} required={required} error={error} help={help} style={style}>
      {prefix || suffix ? (
        <div style={{ position: 'relative' }}>
          {prefix && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontSize: 13, display: 'flex' }}>{prefix}</span>}
          {input}
          {suffix && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontSize: 13, display: 'flex' }}>{suffix}</span>}
        </div>
      ) : input}
    </Field>
  );
}

export function TextArea({ value, onChange, label, required, error, help, placeholder, disabled, rows = 3, style, minLength }: FieldProps & { value: string | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; rows?: number; minLength?: number }) {
  return (
    <Field label={label} required={required} error={error} help={help ?? (minLength ? `Minimum ${minLength} characters` : undefined)} style={style}>
      <textarea className={`field-input ${error ? 'error' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} rows={rows} />
    </Field>
  );
}

/** Reason field — required, min length (FR-ORG-005, FR-INV-005, FR-SAL-014 …) */
export function ReasonField({ value, onChange, label = 'Reason', error, minLength = 10, style, placeholder = 'State the business reason — this is recorded in the audit trail' }: { value: string; onChange: (v: string) => void; label?: string; error?: string | null; minLength?: number; style?: CSSProperties; placeholder?: string }) {
  const err = error ?? (value && value.trim().length < minLength ? `Reason must be at least ${minLength} characters` : null);
  return <TextArea label={label} required value={value} onChange={onChange} error={err} minLength={minLength} placeholder={placeholder} style={style} />;
}

export function NumberField({ value, onChange, label, required, error, help, placeholder, disabled, size, decimals = 2, min, max, style, suffix, prefix, autoFocus, onBlur, onKeyDown, align = 'right' }: FieldProps & { value: number | undefined | null; onChange: (v: number) => void; placeholder?: string; disabled?: boolean; size?: Size; decimals?: number; min?: number; max?: number; suffix?: ReactNode; prefix?: ReactNode; autoFocus?: boolean; onBlur?: () => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; align?: 'left' | 'right' }) {
  const [text, setText] = useState(value === undefined || value === null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === undefined || value === null || isNaN(value) ? '' : String(value));
  }, [value]);
  return (
    <Field label={label} required={required} error={error} help={help} style={style}>
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontSize: 13 }}>{prefix}</span>}
        <input
          className={`field-input ${sizeCls(size)} ${align === 'right' ? 'num' : ''} ${error ? 'error' : ''}`}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          style={{ ...(prefix ? { paddingLeft: 40 } : {}), ...(suffix ? { paddingRight: 36 } : {}) }}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.\-]/g, '');
            setText(raw);
            const n = parseFloat(raw);
            if (!isNaN(n)) onChange(n);
            else if (raw === '' || raw === '-') onChange(0);
          }}
          onBlur={() => {
            focused.current = false;
            let n = parseFloat(text.replace(/,/g, ''));
            if (isNaN(n)) n = 0;
            if (min !== undefined && n < min) n = min;
            if (max !== undefined && n > max) n = max;
            n = Number(n.toFixed(decimals));
            onChange(n);
            setText(String(n));
            onBlur?.();
          }}
          onKeyDown={onKeyDown}
        />
        {suffix && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontSize: 13 }}>{suffix}</span>}
      </div>
    </Field>
  );
}

export function MoneyField(props: Omit<Parameters<typeof NumberField>[0], 'prefix' | 'decimals'> & { currency?: string; baseEquivalent?: { amount: number; currency: string; rate: number; rateType?: string } }) {
  const { currency = 'INR', baseEquivalent, help, ...rest } = props;
  const sym = currency === 'INR' ? '₹' : currency;
  return <NumberField {...rest} prefix={sym} decimals={2} help={baseEquivalent && baseEquivalent.currency !== currency ? `≈ ${fmtMoney(baseEquivalent.amount, baseEquivalent.currency)} at ${baseEquivalent.rate}${baseEquivalent.rateType ? ` (${baseEquivalent.rateType})` : ''}` : help} />;
}

export function PercentField(props: Omit<Parameters<typeof NumberField>[0], 'suffix'>) {
  return <NumberField {...props} suffix="%" min={props.min ?? 0} max={props.max ?? 100} />;
}

export function SelectField<T extends string = string>({ value, onChange, options, label, required, error, help, disabled, size, placeholder, style, allowEmpty }: FieldProps & { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[] | readonly T[]; disabled?: boolean; size?: Size; placeholder?: string; allowEmpty?: boolean }) {
  const opts = (options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) as { value: T; label: string; disabled?: boolean }[];
  return (
    <Field label={label} required={required} error={error} help={help} style={style}>
      <select className={`field-input ${sizeCls(size)} ${error ? 'error' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
        {(placeholder || allowEmpty || value === undefined) && <option value="">{placeholder ?? '— Select —'}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function DateField({ value, onChange, label, required, error, help, disabled, size, style, min, max, checkPeriod }: FieldProps & { value: string | undefined; onChange: (v: string) => void; disabled?: boolean; size?: Size; min?: string; max?: string; checkPeriod?: boolean }) {
  const periodMsg = useMemo(() => {
    if (!checkPeriod || !value) return null;
    const r = engine.postingCheck(value);
    return r.ok ? null : r.reason ?? null;
  }, [checkPeriod, value]);
  return (
    <Field label={label} required={required} error={error ?? periodMsg} help={help} style={style}>
      <input className={`field-input ${sizeCls(size)} ${error || periodMsg ? 'error' : ''}`} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} min={min} max={max} />
    </Field>
  );
}

export function CheckboxField({ checked, onChange, label, help, disabled, style }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode; disabled?: boolean; style?: CSSProperties }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, color: 'var(--ink)', ...style }}>
      <input type="checkbox" className="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} style={{ marginTop: 2 }} />
      <span>
        {label}
        {help && <div className="field-help" style={{ marginTop: 2 }}>{help}</div>}
      </span>
    </label>
  );
}

export function Toggle({ on, onChange, label, disabled, help }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; help?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => !disabled && onChange(!on)} disabled={disabled} aria-pressed={on} />
      {label && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</div>
          {help && <div className="field-help" style={{ marginTop: 0 }}>{help}</div>}
        </div>
      )}
    </div>
  );
}

export function RadioCards<T extends string>({ value, onChange, options, columns = 2, label, required, error, style }: FieldProps & { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: string; description?: string; icon?: ReactNode; disabled?: boolean }[]; columns?: number }) {
  return (
    <Field label={label} required={required} error={error} style={style}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 10 }}>
        {options.map((o) => (
          <button key={o.value} type="button" className={`radio-card ${value === o.value ? 'selected' : ''}`} onClick={() => !o.disabled && onChange(o.value)} disabled={o.disabled}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {o.icon && <span style={{ fontSize: 18 }}>{o.icon}</span>}
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${value === o.value ? 'var(--accent)' : 'var(--line-strong)'}`, background: value === o.value ? 'var(--accent)' : '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}>
                {value === o.value && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{o.label}</div>
            {o.description && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{o.description}</div>}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function ChipGroup<T extends string>({ value, onChange, options, multiple, label, style }: { value: T[] | T | undefined; onChange: (v: any) => void; options: { value: T; label: string }[] | readonly T[]; multiple?: boolean; label?: ReactNode; style?: CSSProperties }) {
  const opts = (options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) as { value: T; label: string }[];
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <Field label={label} style={style}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`chip ${selected.has(o.value) ? 'selected' : ''}`}
            onClick={() => {
              if (multiple) {
                const next = new Set(selected);
                if (next.has(o.value)) next.delete(o.value); else next.add(o.value);
                onChange(Array.from(next));
              } else onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size, style }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] | readonly T[]; size?: 'lg'; style?: CSSProperties }) {
  const opts = (options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) as { value: T; label: ReactNode }[];
  return (
    <div className={`segmented ${size === 'lg' ? 'lg' : ''}`} style={style}>
      {opts.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Identifier with pack-supplied validation (GSTIN, PAN, IFSC, …) — FR-ORG-007 */
export function IdentifierField({ kind, value, onChange, label, required, help, style, disabled, size }: { kind: 'GSTIN' | 'PAN' | 'IFSC' | 'EMAIL' | 'PIN' | 'UTR' | 'IBAN' | 'TRN'; value: string | undefined; onChange: (v: string) => void; label?: ReactNode; required?: boolean; help?: ReactNode; style?: CSSProperties; disabled?: boolean; size?: Size }) {
  const [touched, setTouched] = useState(false);
  const validator = kind === 'GSTIN' ? validateGSTIN : kind === 'PAN' ? validatePAN : kind === 'IFSC' ? validateIFSC : kind === 'EMAIL' ? validateEmail : kind === 'PIN' ? validatePIN : () => null;
  const err = touched && value ? validator(value) : null;
  const maxLen = kind === 'GSTIN' ? 15 : kind === 'PAN' ? 10 : kind === 'IFSC' ? 11 : kind === 'PIN' ? 6 : kind === 'TRN' ? 15 : undefined;
  return (
    <TextField label={label ?? kind} required={required} value={value} onChange={(v) => onChange(v)} error={err} help={help} style={style} disabled={disabled} size={size} maxLength={maxLen} uppercase={kind !== 'EMAIL'} onBlur={() => setTouched(true)} inputStyle={{ fontVariantNumeric: 'tabular-nums', letterSpacing: kind === 'EMAIL' ? undefined : '0.04em' }} placeholder={kind === 'GSTIN' ? '27AAAPL1234C1Z5' : kind === 'PAN' ? 'AAAPL1234C' : kind === 'IFSC' ? 'HDFC0001234' : kind === 'PIN' ? '400053' : undefined} />
  );
}

/** Masked value with reveal (audited) — FR-PAY-004, FR-PTY-005 */
export function MaskedValue({ value, canReveal = true, onReveal, last = 4 }: { value: string; canReveal?: boolean; onReveal?: () => void; last?: number }) {
  const [shown, setShown] = useState(false);
  const masked = '•••• ' + value.slice(-last);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
      {shown ? value : masked}
      {canReveal && (
        <button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={() => { setShown(!shown); if (!shown) onReveal?.(); }}>
          {shown ? 'Hide' : 'Reveal'}
        </button>
      )}
    </span>
  );
}

// ── Entity picker (combobox) — design §7.4 ────────────────────────────────

export interface PickerOption {
  id: string;
  primary: string;
  secondary?: string;
  keywords?: string;
  disabled?: boolean;
  raw?: any;
}

export function EntityPicker({ value, onChange, options, label, required, error, help, placeholder = 'Search…', disabled, size, style, onCreate, createLabel, recentKey, allowClear = true, autoFocus, renderSelected }: FieldProps & { value: string | undefined; onChange: (id: string | undefined, opt?: PickerOption) => void; options: PickerOption[]; placeholder?: string; disabled?: boolean; size?: Size; onCreate?: (query: string) => void; createLabel?: string; recentKey?: string; allowClear?: boolean; autoFocus?: boolean; renderSelected?: (opt: PickerOption) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const recent: string[] = useMemo(() => {
    if (!recentKey) return [];
    try { return JSON.parse(localStorage.getItem('recent:' + recentKey) ?? '[]'); } catch { return []; }
  }, [recentKey, open]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? options.filter((o) => `${o.primary} ${o.secondary ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(term)) : options;
    return list.slice(0, 50);
  }, [q, options]);
  const recentOpts = !q && recent.length ? recent.map((id) => options.find((o) => o.id === id)).filter(Boolean).slice(0, 5) as PickerOption[] : [];
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (o: PickerOption) => {
    if (o.disabled) return;
    onChange(o.id, o);
    setOpen(false);
    setQ('');
    if (recentKey) {
      try { localStorage.setItem('recent:' + recentKey, JSON.stringify([o.id, ...recent.filter((r) => r !== o.id)].slice(0, 5))); } catch { /* ignore */ }
    }
  };
  const all = [...recentOpts, ...filtered.filter((f) => !recentOpts.some((r) => r.id === f.id))];
  return (
    <Field label={label} required={required} error={error} help={help} style={style}>
      <div ref={ref} style={{ position: 'relative' }}>
        <div className={`field-input ${sizeCls(size)} ${error ? 'error' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', cursor: disabled ? 'not-allowed' : 'text', background: disabled ? 'var(--surface-2)' : '#FFF' }} onClick={() => !disabled && setOpen(true)}>
          <SearchIcon size={14} color="var(--ink-5)" />
          {selected && !open ? (
            <span style={{ flex: 1, fontSize: size === 'grid' || size === 'sm' ? 13 : 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{renderSelected ? renderSelected(selected) : selected.primary}</span>
          ) : (
            <input
              autoFocus={autoFocus}
              value={q}
              disabled={disabled}
              placeholder={selected ? selected.primary : placeholder}
              onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(all.length - 1, h + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
                else if (e.key === 'Enter' || e.key === 'Tab') { if (all[hi]) { if (e.key === 'Enter') e.preventDefault(); pick(all[hi]); } }
                else if (e.key === 'Escape') setOpen(false);
              }}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontFamily: 'inherit', minWidth: 0 }}
            />
          )}
          {selected && allowClear && !disabled && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(undefined); setQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-5)', display: 'flex', padding: 0 }}>
              <XIcon size={14} />
            </button>
          )}
        </div>
        {open && !disabled && (
          <div className="menu" style={{ left: 0, right: 0, top: '100%', marginTop: 4, maxHeight: 320, overflow: 'auto', padding: 4 }}>
            {recentOpts.length > 0 && <div className="section-label" style={{ padding: '6px 10px 2px' }}>Recent</div>}
            {all.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ink-3)' }}>No matches{q ? ` for "${q}"` : ''}</div>}
            {all.map((o, i) => (
              <div key={o.id}>
                {i === recentOpts.length && recentOpts.length > 0 && <div className="section-label" style={{ padding: '6px 10px 2px' }}>Results</div>}
                <button type="button" className="menu-item" style={{ height: 'auto', padding: '6px 10px', background: hi === i ? 'var(--surface-3)' : undefined, opacity: o.disabled ? 0.5 : 1 }} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
                  <TwoLine primary={o.primary} secondary={o.secondary} />
                </button>
              </div>
            ))}
            {onCreate && (
              <>
                <div className="menu-sep" />
                <button type="button" className="menu-item" style={{ color: 'var(--accent)' }} onMouseDown={(e) => { e.preventDefault(); onCreate(q); setOpen(false); }}>
                  + {createLabel ?? `Create "${q || 'new'}"`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

/** Convenience: picker options from a store collection. */
export function optionsFrom<T extends BaseRecord & Record<string, any>>(rows: T[], map: (r: T) => Omit<PickerOption, 'id'> & { id?: string }): PickerOption[] {
  return rows.map((r) => ({ id: r.id, raw: r, ...map(r) }));
}

export function useCustomerOptions(): PickerOption[] {
  const rows = useCollection<any>(C.customers);
  return rows.map((c) => ({ id: c.id, primary: c.name, secondary: [c.gstin, c.addresses?.[0]?.address?.city].filter(Boolean).join(' · '), keywords: c.code, disabled: c.status !== 'Active', raw: c }));
}

export function useSupplierOptions(): PickerOption[] {
  return useCollection<any>(C.suppliers).map((s) => ({ id: s.id, primary: s.name, secondary: [s.gstin, s.addresses?.[0]?.address?.city].filter(Boolean).join(' · '), keywords: s.code, disabled: s.status !== 'Active', raw: s }));
}

export function useItemOptions(filter?: (i: any) => boolean): PickerOption[] {
  return useCollection<any>(C.items).filter((i) => (filter ? filter(i) : true)).map((i) => ({ id: i.id, primary: i.name, secondary: `${i.code}${i.hsn ? ' · HSN ' + i.hsn : ''} · ${i.baseUom}`, keywords: `${i.code} ${i.barcode ?? ''} ${i.group ?? ''}`, disabled: i.status !== 'Active', raw: i }));
}

export function useAccountOptions(filter?: (a: any) => boolean): PickerOption[] {
  return useCollection<any>(C.accounts).filter((a) => a.status === 'Active' && a.postingAllowed && (filter ? filter(a) : true)).map((a) => ({ id: a.id, primary: `${a.code} · ${a.name}`, secondary: a.type + (a.isControl ? ' · Control' : ''), keywords: a.code, raw: a }));
}

export function useEmployeeOptions(): PickerOption[] {
  return useCollection<any>(C.employees).map((e) => ({ id: e.id, primary: e.name, secondary: `${e.code} · ${e.department}`, disabled: e.status === 'Resigned' || e.status === 'Terminated', raw: e }));
}

export function useWarehouseOptions(): PickerOption[] {
  return useCollection<any>(C.warehouses).filter((w) => w.status === 'Active').map((w) => ({ id: w.id, primary: w.name, secondary: w.code + (w.type !== 'Standard' ? ' · ' + w.type : ''), raw: w }));
}

export function useUserOptions(): PickerOption[] {
  return useCollection<any>(C.users).filter((u) => u.status === 'Active').map((u) => ({ id: u.id, primary: u.name, secondary: u.email, raw: u }));
}

export function useDimensionOptions(type?: string): PickerOption[] {
  return useCollection<any>(C.dimensions).filter((d) => d.status === 'Active' && (!type || d.type === type)).map((d) => ({ id: d.id, primary: d.name, secondary: `${d.type} · ${d.code}`, raw: d }));
}

export function useTaxRateOptions(): { value: string; label: string }[] {
  return useCollection<any>(C.taxRates).filter((t) => t.status === 'Active').map((t) => ({ value: t.id, label: t.name }));
}
