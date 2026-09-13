// ImportWizard configurations per master (FR-MDM-003, FR-IMP-001). Each returns the props the
// wizard needs: fields with validators, duplicate keys against existing rows, sample data and
// the commit handler that writes rows through the audited master save.
import { db, C, engine } from '../../store';
import type { Account, AccountGroup, Customer, ExchangeRate, Item, PriceList, PriceListEntry, Supplier, TaxRate, HsnCode } from '../../store';
import type { ImportWizardProps } from '../../components/ui';
import { stateCodeOf, stateNameOf, validateEmail, validateGSTIN, validatePAN, uid, today } from '../../lib/format';
import { nextCode, saveMaster } from './shared';

type Def = Omit<ImportWizardProps, 'open' | 'onClose'>;

const num = (v: string) => (v && isNaN(Number(v)) ? 'Must be a number' : null);

function partyRows(entity: 'Customer' | 'Supplier', rows: Record<string, string>[], existing: any[]) {
  const c = engine.ctx();
  let n = 0;
  const list = [...existing];
  db.transaction(() => {
    rows.forEach((r) => {
      const gstin = r.gstin?.toUpperCase() || undefined;
      const state = r.state || (gstin ? stateNameOf(gstin.slice(0, 2)) ?? '' : '');
      const code = r.code || nextCode(list, entity === 'Customer' ? 'C-' : 'S-');
      const base = {
        companyId: c.companyId, code, name: r.name, group: r.group || undefined, gstin, pan: (r.pan || (gstin ? gstin.slice(2, 12) : '')).toUpperCase() || undefined,
        taxTreatment: (r.taxTreatment as any) || (gstin ? 'Registered' : 'Unregistered'),
        addresses: [{ id: uid('adr'), purpose: 'Both' as const, isDefault: true, address: { line1: r.address || '—', city: r.city || '', state, stateCode: stateCodeOf(state), pin: r.pin || '', country: 'IN' } }],
        contacts: r.contactName ? [{ id: uid('ct'), name: r.contactName, email: r.email || undefined, phone: r.phone || undefined, isDefault: true, purpose: 'General' as const }] : [],
        currency: r.currency || 'INR', status: 'Active' as const, email: r.email || undefined, phone: r.phone || undefined,
      };
      const saved = entity === 'Customer'
        ? saveMaster<Customer>(C.customers, 'Customer', { ...base, paymentTerms: r.paymentTerms || c.company?.defaults.paymentTerms || 'Net 30', creditLimit: Number(r.creditLimit || 0), creditPolicy: 'Inherit', priceListId: c.company?.defaults.priceListId, receivableAccountId: c.company?.defaults.receivableAccountId })
        : saveMaster<Supplier>(C.suppliers, 'Supplier', { ...base, purchaseTerms: r.paymentTerms || 'Net 30', payableAccountId: c.company?.defaults.payableAccountId, bankDetails: [], msmeNumber: r.msme || undefined });
      list.push(saved);
      n++;
    });
  });
  return n;
}

const partyFields = (kind: 'Customer' | 'Supplier') => [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Name', required: true },
  { key: 'gstin', label: 'GSTIN', validate: (v: string) => validateGSTIN(v.toUpperCase()) },
  { key: 'pan', label: 'PAN', validate: (v: string) => validatePAN(v.toUpperCase()) },
  { key: 'taxTreatment', label: 'Tax treatment', validate: (v: string) => (['Registered', 'Unregistered', 'Composition', 'SEZ', 'Export', 'Overseas', 'Deemed Export'].includes(v) ? null : 'Unknown tax treatment') },
  { key: 'group', label: 'Group' },
  { key: 'address', label: 'Address line 1' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State', validate: (v: string) => (stateCodeOf(v) ? null : 'Unknown Indian state name') },
  { key: 'pin', label: 'PIN' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'email', label: 'Email', validate: validateEmail },
  { key: 'phone', label: 'Phone' },
  { key: 'currency', label: 'Currency' },
  { key: 'paymentTerms', label: kind === 'Customer' ? 'Payment terms' : 'Purchase terms' },
  ...(kind === 'Customer' ? [{ key: 'creditLimit', label: 'Credit limit', type: 'number' as const }] : [{ key: 'msme', label: 'MSME / Udyam no.' }]),
];

export function customerImport(existing: Customer[]): Def {
  return {
    entity: 'Customers', fields: partyFields('Customer'), duplicateKeys: ['gstin'], existing,
    sampleRows: [
      { Code: '', Name: 'Nimbus Retail Pvt Ltd', GSTIN: '27AABCN1234Q1Z6', PAN: 'AABCN1234Q', 'Tax treatment': 'Registered', Group: 'Retail', 'Address line 1': '12 Linking Road', City: 'Mumbai', State: 'Maharashtra', PIN: '400050', 'Contact name': 'Neha Kulkarni', Email: 'ap@nimbusretail.in', Phone: '+91 98200 55667', Currency: 'INR', 'Payment terms': 'Net 30', 'Credit limit': '250000' },
      { Code: '', Name: 'Orion Foods LLP', GSTIN: '29AAEFO5678R1Z2', PAN: 'AAEFO5678R', 'Tax treatment': 'Registered', Group: 'Distributor', 'Address line 1': 'Plot 9, Jigani', City: 'Bengaluru', State: 'Karnataka', PIN: '560105', 'Contact name': 'Om Prakash', Email: 'om@orionfoods.in', Phone: '+91 98450 11223', Currency: 'INR', 'Payment terms': 'Net 45', 'Credit limit': '600000' },
      { Code: '', Name: 'Bad Row Traders', GSTIN: '27ABC', PAN: '', 'Tax treatment': 'Registered', Group: 'Dealer', 'Address line 1': 'MG Road', City: 'Pune', State: 'Maharashtra', PIN: '411001', 'Contact name': '', Email: 'not-an-email', Phone: '', Currency: 'INR', 'Payment terms': 'Net 30', 'Credit limit': 'abc' },
    ],
    onCommit: (rows) => partyRows('Customer', rows, existing),
  };
}

export function supplierImport(existing: Supplier[]): Def {
  return {
    entity: 'Suppliers', fields: partyFields('Supplier'), duplicateKeys: ['gstin'], existing,
    sampleRows: [
      { Code: '', Name: 'Apex Fasteners', GSTIN: '24AABCA9876K1Z4', PAN: 'AABCA9876K', 'Tax treatment': 'Registered', Group: 'Hardware', 'Address line 1': 'GIDC Vatva', City: 'Ahmedabad', State: 'Gujarat', PIN: '382445', 'Contact name': 'Alok Shah', Email: 'sales@apexfast.in', Phone: '+91 98250 77889', Currency: 'INR', 'Purchase terms': 'Net 30', 'MSME / Udyam no.': 'UDYAM-GJ-01-0045678' },
      { Code: '', Name: 'Coastal Logistics', GSTIN: '27AABCC4567L1Z9', PAN: 'AABCC4567L', 'Tax treatment': 'Registered', Group: 'Services', 'Address line 1': 'JNPT Road', City: 'Navi Mumbai', State: 'Maharashtra', PIN: '400707', 'Contact name': 'Carol D’Souza', Email: 'ops@coastallog.in', Phone: '+91 98190 33445', Currency: 'INR', 'Purchase terms': 'Net 15', 'MSME / Udyam no.': '' },
    ],
    onCommit: (rows) => partyRows('Supplier', rows, existing),
  };
}

export function itemImport(existing: Item[]): Def {
  const taxRates = db.get<TaxRate>(C.taxRates);
  const hsn = db.get<HsnCode>(C.hsnCodes);
  return {
    entity: 'Items', duplicateKeys: ['code'], existing,
    fields: [
      { key: 'code', label: 'SKU / code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'type', label: 'Type', validate: (v) => (['Goods', 'Service', 'Consumable', 'Asset', 'Raw Material', 'Finished Good', 'Semi-Finished'].includes(v) ? null : 'Type must be Goods, Service, Consumable, Asset, Raw Material, Finished Good or Semi-Finished') },
      { key: 'group', label: 'Group' },
      { key: 'uom', label: 'Base UOM', required: true },
      { key: 'hsn', label: 'HSN / SAC' },
      { key: 'taxRate', label: 'Tax rate code', validate: (v) => (taxRates.some((t) => t.code === v) ? null : `Unknown tax rate code (use ${taxRates.slice(0, 4).map((t) => t.code).join(', ')}…)`) },
      { key: 'salesPrice', label: 'Sales price', type: 'number', validate: num },
      { key: 'purchasePrice', label: 'Purchase price', type: 'number', validate: num },
      { key: 'reorderLevel', label: 'Reorder level', type: 'number' },
      { key: 'barcode', label: 'Barcode' },
    ],
    sampleRows: [
      { 'SKU / code': 'SKU-10077', Name: 'Earl Grey Tea 250 g', Type: 'Goods', Group: 'Beverages', 'Base UOM': 'pcs', 'HSN / SAC': '0902', 'Tax rate code': 'GST5', 'Sales price': '210', 'Purchase price': '150', 'Reorder level': '80', Barcode: '8901234000778' },
      { 'SKU / code': 'HW-WASH-M16', Name: 'Spring Washer M16', Type: 'Goods', Group: 'Hardware', 'Base UOM': 'Nos', 'HSN / SAC': '73182100', 'Tax rate code': 'GST18', 'Sales price': '4', 'Purchase price': '2.8', 'Reorder level': '5000', Barcode: '' },
    ],
    onCommit: (rows) => {
      const c = engine.ctx();
      let n = 0;
      db.transaction(() => rows.forEach((r) => {
        const type = (r.type as Item['type']) || 'Goods';
        const tr = taxRates.find((t) => t.code === r.taxRate) ?? (r.hsn ? taxRates.find((t) => t.id === hsn.find((h) => h.code === r.hsn)?.defaultTaxRateId) : undefined);
        saveMaster<Item>(C.items, 'Item', { companyId: c.companyId, code: r.code.toUpperCase(), name: r.name, type, group: r.group || undefined, baseUom: r.uom, altUoms: [], hsn: r.hsn || undefined, taxRateId: tr?.id ?? c.company?.defaults.taxRateId, salesAccountId: type === 'Service' ? 'acc_4010' : c.company?.defaults.salesAccountId, purchaseAccountId: type === 'Service' ? 'acc_5530' : c.company?.defaults.purchaseAccountId, inventoryAccountId: type === 'Service' ? undefined : 'acc_1200', tracking: 'None', reorderLevel: Number(r.reorderLevel || 0), reorderQty: 0, safetyStock: 0, leadTimeDays: 7, salesPrice: Number(r.salesPrice || 0), purchasePrice: Number(r.purchasePrice || 0), status: 'Active', isStock: type !== 'Service', barcode: r.barcode || undefined });
        n++;
      }));
      return n;
    },
  };
}

export function accountImport(existing: Account[]): Def {
  const groups = db.get<AccountGroup>(C.accountGroups);
  return {
    entity: 'Chart of accounts', duplicateKeys: ['code'], existing,
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'group', label: 'Group code', required: true, validate: (v) => (groups.some((g) => g.code === v) ? null : `Unknown group (use ${groups.map((g) => g.code).join(', ')})`) },
      { key: 'normalBalance', label: 'Normal balance', validate: (v) => (['Dr', 'Cr', ''].includes(v) ? null : 'Dr or Cr') },
      { key: 'openingBalance', label: 'Opening balance', type: 'number' },
      { key: 'postingAllowed', label: 'Posting allowed (Y/N)' },
    ],
    sampleRows: [
      { Code: '5570', Name: 'Insurance', 'Group code': 'OPEX', 'Normal balance': 'Dr', 'Opening balance': '0', 'Posting allowed (Y/N)': 'Y' },
      { Code: '2430', Name: 'Gratuity Provision', 'Group code': 'CL', 'Normal balance': 'Cr', 'Opening balance': '0', 'Posting allowed (Y/N)': 'Y' },
    ],
    onCommit: (rows) => {
      const c = engine.ctx();
      let n = 0;
      db.transaction(() => rows.forEach((r) => {
        const g = groups.find((x) => x.code === r.group)!;
        saveMaster<Account>(C.accounts, 'Account', { companyId: c.companyId, code: r.code, name: r.name, groupId: g.id, type: g.type, normalBalance: (r.normalBalance as any) || (g.type === 'Asset' || g.type === 'Expense' ? 'Dr' : 'Cr'), isControl: false, postingAllowed: r.postingAllowed?.toUpperCase() !== 'N', currencyBehaviour: 'Base', requiredDimensions: [], prohibitedDimensions: [], status: 'Active', openingBalance: Number(r.openingBalance || 0) || undefined });
        n++;
      }));
      return n;
    },
  };
}

export function priceListEntryImport(existing: PriceListEntry[], priceListId?: string): Def {
  const lists = db.get<PriceList>(C.priceLists);
  const items = db.get<Item>(C.items);
  return {
    entity: 'Price list entries', duplicateKeys: [], existing,
    fields: [
      { key: 'priceList', label: 'Price list code', required: !priceListId, validate: (v) => (!v || lists.some((l) => l.code === v) ? null : `Unknown price list (use ${lists.map((l) => l.code).join(', ')})`) },
      { key: 'item', label: 'Item code', required: true, validate: (v) => (items.some((i) => i.code === v) ? null : 'Unknown item code') },
      { key: 'uom', label: 'UOM' },
      { key: 'minQty', label: 'Min qty', type: 'number' },
      { key: 'rate', label: 'Rate', required: true, type: 'number' },
      { key: 'party', label: 'Customer/supplier code' },
      { key: 'from', label: 'Effective from', type: 'date' },
      { key: 'to', label: 'Effective to', type: 'date' },
    ],
    sampleRows: [
      { 'Price list code': lists[0]?.code ?? 'PL-WS', 'Item code': 'SKU-10021', UOM: 'pcs', 'Min qty': '1000', Rate: '138', 'Customer/supplier code': '', 'Effective from': '2026-10-01', 'Effective to': '' },
      { 'Price list code': lists[0]?.code ?? 'PL-WS', 'Item code': 'HW-BOLT-M16', UOM: 'Nos', 'Min qty': '1', Rate: '30.5', 'Customer/supplier code': 'C-0005', 'Effective from': '2026-10-01', 'Effective to': '2027-03-31' },
    ],
    onCommit: (rows) => {
      const c = engine.ctx();
      let n = 0;
      db.transaction(() => rows.forEach((r) => {
        const pl = priceListId ? lists.find((l) => l.id === priceListId) : lists.find((l) => l.code === r.priceList);
        const it = items.find((i) => i.code === r.item);
        if (!pl || !it) return;
        const party = r.party ? db.findBy<any>(C.customers, (x) => x.code === r.party) ?? db.findBy<any>(C.suppliers, (x) => x.code === r.party) : undefined;
        saveMaster<PriceListEntry>(C.priceListEntries, 'Price List Entry', { companyId: c.companyId, priceListId: pl.id, itemId: it.id, uom: r.uom || it.baseUom, minQty: Number(r.minQty || 1), rate: Number(r.rate), partyId: party?.id, effectiveFrom: r.from || undefined, effectiveTo: r.to || undefined }, undefined, { label: (e) => `${pl.code} · ${it.code}` });
        n++;
      }));
      return n;
    },
  };
}

export function exchangeRateImport(existing: ExchangeRate[]): Def {
  return {
    entity: 'Exchange rates', duplicateKeys: [], existing,
    fields: [
      { key: 'base', label: 'Base currency', required: true },
      { key: 'quote', label: 'Quote currency', required: true },
      { key: 'rate', label: 'Rate', required: true, type: 'number', validate: (v) => (Number(v) > 0 ? null : 'Rate must be positive') },
      { key: 'type', label: 'Type', validate: (v) => (!v || ['Spot', 'Closing', 'Average', 'Historical', 'Imported'].includes(v) ? null : 'Type must be Spot, Closing, Average, Historical or Imported') },
      { key: 'effectiveAt', label: 'Effective date', required: true, type: 'date' },
      { key: 'source', label: 'Source' },
    ],
    sampleRows: [
      { 'Base currency': 'USD', 'Quote currency': 'INR', Rate: '84.55', Type: 'Imported', 'Effective date': today(), Source: 'RBI reference (CSV)' },
      { 'Base currency': 'EUR', 'Quote currency': 'INR', Rate: '91.9', Type: 'Imported', 'Effective date': today(), Source: 'RBI reference (CSV)' },
      { 'Base currency': 'GBP', 'Quote currency': 'INR', Rate: '107.2', Type: 'Imported', 'Effective date': today(), Source: 'RBI reference (CSV)' },
    ],
    onCommit: (rows) => {
      let n = 0;
      db.transaction(() => rows.forEach((r) => {
        const rate = db.insert<ExchangeRate>(C.exchangeRates, { base: r.base.toUpperCase(), quote: r.quote.toUpperCase(), rate: Number(r.rate), direction: 'Multiply', type: (r.type as any) || 'Imported', effectiveAt: `${r.effectiveAt}T09:00:00.000Z`, source: r.source || 'CSV import', status: 'Pending', reason: 'Imported via CSV — awaiting approval (FR-FX-004)' });
        engine.submitForApproval({ docType: 'Exchange Rate', collection: C.exchangeRates, docId: rate.id, docNumber: `${rate.base}/${rate.quote} ${rate.rate}`, amount: 0, summary: `Imported ${rate.type} rate ${rate.base}/${rate.quote} ${rate.rate} effective ${r.effectiveAt}`, skipStatusUpdate: true });
        n++;
      }));
      return n;
    },
  };
}
