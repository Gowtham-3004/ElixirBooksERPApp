// Reports & CFO dashboard module (FR-RPT-001..011). Grouped sub-navigation; every report uses ReportFrame.
import type { ModuleProps } from '../registry';
import { ModuleShell, NoPermission } from '../../components/ui';
import { useSession } from '../../store';
import { CfoDashboard } from './Dashboard';
import { ProfitLoss, BalanceSheetPage, CashFlowPage, TrialBalancePage, JournalRegister } from './Financial';
import { AgeingReport, OutstandingReport, CollectionsReport } from './Parties';
import { StockLedger, OnHandReport, ValuationReport, MovementReport, StockAgeingReport, ReorderReport, CountVarianceReport } from './Inventory';
import { TradeAnalysis, MarginReport, ProfitabilityReport, BudgetVarianceReport } from './Analysis';
import { GstSummaryReport, TdsReport, FxExposureReport, FxGainLossReport, RateAuditReport } from './TaxFx';
import { SavedReports } from './Saved';
import Consolidation from './consolidation';
import { reportsNav } from '../subnav';


export default function Module({ route }: ModuleProps) {
  const s = useSession();
  const items = reportsNav(s);
  return (
    <ModuleShell module="reports" title="Reports & CFO dashboard" items={items} defaultSub="dashboard">
      {(sub) => {
        if (!s.can('reports.view') && !s.can('reports.*') && !s.permissions.some((p) => p.startsWith('reports.'))) return <NoPermission what="Reports" />;
        switch (sub) {
          case 'dashboard': return <CfoDashboard />;
          case 'pl': return <ProfitLoss />;
          case 'balance-sheet': return <BalanceSheetPage />;
          case 'cash-flow': return <CashFlowPage />;
          case 'trial-balance': return <TrialBalancePage />;
          case 'journal-register': return <JournalRegister />;
          case 'ar-ageing': return <AgeingReport partyType="Customer" />;
          case 'customer-outstanding': return <OutstandingReport partyType="Customer" />;
          case 'collections': return <CollectionsReport partyType="Customer" />;
          case 'ap-ageing': return <AgeingReport partyType="Supplier" />;
          case 'supplier-outstanding': return <OutstandingReport partyType="Supplier" />;
          case 'due-schedule': return <CollectionsReport partyType="Supplier" />;
          case 'stock-ledger': return <StockLedger />;
          case 'stock-onhand': return <OnHandReport />;
          case 'stock-valuation': return <ValuationReport />;
          case 'stock-movement': return <MovementReport />;
          case 'stock-ageing': return <StockAgeingReport />;
          case 'reorder': return <ReorderReport />;
          case 'count-variance': return <CountVarianceReport />;
          case 'sales-analysis': return <TradeAnalysis direction="sale" />;
          case 'purchase-analysis': return <TradeAnalysis direction="purchase" />;
          case 'margin': return <MarginReport />;
          case 'gst-summary': return <GstSummaryReport />;
          case 'tds': return <TdsReport />;
          case 'fx-exposure': return <FxExposureReport />;
          case 'fx-gainloss': return <FxGainLossReport />;
          case 'fx-rates': return <RateAuditReport />;
          case 'budget-variance': return <BudgetVarianceReport />;
          case 'profitability': return <ProfitabilityReport />;
          case 'consolidation': return <Consolidation route={route} />;
          case 'saved': return <SavedReports />;
          default: return <CfoDashboard />;
        }
      }}
    </ModuleShell>
  );
}

