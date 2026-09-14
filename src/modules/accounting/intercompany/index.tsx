// Accounting › Intercompany (FR-ORG-011/012): a compact Finance view of due-to / due-from balances,
// intercompany matching and the "create intercompany transaction" flow. Shares the components used by
// Reports › Group › Intercompany matching so both surfaces behave identically.
import { C, nav, useCollection, useSession } from '../../../store';
import { Banner, Button, KpiTile, PageHeader } from '../../../components/ui';
import { fmtMoney } from '../../../lib/format';
import { IntercompanyPanel } from '../../reports/consolidation/Intercompany';
import { companyName, dueBalances } from '../../reports/consolidation/lib';
import type { IntercompanyDoc } from '../../reports/consolidation/types';

export function IntercompanyPage() {
  const s = useSession();
  const docs = useCollection<IntercompanyDoc>(C.intercompanyDocs);
  const journals = useCollection(C.journals);
  const mine = docs.filter((d) => d.fromCompanyId === s.state.companyId || d.toCompanyId === s.state.companyId);
  const open = mine.filter((d) => d.matchStatus !== 'Matched');
  const dues = journals.length >= 0 ? dueBalances().filter((d) => d.companyId === s.state.companyId) : [];
  const receivable = dues.reduce((a, b) => a + b.receivable, 0);
  const payable = dues.reduce((a, b) => a + b.payable, 0);

  return (
    <div className="page">
      <PageHeader
        title="Intercompany"
        subtitle={<>Due-to / due-from with the other companies of this tenant · a transaction never spans two legal companies (FR-ORG-011/012)</>}
        actions={<Button variant="secondary" onClick={() => nav.go('reports/consolidation/intercompany')}>Group view &amp; eliminations</Button>}
      />
      <div className="grid-4">
        <KpiTile label="Due from counterparties" amount={receivable} currency={s.currency} sub={`${dues.length} counterpart${dues.length === 1 ? 'y' : 'ies'} in ${s.company?.tradeName ?? 'this company'}`} />
        <KpiTile label="Due to counterparties" amount={payable} currency={s.currency} sub="Intercompany payable control account" />
        <KpiTile label="Net position" amount={receivable - payable} currency={s.currency} deltaTone={receivable - payable >= 0 ? 'good' : 'bad'} delta={receivable - payable >= 0 ? 'Net receivable' : 'Net payable'} sub={s.currency} />
        <KpiTile label="Documents to resolve" value={String(open.length)} sub={`${mine.length} intercompany documents involve ${s.company?.tradeName ?? 'this company'}`} />
      </div>
      {open.length > 0 && (
        <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('reports/consolidation/eliminations')}>See eliminations</Button>}>
          {open.length} intercompany document(s) involving {companyName(s.state.companyId)} are not fully matched — unmatched balances survive consolidation and distort the group position.
        </Banner>
      )}
      <IntercompanyPanel compact />
    </div>
  );
}

export default IntercompanyPage;
