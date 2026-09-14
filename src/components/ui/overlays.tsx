import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { XIcon, MoreVertIcon, ArrowsSwapIcon, PackageIcon, FlagIcon, PieChartIcon, CheckIcon, AlertTriangleIcon, MailIcon, HashIcon, InfoCircleIcon, ChevronDownIcon, CircleDotIcon } from '../Icons';
import { Button, Spinner, type ButtonVariant, type ButtonTone } from './primitives';
import { ReasonField } from './fields';
import { nav } from '../../store';

// ── Drawer ─────────────────────────────────────────────────────────────────

export function Drawer({ open, onClose, title, subtitle, width = 720, children, footer, headerRight }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; width?: number | string; children: ReactNode; footer?: ReactNode; headerRight?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" style={{ width }} role="dialog" aria-modal>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
              {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, description, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} style={{ zIndex: 101 }} />
      <div className="modal" style={{ width }} role="dialog" aria-modal>
        <div className="modal-header">
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{title}</h2>
          {description && <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>{description}</p>}
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </>
  );
}

// ── Financial confirmation dialog (design §7.11) ───────────────────────────

export interface Consequence {
  icon?: ReactNode;
  engine: 'Journal' | 'Stock' | 'Tax' | 'Open items' | 'Workflow' | 'Statutory' | 'Notification' | 'Numbering' | string;
  text: ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
}

export function ConfirmDialog({ open, onClose, onConfirm, title, statement, consequences = [], reasonRequired, confirmLabel, cancelLabel = 'Keep as is', danger, tone, children, disabled }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void | Promise<void>; title: ReactNode; statement?: ReactNode; consequences?: Consequence[]; reasonRequired?: boolean; confirmLabel: string; cancelLabel?: string; danger?: boolean; tone?: ButtonTone; children?: ReactNode; disabled?: boolean }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(''); setErr(null); setBusy(false); } }, [open]);
  const submit = async () => {
    if (busy) return;
    if (reasonRequired && reason.trim().length < 10) { setErr('Reason must be at least 10 characters'); return; }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? 'Action failed');
      setBusy(false);
    }
  };
  const toneBg: Record<string, string> = { info: 'var(--info-bg)', warning: 'var(--warn-bg)', danger: 'var(--danger-bg)', success: 'var(--good-bg)' };
  const toneFg: Record<string, string> = { info: 'var(--info)', warning: 'var(--warn)', danger: 'var(--danger)', success: 'var(--good)' };
  const engineIcon: Record<string, ReactNode> = { Journal: <ArrowsSwapIcon size={13} />, Stock: <PackageIcon size={13} />, Tax: <FlagIcon size={13} />, 'Open items': <PieChartIcon size={13} />, Workflow: <CheckIcon size={13} />, Statutory: <AlertTriangleIcon size={13} />, Notification: <MailIcon size={13} />, Numbering: <HashIcon size={13} /> };
  return (
    <Modal open={open} onClose={onClose} title={title} description={statement}>
      {consequences.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>What will happen</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {consequences.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: toneBg[c.tone ?? 'info'], color: toneFg[c.tone ?? 'info'], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12 }}>{c.icon ?? engineIcon[c.engine] ?? <CircleDotIcon size={13} />}</span>
                <span style={{ color: 'var(--ink)' }}><strong style={{ fontWeight: 600 }}>{c.engine}</strong> · {c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {children}
      {reasonRequired && <ReasonField value={reason} onChange={setReason} error={err && reason.trim().length < 10 ? err : null} />}
      {err && !(reasonRequired && reason.trim().length < 10) && <div className="banner danger" style={{ marginTop: 12 }}>{err}</div>}
      <div className="modal-footer" style={{ padding: '16px 0 0' }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} tone={danger ? undefined : tone} onClick={submit} loading={busy} disabled={disabled}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ── Popover (calculation explanation §7.10) ───────────────────────────────

export function Popover({ trigger, children, width = 320, align = 'left' }: { trigger: ReactNode; children: ReactNode; width?: number; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ cursor: 'pointer', display: 'inline-flex' }}>{trigger}</span>
      {open && (
        <div className="popover" style={{ width, top: '100%', marginTop: 6, [align]: 0 }} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </span>
  );
}

export function InfoIcon() {
  return <span style={{ color: 'var(--ink-3)', marginLeft: 3, cursor: 'help', display: 'inline-flex', verticalAlign: 'middle' }}><InfoCircleIcon size={12} /></span>;
}

export function Explain({ title, rows, note, link }: { title: string; rows: { k: string; v: ReactNode }[]; note?: ReactNode; link?: { label: string; path: string } }) {
  return (
    <Popover trigger={<InfoIcon />}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div className="kv" style={{ gridTemplateColumns: '120px 1fr', fontSize: 12 }}>
        {rows.map((r) => (
          <div key={r.k} style={{ display: 'contents' }}>
            <span className="k">{r.k}</span>
            <span className="v" style={{ fontWeight: 400 }}>{r.v}</span>
          </div>
        ))}
      </div>
      {note && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>{note}</div>}
      {link && <button type="button" className="btn-link" style={{ marginTop: 8, fontSize: 12 }} onClick={() => nav.go(link.path)}>{link.label} →</button>}
    </Popover>
  );
}

// ── Row action menu (⋮) ───────────────────────────────────────────────────

export interface MenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  reason?: string;
  icon?: ReactNode;
  separator?: boolean;
}

export function ActionMenu({ actions, trigger, align = 'right' }: { actions: MenuAction[]; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!actions.length) return null;
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <span onClick={() => setOpen(!open)} style={{ display: 'inline-flex' }}>
        {trigger ?? <button type="button" className="btn-icon"><MoreVertIcon size={14} /></button>}
      </span>
      {open && (
        <div className="menu" style={{ top: '100%', marginTop: 4, [align]: 0 }}>
          {actions.map((a, i) => (
            <div key={i}>
              {a.separator && <div className="menu-sep" />}
              <button type="button" className={`menu-item ${a.danger ? 'danger' : ''}`} disabled={a.disabled} title={a.reason} onClick={() => { setOpen(false); a.onClick(); }}>
                {a.icon}
                {a.label}
                {a.disabled && a.reason && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-5)' }}>{a.reason}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export function SplitButton({ label, variant = 'secondary', onClick, actions, icon }: { label: ReactNode; variant?: ButtonVariant; onClick?: () => void; actions: MenuAction[]; icon?: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex' }}>
      <Button variant={variant} onClick={onClick} icon={icon} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>{label}</Button>
      <ActionMenu actions={actions} trigger={<Button variant={variant} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '0 8px', borderLeft: variant === 'secondary' ? 'none' : undefined }} aria-label="More actions"><ChevronDownIcon size={12} /></Button>} />
    </span>
  );
}

// ── Toasts ─────────────────────────────────────────────────────────────────

interface Toast { id: number; text: ReactNode; tone: 'default' | 'success' | 'error'; link?: { label: string; path: string } }
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'default' ? '' : t.tone}`}>
            <span>{t.text}</span>
            {t.link && <button type="button" className="btn-link" style={{ color: '#fff' }} onClick={() => nav.go(t.link!.path)}>{t.link.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const { push } = useContext(ToastCtx);
  return {
    success: (text: ReactNode, link?: { label: string; path: string }) => push({ text, tone: 'success', link }),
    info: (text: ReactNode, link?: { label: string; path: string }) => push({ text, tone: 'default', link }),
    error: (text: ReactNode) => push({ text, tone: 'error' }),
  };
}

/** Wrap an action with a toast on error (ValidationError → message). */
export function useAction() {
  const toast = useToast();
  return async <T,>(fn: () => T | Promise<T>, successMsg?: ReactNode, link?: { label: string; path: string }): Promise<T | undefined> => {
    try {
      const r = await fn();
      if (successMsg) toast.success(successMsg, link);
      return r;
    } catch (e: any) {
      toast.error(e?.message ?? 'Something went wrong');
      return undefined;
    }
  };
}

export function LoadingOverlay({ label = 'Working…', style }: { label?: string; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-3)', ...style }}>
      <Spinner /> {label}
    </div>
  );
}
