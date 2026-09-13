// Masters & imports module entry — grouped sub-nav (Party / Inventory / Finance / Operations / Reference).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { CustomerRegister } from './customers';
import CustomerDetail from './CustomerDetail';
import { SupplierRegister } from './suppliers';
import SupplierDetail from './SupplierDetail';
import { EmployeeDetail, EmployeeRegister } from './employees';
import { ItemRegister } from './items';
import ItemDetail from './ItemDetail';
import { WarehouseRegister } from './warehouses';
import PriceListDetail, { PriceListRegister } from './priceLists';
import { AccountRegister } from './accounts';
import { DimensionRegister } from './dimensions';
import { TaxRateRegister } from './taxRates';
import { ExchangeRateRegister } from './exchangeRates';
import { CurrencyRegister, HsnRegister, PaymentTermsRegister, ReasonCodeRegister, ReferencePage, SalespersonRegister, TdsRegister, UomRegister } from './simpleMasters';
import { ImportsPage } from './imports';

const ITEMS = [
  { id: 'customers', label: 'Customers', group: 'Party' },
  { id: 'suppliers', label: 'Suppliers', group: 'Party' },
  { id: 'employees', label: 'Employees', group: 'Party' },
  { id: 'items', label: 'Items & services', group: 'Inventory' },
  { id: 'warehouses', label: 'Warehouses & bins', group: 'Inventory' },
  { id: 'price-lists', label: 'Price lists', group: 'Inventory' },
  { id: 'hsn', label: 'HSN / SAC codes', group: 'Inventory' },
  { id: 'uoms', label: 'Units of measure', group: 'Inventory' },
  { id: 'accounts', label: 'Chart of accounts', group: 'Finance' },
  { id: 'dimensions', label: 'Dimensions', group: 'Finance' },
  { id: 'tax-rates', label: 'Tax rates', group: 'Finance' },
  { id: 'tds', label: 'TDS / TCS sections', group: 'Finance' },
  { id: 'payment-terms', label: 'Payment terms', group: 'Finance' },
  { id: 'currencies', label: 'Currencies', group: 'Finance' },
  { id: 'exchange-rates', label: 'Exchange rates', group: 'Finance' },
  { id: 'salespersons', label: 'Salespersons', group: 'Operations' },
  { id: 'reason-codes', label: 'Reason codes', group: 'Operations' },
  { id: 'reference', label: 'Countries & states', group: 'Reference' },
  { id: 'imports', label: 'Imports', group: 'Reference' },
];

export default function Module({ route }: ModuleProps) {
  return (
    <ModuleShell module="masters" title="Masters & Imports" items={ITEMS} defaultSub="customers">
      {(sub) => {
        const id = route.id;
        switch (sub) {
          case 'customers': return id ? <CustomerDetail id={id} /> : <CustomerRegister />;
          case 'suppliers': return id ? <SupplierDetail id={id} /> : <SupplierRegister />;
          case 'employees': return id ? <EmployeeDetail id={id} /> : <EmployeeRegister />;
          case 'items': return id ? <ItemDetail id={id} /> : <ItemRegister />;
          case 'warehouses': return <WarehouseRegister />;
          case 'price-lists': return id ? <PriceListDetail id={id} /> : <PriceListRegister />;
          case 'hsn': return <HsnRegister />;
          case 'uoms': return <UomRegister />;
          case 'accounts': return <AccountRegister />;
          case 'dimensions': return <DimensionRegister />;
          case 'tax-rates': return <TaxRateRegister />;
          case 'tds': return <TdsRegister />;
          case 'payment-terms': return <PaymentTermsRegister />;
          case 'currencies': return <CurrencyRegister />;
          case 'exchange-rates': return <ExchangeRateRegister />;
          case 'salespersons': return <SalespersonRegister />;
          case 'reason-codes': return <ReasonCodeRegister />;
          case 'reference': return <ReferencePage />;
          case 'imports': return <ImportsPage />;
          default: return <CustomerRegister />;
        }
      }}
    </ModuleShell>
  );
}
