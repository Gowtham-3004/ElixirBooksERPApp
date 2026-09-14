// Inventory module entry — routes: inventory/<sub>[/<id>]
import type { ModuleProps } from '../registry';
import { ModuleShell, NoPermission } from '../../components/ui';
import { INVENTORY_NAV } from '../subnav';
import { useSession } from '../../store';
import { StockOnHand, StockLedger, BatchesSerials, ReservationsPage } from './StockViews';
import { Adjustments } from './Adjustments';
import { Transfers } from './Transfers';
import { Counts } from './Counts';
import { Replenishment } from './Replenishment';
import { LandedCostPage } from './LandedCost';
import { Valuation } from './Valuation';
import { InventorySettingsPage } from './Settings';

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  if (!s.permissions.some((p) => p.startsWith('inventory.') || p === '*' || p === '*.*.view') && !s.isTenantOwner) return <NoPermission what="Inventory" />;
  return (
    <ModuleShell module="inventory" title="Inventory" items={INVENTORY_NAV} defaultSub="stock">
      {(sub) => {
        switch (sub) {
          case 'stock': return <StockOnHand itemId={route.id} />;
          case 'ledger': return <StockLedger params={route.params} />;
          case 'batches': return <BatchesSerials itemId={route.id} />;
          case 'reservations': return <ReservationsPage />;
          case 'adjustments': return <Adjustments id={route.id} />;
          case 'transfers': return <Transfers id={route.id} />;
          case 'counts': return <Counts id={route.id} />;
          case 'replenishment': return <Replenishment />;
          case 'landed-cost': return <LandedCostPage id={route.id} params={route.params} />;
          case 'valuation': return <Valuation />;
          case 'settings': return <InventorySettingsPage />;
          default: return <StockOnHand />;
        }
      }}
    </ModuleShell>
  );
}
