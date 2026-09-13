// Sales & receivables module entry (FR-SAL-*, FR-AR-*, FR-CMP-*).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { nav } from '../../store';
import InvoiceRegister from './invoices/Register';
import InvoiceForm from './invoices/Form';
import InvoiceDetail from './invoices/Detail';
import { QuotationRegister, QuotationForm, QuotationDetail } from './quotations/Quotations';
import { OrderRegister, OrderForm, OrderDetail } from './orders/Orders';
import { DeliveryRegister, DeliveryForm, DeliveryDetail } from './deliveries/Deliveries';
import { CreditNoteRegister, CreditNoteForm, CreditNoteDetail, SalesReturnRegister, SalesReturnDetail } from './creditnotes/CreditNotes';
import ReceiptRegister, { ReceiptDetail } from './receipts/Register';
import ArAgeing from './ar/Ageing';
import CustomerStatement from './ar/Statement';
import Collections from './ar/Collections';
import { SalesSettingsPage, PriceListsPage } from './Settings';

const ITEMS = [
  { id: 'quotations', label: 'Quotations' },
  { id: 'orders', label: 'Sales orders' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'credit-notes', label: 'Returns & credit notes' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'ageing', label: 'AR ageing', group: 'Receivables' },
  { id: 'collections', label: 'Collections', group: 'Receivables' },
  { id: 'statements', label: 'Customer statements', group: 'Receivables' },
  { id: 'price-lists', label: 'Price lists', group: 'Setup' },
  { id: 'settings', label: 'Settings', group: 'Setup' },
];

export default function Module({ route }: ModuleProps) {
  const { id, params } = route;
  const edit = params.edit === '1';
  return (
    <ModuleShell module="sales" title="Sales" items={ITEMS} defaultSub="invoices">
      {(sub) => {
        switch (sub) {
          case 'invoices':
            if (id === 'new') return <InvoiceForm key={`new-${params.order ?? ''}-${params.delivery ?? ''}`} sourceOrderId={params.order} sourceDeliveryId={params.delivery} />;
            if (id && edit) return <InvoiceForm key={id} id={id} />;
            if (id) return <InvoiceDetail key={id} id={id} tab={params.tab} onTab={(t) => nav.replace(`sales/invoices/${id}?tab=${t}`)} />;
            return <InvoiceRegister />;
          case 'quotations':
            if (id === 'new') return <QuotationForm key={`new-${params.lead ?? ''}`} leadId={params.lead} />;
            if (id && edit) return <QuotationForm key={id} id={id} />;
            if (id) return <QuotationDetail key={id} id={id} />;
            return <QuotationRegister />;
          case 'orders':
            if (id === 'new') return <OrderForm key="new" />;
            if (id && edit) return <OrderForm key={id} id={id} />;
            if (id) return <OrderDetail key={id} id={id} />;
            return <OrderRegister />;
          case 'deliveries':
            if (id === 'new') return <DeliveryForm key={`new-${params.order ?? ''}`} orderId={params.order} />;
            if (id && edit) return <DeliveryForm key={id} id={id} />;
            if (id) return <DeliveryDetail key={id} id={id} />;
            return <DeliveryRegister />;
          case 'credit-notes':
            if (id === 'new') return <CreditNoteForm key={`new-${params.invoice ?? ''}`} invoiceId={params.invoice} />;
            if (id && edit) return <CreditNoteForm key={id} id={id} />;
            if (id) return <CreditNoteDetail key={id} id={id} />;
            return <CreditNoteRegister tab={params.tab} />;
          case 'returns':
            if (id) return <SalesReturnDetail key={id} id={id} />;
            return <SalesReturnRegister />;
          case 'receipts':
            if (id === 'new') return <ReceiptRegister key="new" openNew newParams={params} />;
            if (id) return <ReceiptDetail key={id} id={id} />;
            return <ReceiptRegister />;
          case 'ageing': return <ArAgeing />;
          case 'statements': return <CustomerStatement key={id} customerId={id || undefined} />;
          case 'collections': return <Collections customerId={params.customer} />;
          case 'price-lists': return <PriceListsPage />;
          case 'settings': return <SalesSettingsPage />;
          default: return <InvoiceRegister />;
        }
      }}
    </ModuleShell>
  );
}
