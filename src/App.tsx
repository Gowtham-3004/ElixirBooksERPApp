import { useState } from 'react';
import Login from './pages/Login';
import CreateAccount from './pages/CreateAccount';
import Onboarding from './pages/Onboarding';
import AppShell, { type View } from './components/AppShell';
import Dashboard from './pages/Dashboard';
import SalesInvoices from './pages/SalesInvoices';
import InvoiceDetail from './pages/InvoiceDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import Accounting from './pages/Accounting';
import Banking from './pages/Banking';
import Reports from './pages/Reports';
import Approvals from './pages/Approvals';
import Masters from './pages/Masters';
import InvoiceDrawer from './components/InvoiceDrawer';
import SalesModule from './pages/SalesModule';
import PurchaseModule from './pages/PurchaseModule';
import InventoryModule from './pages/InventoryModule';
import TaxationModule from './pages/TaxationModule';
import PayrollModule from './pages/PayrollModule';
import FixedAssetsModule from './pages/FixedAssetsModule';
import BudgetsModule from './pages/BudgetsModule';
import POSModule from './pages/POSModule';
import CompanyAdmin from './pages/CompanyAdmin';
import FinancialReports from './pages/FinancialReports';

type AuthState = 'login' | 'register' | 'onboarding' | 'app';

const BREADCRUMBS: Record<View, string[]> = {
  dashboard:       ['Home'],
  crm:             ['Operations', 'CRM'],
  invoices:        ['Sales', 'Invoices'],
  'invoice-detail':['Sales', 'Invoices', 'INV/26-27/0118'],
  purchase:        ['Purchase', 'Orders'],
  'purchase-detail':['Purchase', 'Orders', 'PO/26-27/0092'],
  inventory:       ['Operations', 'Inventory'],
  pos:             ['Operations', 'POS'],
  accounting:      ['Finance', 'Accounting'],
  banking:         ['Finance', 'Banking'],
  taxation:        ['Finance', 'Taxation'],
  payroll:         ['Finance', 'Payroll'],
  'fixed-assets':  ['Finance', 'Fixed Assets'],
  budgets:         ['Finance', 'Budgets & Expenses'],
  reports:         ['Insight', 'Reports & CFO Dashboard'],
  approvals:       ['Workspace', 'Approvals & Activity'],
  masters:         ['Setup', 'Masters & Imports'],
  'company-admin': ['Setup', 'Company Administration'],
};

function StubPage({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: '#5F6368',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: '#F3F5F5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
        }}
      >
        📋
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>{title}</h2>
      <p style={{ fontSize: 14, color: '#5F6368', textAlign: 'center', maxWidth: 360, fontFeatureSettings: 'normal' }}>
        {description}
      </p>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>('login');
  const [view, setView] = useState<View>('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (auth === 'login') {
    return (
      <Login
        onLogin={() => setAuth('app')}
        onCreateAccount={() => setAuth('register')}
      />
    );
  }

  if (auth === 'register') {
    return (
      <CreateAccount
        onCreated={() => setAuth('onboarding')}
        onSignIn={() => setAuth('login')}
      />
    );
  }

  if (auth === 'onboarding') {
    return <Onboarding onComplete={() => setAuth('app')} />;
  }

  const navigateTo = (v: string) => setView(v as View);

  const breadcrumb = BREADCRUMBS[view] ?? [view];

  return (
    <AppShell
      currentView={view}
      onNavigate={setView}
      breadcrumb={breadcrumb}
    >
      {view === 'dashboard' && (
        <Dashboard onNavigate={navigateTo} />
      )}
      {view === 'invoices' && (
        <>
          <SalesInvoices
            onViewDetail={() => setView('invoice-detail')}
            onNewInvoice={() => setDrawerOpen(true)}
          />
          <InvoiceDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onSave={() => setDrawerOpen(false)}
          />
        </>
      )}
      {view === 'invoice-detail' && (
        <InvoiceDetail onBack={() => setView('invoices')} />
      )}
      {view === 'purchase' && <PurchaseOrders />}
      {view === 'accounting' && <Accounting />}
      {view === 'banking' && <Banking />}
      {view === 'reports' && <FinancialReports />}
      {view === 'approvals' && <Approvals />}
      {view === 'masters' && <Masters />}
      {view === 'crm' && <SalesModule />}
      {view === 'inventory' && <InventoryModule />}
      {view === 'pos' && <POSModule />}
      {view === 'taxation' && <TaxationModule />}
      {view === 'payroll' && <PayrollModule />}
      {view === 'fixed-assets' && <FixedAssetsModule />}
      {view === 'budgets' && <BudgetsModule />}
      {view === 'company-admin' && <CompanyAdmin />}
      {view === 'purchase-detail' && (
        <StubPage
          title="Purchase Order"
          description="Purchase order detail view with line items, GRN matching, and approval workflow."
        />
      )}
    </AppShell>
  );
}
