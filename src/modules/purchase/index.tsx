// Purchase module entry — routes: purchase/<sub>[/<id>[/edit]]
import type { ModuleProps } from '../registry';
import { ModuleShell, NoPermission } from '../../components/ui';
import { C, useCollection, useSession } from '../../store';
import type { MatchException } from './types';
import { Requisitions } from './Requisitions';
import { Rfqs } from './Rfqs';
import { OrderRegister } from './Orders';
import { OrderForm } from './OrderForm';
import { OrderDetail } from './OrderDetail';
import { GrnRegister, GrnForm, GrnDetail } from './Grns';
import { VendorInvoiceRegister } from './VendorInvoices';
import { VendorInvoiceForm } from './VendorInvoiceForm';
import { VendorInvoiceDetail } from './VendorInvoiceDetail';
import { ExceptionsWorkbench } from './Exceptions';
import { DebitNotes } from './DebitNotes';
import { PaymentRegister, PaymentForm, PaymentDetail } from './Payments';
import { BatchRegister, BatchDetail } from './Batches';
import { ApAgeing } from './Ageing';
import { PurchaseSettingsPage } from './Settings';

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  const exceptions = useCollection<MatchException>(C.matchExceptions);
  const openEx = exceptions.filter((x) => x.status === 'Open' || x.status === 'Assigned').length;
  if (!s.can('purchase.view') && !s.permissions.some((p) => p.startsWith('purchase.') || p === '*' || p === '*.*.view')) return <NoPermission what="Purchase" />;
  const items = [
    { id: 'requisitions', label: 'Requisitions', group: 'Sourcing' },
    { id: 'rfqs', label: 'RFQs & quotes', group: 'Sourcing' },
    { id: 'orders', label: 'Purchase orders', group: 'Ordering' },
    { id: 'grn', label: 'Goods receipts', group: 'Ordering' },
    { id: 'vendor-invoices', label: 'Vendor invoices', group: 'Payables' },
    { id: 'exceptions', label: 'Matching exceptions', group: 'Payables', badge: openEx },
    { id: 'debit-notes', label: 'Debit notes & returns', group: 'Payables' },
    { id: 'payments', label: 'Payments', group: 'Payables' },
    { id: 'batches', label: 'Payment batches', group: 'Payables' },
    { id: 'ageing', label: 'AP ageing', group: 'Payables' },
    { id: 'settings', label: 'Settings', group: 'Setup' },
  ];
  const id = route.id;
  const edit = route.rest[0] === 'edit';
  return (
    <ModuleShell module="purchase" title="Purchase" items={items} defaultSub="orders">
      {(sub) => {
        switch (sub) {
          case 'requisitions': return <Requisitions id={id} />;
          case 'rfqs': return <Rfqs id={id} />;
          case 'orders':
            if (id === 'new') return <OrderForm />;
            if (id && edit) return <OrderForm id={id} />;
            if (id) return <OrderDetail id={id} />;
            return <OrderRegister />;
          case 'grn':
            if (id === 'new') return <GrnForm poId={route.params.po} />;
            if (id && edit) return <GrnForm id={id} />;
            if (id) return <GrnDetail id={id} />;
            return <GrnRegister />;
          case 'vendor-invoices':
            if (id === 'new') return <VendorInvoiceForm poId={route.params.po} grnId={route.params.grn} supplierId={route.params.supplier} />;
            if (id && edit) return <VendorInvoiceForm id={id} />;
            if (id) return <VendorInvoiceDetail id={id} />;
            return <VendorInvoiceRegister />;
          case 'exceptions': return <ExceptionsWorkbench id={id} />;
          case 'debit-notes': return <DebitNotes id={id} params={route.params} />;
          case 'payments':
            if (id === 'new') return <PaymentForm supplierId={route.params.supplier} openItemIds={route.params.items?.split(',').filter(Boolean)} />;
            if (id) return <PaymentDetail id={id} />;
            return <PaymentRegister />;
          case 'batches':
            if (id) return <BatchDetail id={id} />;
            return <BatchRegister />;
          case 'ageing': return <ApAgeing supplierId={id} />;
          case 'settings': return <PurchaseSettingsPage />;
          default: return <OrderRegister />;
        }
      }}
    </ModuleShell>
  );
}
