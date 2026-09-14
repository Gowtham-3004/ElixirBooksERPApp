// "Have a GSTIN?" panel shared by registration (step 2) and the onboarding wizard (Legal identity).
// Fetches the taxpayer record via lib/gstLookup and hands it to the parent, which prefills its own
// fields. Once applied the panel collapses to a one-line strip (GSTIN · legal name · status) so the
// form below does not move; "Details" opens the full record in a popover that floats over the form
// (scrolling internally), and a different GSTIN goes behind "Change".
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GstinDetails } from '../../store';
import { fmtDate, fmtDateTime, validateGSTIN } from '../../lib/format';
import { lookupGstin } from '../../lib/gstLookup';
import { TextField } from '../../components/ui/fields';
import { Banner, Button, KV, Pill } from '../../components/ui';
import { ChevronDownIcon, SearchIcon, ShieldCheckIcon } from '../../components/Icons';

interface Props {
  /** The lookup currently applied to the form (drives the compact strip), or null. */
  value: GstinDetails | null;
  onFetched: (d: GstinDetails) => void;
  onClear: () => void;
  /** Seeds the input when nothing has been fetched yet (e.g. a GSTIN typed in the registrations list). */
  initialGstin?: string;
  note?: ReactNode;
  style?: CSSProperties;
}

const STATUS_TONE: Record<GstinDetails['status'], 'good' | 'warning' | 'critical'> = { Active: 'good', Suspended: 'warning', Cancelled: 'critical' };

export default function GstinLookup({ value, onFetched, onClear, initialGstin, note, style }: Props) {
  const [gstin, setGstin] = useState(value?.gstin ?? initialGstin ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [changing, setChanging] = useState(false);
  // Drop a late result if the step / screen unmounted mid-fetch. Reset inside the effect: StrictMode
  // runs the cleanup once on mount and the ref must come back to true.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Details popover closes on outside click / Escape, like the shared Popover primitive.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showDetails) return;
    const onDown = (e: MouseEvent) => { if (cardRef.current && !cardRef.current.contains(e.target as Node)) setShowDetails(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowDetails(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showDetails]);

  const run = async () => {
    const v = gstin.replace(/\s+/g, '').toUpperCase();
    const err = v ? validateGSTIN(v) : 'Enter a GSTIN';
    if (err) { setError(err); return; }
    setError(null);
    setBusy(true);
    try {
      const d = await lookupGstin(v);
      if (!alive.current) return;
      setGstin(d.gstin);
      setChanging(false);
      setShowDetails(false);
      onFetched(d);
    } catch (e: any) {
      if (alive.current) setError(e?.message ?? 'Lookup failed');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const clear = () => { onClear(); setError(null); setChanging(false); setShowDetails(false); };

  const applied = !!value;
  const showInput = !applied || changing;
  const a = value?.address;
  const addressLine = a ? [a.line1, a.line2, `${a.city}${a.state ? `, ${a.state}` : ''}${a.pin ? ` ${a.pin}` : ''}`].filter(Boolean).join(' · ') : '';

  return (
    <div ref={cardRef} className="card" style={{ position: 'relative', padding: applied ? '10px 14px' : 16, background: 'var(--surface-2)', ...style }}>
      {!applied && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: note ? 2 : 10 }}>
            <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><ShieldCheckIcon size={16} /></span>
            <div className="section-title" style={{ marginBottom: 0 }}>Have a GSTIN? Fetch your company details</div>
          </div>
          {note && <div className="field-help" style={{ marginTop: 0, marginBottom: 10 }}>{note}</div>}
        </>
      )}
      {value && (
        <>
          {/* Compact strip — keeps the form below from moving after a fetch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', color: 'var(--accent)', flexShrink: 0 }}><ShieldCheckIcon size={16} /></span>
            <span className="identifier" style={{ fontWeight: 600, color: 'var(--ink)' }}>{value.gstin}</span>
            <span style={{ color: 'var(--ink-4)' }}>·</span>
            <span style={{ flex: 1, minWidth: 120, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={value.legalName}>{value.legalName}</span>
            <Pill tone={STATUS_TONE[value.status]}>{value.status}</Pill>
            <span style={{ display: 'flex', gap: 2, marginLeft: 'auto', flexShrink: 0 }}>
              <Button size="sm" variant="ghost" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails} title="Show the fetched record">
                {showDetails ? 'Hide details' : 'Details'} <span style={{ display: 'inline-flex', transform: showDetails ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}><ChevronDownIcon size={12} /></span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setChanging((v) => !v); setError(null); }} disabled={busy}>{changing ? 'Cancel' : 'Change'}</Button>
              <Button size="sm" variant="ghost" onClick={clear} disabled={busy}>Clear</Button>
            </span>
          </div>
          {value.status !== 'Active' && (
            <Banner tone="warning" style={{ marginTop: 8 }}>This GSTIN is {value.status.toLowerCase()} on the GST portal. You can continue, but documents issued under it will fail e-invoicing.</Banner>
          )}
          {showDetails && (
            <div className="popover" role="dialog" aria-label="Fetched GSTIN record" onClick={(e) => e.stopPropagation()}
              style={{ left: 0, right: 0, width: 'auto', top: '100%', marginTop: 6, maxHeight: 300, overflowY: 'auto' }}>
              <KV items={[
                { k: 'Legal name', v: value.legalName },
                { k: 'Trade name', v: value.tradeName },
                { k: 'PAN', v: <span className="identifier">{value.pan}</span> },
                { k: 'Constitution', v: value.constitution },
                { k: 'Taxpayer type', v: value.taxpayerType },
                { k: 'Registered address', v: addressLine },
                { k: 'Registered on', v: value.registrationDate ? fmtDate(value.registrationDate) : '—' },
              ]} />
              <div className="field-help" style={{ marginTop: 8 }}>Fetched from {value.provider} · {fmtDateTime(value.fetchedAt)} — prefilled into the form; verify and edit anything that has changed.</div>
            </div>
          )}
        </>
      )}
      {showInput && (
        <div style={{ marginTop: applied ? 10 : 0 }}>
          <label className="field-label">{applied ? 'Fetch a different GSTIN' : 'GSTIN'}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <TextField value={gstin} onChange={(v) => { setGstin(v); if (error) setError(null); }} uppercase maxLength={15} placeholder="27AAAPL1234C1Z5" error={error} style={{ flex: 1 }}
              inputStyle={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }} disabled={busy} autoFocus={changing}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }} />
            <Button variant="primary" loading={busy} icon={<SearchIcon size={14} />} onClick={() => void run()} style={{ flexShrink: 0 }}>Fetch details</Button>
          </div>
        </div>
      )}
    </div>
  );
}
