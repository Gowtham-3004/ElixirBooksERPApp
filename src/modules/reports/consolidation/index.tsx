// Group & consolidation sub-routes for the Reports module (FR-CNS-001..006, FR-RPT-012..014).
// Routes: reports/consolidation[/group|runs|runs/<id>|statements|eliminations|intercompany|drilldown]
import type { Route } from '../../../store';
import { PageHeader, Card, Button, KpiTile } from '../../../components/ui';
import { nav, useCollection, C } from '../../../store';
import { GroupStructure } from './GroupStructure';
import { RunsRegister } from './Runs';
import { RunPage } from './RunPage';
import { TranslatedStatements } from './Statements';
import { EliminationsRegister } from './Eliminations';
import { IntercompanyPanel } from './Intercompany';
import { DrillDown } from './DrillDown';
import type { ConsolidationRun, Group, IntercompanyDoc } from './types';

export const CONSOLIDATION_ITEMS = [
  { id: 'consolidation', label: 'Group overview', group: 'Group' },
  { id: 'consolidation/group', label: 'Group structure', group: 'Group' },
  { id: 'consolidation/runs', label: 'Consolidation runs', group: 'Group' },
  { id: 'consolidation/statements', label: 'Translated statements', group: 'Group' },
  { id: 'consolidation/eliminations', label: 'Eliminations', group: 'Group' },
  { id: 'consolidation/intercompany', label: 'Intercompany matching', group: 'Group' },
  { id: 'consolidation/drilldown', label: 'Drill-down', group: 'Group' },
];

/** Renders a consolidation page from the route; `reports/consolidation/<page>/<id>`. */
export default function Consolidation({ route }: { route: Route }) {
  const page = route.id || '';
  switch (page) {
    case 'group': return <GroupStructure />;
    case 'runs': return route.rest[0] ? <RunPage id={route.rest[0]} /> : <RunsRegister />;
    case 'statements': return <TranslatedStatements />;
    case 'eliminations': return <EliminationsRegister />;
    case 'intercompany': return <IntercompanyOverview />;
    case 'drilldown': return <DrillDown />;
    default: return <GroupOverview />;
  }
}

function IntercompanyOverview() {
  return (
    <div className="page">
      <PageHeader title="Intercompany matching" subtitle="Both entities, due-to / due-from and elimination metadata on every intercompany document (FR-ORG-012, FR-CNS-005)" />
      <IntercompanyPanel />
    </div>
  );
}

function GroupOverview() {
  const groups = useCollection<Group>(C.groups);
  const runs = useCollection<ConsolidationRun>(C.consolidationRuns);
  const docs = useCollection<IntercompanyDoc>(C.intercompanyDocs);
  const group = groups[0];
  const finals = runs.filter((r) => r.status === 'Final');
  const latest = finals.sort((a, b) => b.to.localeCompare(a.to))[0];
  const open = docs.filter((d) => d.matchStatus !== 'Matched');
  return (
    <div className="page">
      <PageHeader
        title="Group & consolidation"
        subtitle={group ? `${group.name} · ${group.members.length} companies · consolidated in ${group.consolidationCurrency} under ${group.accountingStandard}` : 'No group defined yet'}
        actions={<Button variant="primary" onClick={() => nav.go('reports/consolidation/runs')}>Consolidation runs</Button>}
      />
      <div className="grid-4">
        <KpiTile label="Member companies" value={String(group?.members.length ?? 0)} sub="Each independently balanced" onClick={() => nav.go('reports/consolidation/group')} />
        <KpiTile label="Consolidation runs" value={String(runs.length)} sub={`${finals.length} final`} onClick={() => nav.go('reports/consolidation/runs')} />
        <KpiTile label="Latest final run" value={latest?.number ?? '—'} sub={latest ? `CTA ${(-latest.cta).toLocaleString('en-IN')} ${latest.currency}` : 'Nothing finalized'} onClick={latest ? () => nav.go('reports/consolidation/statements', { run: latest.id }) : undefined} />
        <KpiTile label="Intercompany to resolve" value={String(open.length)} sub={`${docs.length} documents in total`} onClick={() => nav.go('reports/consolidation/intercompany')} />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="What this module does">
          <ul style={{ margin: '0 0 0 18px', fontSize: 13, lineHeight: 1.9 }}>
            <li><strong>Group structure</strong> — members, ownership periods, method, consolidation currency and rate policy (FR-CNS-001).</li>
            <li><strong>Consolidation runs</strong> — translate each company at closing / average / historical rates and disclose the translation adjustment (FR-CNS-002/003, FR-RPT-013).</li>
            <li><strong>Translated statements</strong> — group P&amp;L and balance sheet with a column per company, eliminations and adjustments (FR-RPT-012).</li>
            <li><strong>Eliminations</strong> — intercompany balances and trading removed at group level, always reversible (FR-CNS-006).</li>
            <li><strong>Intercompany matching</strong> — pair both sides of every intercompany document and explain FX differences (FR-CNS-005, FR-ORG-012).</li>
            <li><strong>Drill-down</strong> — consolidated figure → company line → source journal (FR-RPT-014).</li>
          </ul>
        </Card>
        <Card title="Boundary guarantees">
          <ul style={{ margin: '0 0 0 18px', fontSize: 13, lineHeight: 1.9 }}>
            <li>No transaction ever mixes legal companies; intercompany activity is two journals, one per company (FR-ORG-011).</li>
            <li>Translation, eliminations and consolidation adjustments live in the group book — never in a company’s journals (FR-CNS-004, FR-FX-014).</li>
            <li>Each company keeps its own localization pack, financial year, periods, banks and number series (FRD §3.5).</li>
          </ul>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={() => nav.go('reports/consolidation/group')}>Group structure</Button>
            <Button variant="secondary" size="sm" onClick={() => nav.go('reports/consolidation/statements')}>Translated statements</Button>
            <Button variant="secondary" size="sm" onClick={() => nav.go('reports/consolidation/intercompany')}>Intercompany</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
