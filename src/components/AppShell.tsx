import { useState } from 'react';
import {
  HomeIcon, CheckCircleIcon, UsersIcon, ReceiptIcon, ShoppingCartIcon,
  PackageIcon, MonitorIcon, BookOpenIcon, BuildingIcon, PercentIcon,
  CreditCardIcon, LayersIcon, BarChartIcon, DatabaseIcon, CogIcon,
  BellIcon, SearchIcon, ChevronDownIcon, HelpCircleIcon, UserIcon,
  LockIcon,
} from './Icons';

type View =
  | 'dashboard' | 'crm' | 'invoices' | 'invoice-detail'
  | 'purchase' | 'purchase-detail'
  | 'inventory' | 'pos'
  | 'accounting' | 'banking' | 'taxation' | 'payroll' | 'fixed-assets' | 'budgets'
  | 'reports' | 'approvals'
  | 'masters' | 'company-admin';

interface NavGroup {
  label: string;
  items: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; view: View; badge?: number }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'WORKSPACE',
    items: [
      { icon: HomeIcon, label: 'Home', view: 'dashboard' },
      { icon: CheckCircleIcon, label: 'Approvals & Activity', view: 'approvals', badge: 7 },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { icon: UsersIcon, label: 'CRM', view: 'crm' },
      { icon: ReceiptIcon, label: 'Sales', view: 'invoices' },
      { icon: ShoppingCartIcon, label: 'Purchase', view: 'purchase' },
      { icon: PackageIcon, label: 'Inventory', view: 'inventory' },
      { icon: MonitorIcon, label: 'POS', view: 'pos' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { icon: BookOpenIcon, label: 'Accounting', view: 'accounting' },
      { icon: BuildingIcon, label: 'Banking', view: 'banking' },
      { icon: PercentIcon, label: 'Taxation', view: 'taxation' },
      { icon: CreditCardIcon, label: 'Payroll', view: 'payroll' },
      { icon: LayersIcon, label: 'Fixed Assets', view: 'fixed-assets' },
      { icon: BarChartIcon, label: 'Budgets & Expenses', view: 'budgets' },
    ],
  },
  {
    label: 'INSIGHT',
    items: [
      { icon: BarChartIcon, label: 'Reports & CFO Dashboard', view: 'reports' },
    ],
  },
  {
    label: 'SETUP',
    items: [
      { icon: DatabaseIcon, label: 'Masters & Imports', view: 'masters' },
      { icon: CogIcon, label: 'Company Administration', view: 'company-admin' },
    ],
  },
];

interface AppShellProps {
  currentView: View;
  onNavigate: (view: View) => void;
  breadcrumb: string[];
  children: React.ReactNode;
}

export default function AppShell({ currentView, onNavigate, breadcrumb, children }: AppShellProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  const activeGroup = (view: View) =>
    view === currentView ? 'active' : '';

  return (
    <div style={{ display: 'flex', height: '100%', background: '#F7F7F7' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 250,
          flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid #EFEFEF',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Brand block */}
        <div
          style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid #EFEFEF',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#325CFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.9" />
              <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
              <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
              <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cell-secondary" style={{ marginBottom: 1 }}>Acme Group</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="cell-primary" style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Acme Private Limited
              </span>
              <ChevronDownIcon size={12} className="" />
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {navGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 4 }}>
              <div
                className="section-label"
                style={{ padding: '8px 12px 4px', display: 'block' }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.view}
                  className={`nav-item ${activeGroup(item.view)}`}
                  style={{ width: '100%', border: 'none', textAlign: 'left' }}
                  onClick={() => onNavigate(item.view)}
                >
                  <item.icon size={16} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      style={{
                        background: '#325CFF',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 9999,
                        padding: '0 6px',
                        minWidth: 18,
                        textAlign: 'center',
                        lineHeight: '18px',
                        fontFeatureSettings: 'normal',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid #EFEFEF', padding: '8px 8px' }}>
          <button className="nav-item" style={{ width: '100%', border: 'none', textAlign: 'left' }}>
            <HelpCircleIcon size={16} />
            <span>Help & Support</span>
          </button>
          <button className="nav-item" style={{ width: '100%', border: 'none', textAlign: 'left' }}>
            <CogIcon size={16} />
            <span>Settings</span>
          </button>
          {/* User card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              marginTop: 4,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#325CFF',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
                fontFeatureSettings: 'normal',
              }}
            >
              RK
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cell-primary" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Rahul Kumar</div>
              <div className="cell-secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Finance Admin</div>
            </div>
            <ChevronDownIcon size={12} />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Context bar */}
        <header
          style={{
            height: 48,
            background: '#F9FBFC',
            borderBottom: '1px solid #EFEFEF',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            flexShrink: 0,
          }}
        >
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && (
                  <span style={{ fontSize: 12, color: '#B0B5BF' }}>›</span>
                )}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                    color: i === breadcrumb.length - 1 ? '#0A0A0A' : '#5F6368',
                    fontFeatureSettings: 'normal',
                  }}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>

          {/* Context controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Company */}
            <button
              className="btn-secondary btn-sm"
              style={{ gap: 6, fontFeatureSettings: 'normal' }}
            >
              Acme Private Limited
              <ChevronDownIcon size={12} />
            </button>
            {/* Branch */}
            <button
              className="btn-secondary btn-sm"
              style={{ gap: 6, fontFeatureSettings: 'normal' }}
            >
              Mumbai
              <ChevronDownIcon size={12} />
            </button>
            {/* FY chip */}
            <span
              style={{
                padding: '2px 8px',
                background: '#F3F5F5',
                borderRadius: 9999,
                fontSize: 12,
                color: '#5F6368',
                fontFeatureSettings: 'normal',
              }}
            >
              FY 2026–27
            </span>
            {/* Period chip */}
            <span
              style={{
                padding: '2px 8px',
                background: '#E0F9EC',
                borderRadius: 9999,
                fontSize: 12,
                color: '#12784E',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontFeatureSettings: 'normal',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#12784E',
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              Apr 2026
            </span>

            {/* Search */}
            <button
              className="btn-secondary btn-sm"
              style={{ gap: 6, color: '#5F6368', fontFeatureSettings: 'normal', fontWeight: 400 }}
            >
              <SearchIcon size={13} />
              Search
              <span
                style={{
                  fontSize: 11,
                  background: '#F3F5F5',
                  padding: '0 4px',
                  borderRadius: 4,
                  color: '#5F6368',
                }}
              >
                ⌘K
              </span>
            </button>

            {/* Notifications */}
            <button
              className="btn-ghost"
              style={{ padding: '0 8px', position: 'relative' }}
              onClick={() => setNotifOpen(!notifOpen)}
            >
              <BellIcon size={16} />
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  background: '#325CFF',
                  borderRadius: '50%',
                  border: '1.5px solid #F9FBFC',
                }}
              />
            </button>

            {/* User */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#325CFF',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFeatureSettings: 'normal',
              }}
            >
              RK
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export type { View };
