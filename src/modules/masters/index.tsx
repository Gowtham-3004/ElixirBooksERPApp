// Masters & imports module entry — grouped sub-nav (Party / Inventory / Finance / Operations / Reference).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { MASTERS_NAV } from '../subnav';
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


export default function Module({ route }: ModuleProps) {
  return (
    <ModuleShell module="masters" title="Masters & Imports" items={MASTERS_NAV} defaultSub="customers">
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
