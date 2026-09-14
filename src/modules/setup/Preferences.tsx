// User preferences — per-browser choices (appearance, density, Lixi voice) that used to sit in the
// profile popup. Nothing here is company data; it lives in localStorage through the prefs store.
import { usePrefs, prefs } from '../../store';
import { Card, PageHeader, Segmented, Button } from '../../components/ui';
import { lixi, useLixi } from '../../store/lixi';
import { synthesisSupported } from '../../lib/speech';

function Row({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div className="section-label">{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 2 }}>{help}</div>
      </div>
      {children}
    </div>
  );
}

export default function Preferences() {
  const { theme, density } = usePrefs();
  const lx = useLixi();
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHeader title="User preferences" subtitle="Apply to you, on this browser only. Company settings live under Organization." back={{ label: 'All settings', path: 'setup' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Appearance">
          <Row label="Theme" help="System follows your OS setting">
            <Segmented value={theme} onChange={prefs.setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
          </Row>
        </Card>
        <Card title="Display density">
          <Row label="Rows and spacing" help="Compact fits more rows on screen">
            <Segmented value={density} onChange={prefs.setDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
          </Row>
        </Card>
        <Card title="Lixi">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {synthesisSupported() && (
              <Row label="Read replies aloud" help="Lixi speaks each answer using your browser voice">
                <Segmented value={lx.speak ? 'on' : 'off'} onChange={(v) => lixi.setSpeak(v === 'on')} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
              </Row>
            )}
            <Row label="Conversation" help={lx.thread.length ? `${lx.thread.length} messages kept on this browser` : 'Nothing saved yet'}>
              <Button variant="tinted" tone="danger" size="sm" disabled={!lx.thread.length} onClick={() => lixi.clear()}>Clear conversation</Button>
            </Row>
          </div>
        </Card>
      </div>
    </div>
  );
}
