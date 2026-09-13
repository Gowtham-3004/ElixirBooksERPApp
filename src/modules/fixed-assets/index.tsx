// Fixed assets module (FR-AST-001..005).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { AssetRegister, AssetDetail } from './Register';
import { CapitalizePage } from './Capitalize';
import { DepreciationPage, CategoriesPage, AssetReports } from './Depreciation';
import { TransfersPage, RevaluationPage, DisposalsPage } from './Events';

const ITEMS = [
  { id: 'register', label: 'Register' },
  { id: 'capitalize', label: 'Capitalize' },
  { id: 'depreciation', label: 'Depreciation' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'revaluation', label: 'Revaluation & impairment' },
  { id: 'disposals', label: 'Disposals' },
  { id: 'categories', label: 'Categories' },
  { id: 'reports', label: 'Reports' },
];

export default function Module({ route }: ModuleProps) {
  return (
    <ModuleShell module="fixed-assets" title="Fixed Assets" items={ITEMS} defaultSub="register">
      {(sub) => {
        switch (sub) {
          case 'register': return route.id ? <AssetDetail id={route.id} /> : <AssetRegister />;
          case 'capitalize': return <CapitalizePage />;
          case 'depreciation': return <DepreciationPage />;
          case 'transfers': return <TransfersPage />;
          case 'revaluation': return <RevaluationPage />;
          case 'disposals': return <DisposalsPage />;
          case 'categories': return <CategoriesPage />;
          case 'reports': return <AssetReports />;
          default: return <AssetRegister />;
        }
      }}
    </ModuleShell>
  );
}
