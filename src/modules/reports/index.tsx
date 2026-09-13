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
import Consolidation, { CONSOLIDATION_ITEMS } from './consolidation';

const ITEMS = [
  { id: 'dashboard', label: 'CFO dashboard', group: 'Dashboard' },
  { id: 'pl', label: 'Profit & Loss', group: 'Financial statements' },
  { id: 'balance-sheet', label: 'Balance sheet', group: 'Financial statements' },
  { id: 'cash-flow', label: 'Cash flow', group: 'Financial statements' },
  { id: 'trial-balance', label: 'Trial balance', group: 'Financial statements' },
  { id: 'journal-register', label: 'Journal register', group: 'Financial statements' },
  { id: 'ar-ageing', label: 'AR ageing', group: 'Receivables' },
  { id: 'customer-outstanding', label: 'Customer outstanding', group: 'Receivables' },
  { id: 'collections', label: 'Collections', group: 'Receivables' },
  { id: 'ap-ageing', label: 'AP ageing', group: 'Payables' },
  { id: 'supplier-outstanding', label: 'Supplier outstanding', group: 'Payables' },
  { id: 'due-schedule', label: 'Due schedule', group: 'Payables' },
  { id: 'stock-ledger', label: 'Stock ledger', group: 'Inventory' },
  { id: 'stock-onhand', label: 'On hand / available', group: 'Inventory' },
  { id: 'stock-valuation', label: 'Valuation', group: 'Inventory' },
  { id: 'stock-movement', label: 'Movement analysis', group: 'Inventory' },
  { id: 'stock-ageing', label: 'Stock ageing', group: 'Inventory' },
  { id: 'reorder', label: 'Reorder', group: 'Inventory' },
  { id: 'count-variance', label: 'Count variance', group: 'Inventory' },
  { id: 'sales-analysis', label: 'Sales analysis', group: 'Sales & purchase' },
  { id: 'purchase-analysis', label: 'Purchase analysis', group: 'Sales & purchase' },
  { id: 'margin', label: 'Gross margin', group: 'Sales & purchase' },
  { id: 'gst-summary', label: 'GST summary', group: 'Tax' },
  { id: 'tds', label: 'TDS register', group: 'Tax' },
  { id: 'fx-exposure', label: 'Currency-wise AR/AP', group: 'FX' },
  { id: 'fx-gainloss', label: 'Gain / loss & revaluation', group: 'FX' },
  { id: 'fx-rates', label: 'Rate audit', group: 'FX' },
  { id: 'budget-variance', label: 'Budget variance', group: 'Planning' },
  { id: 'profitability', label: 'Branch / project profitability', group: 'Planning' },
  ...CONSOLIDATION_ITEMS,
  { id: 'saved', label: 'Saved reports', group: 'Saved' },
];

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  const inventoryOk = s.profiles.includes('Trading') || s.profiles.includes('Manufacturing');
  const items = ITEMS.filter((i) => inventoryOk || i.group !== 'Inventory');
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

