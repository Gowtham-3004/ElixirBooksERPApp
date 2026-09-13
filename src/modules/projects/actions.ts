// Write-side actions for catalog, contracts, projects, resources, rate cards,
// timesheets, milestones, usage and billable expenses. Every state change goes
// through the shared engine (numbering, workflow, audit, notifications).
import { db, C, engine, ValidationError } from '../../store';
import type { Dimension, Item, ApprovalRequest, Customer } from '../../store';
import { round, today, uid } from '../../lib/format';
import type { BillableExpense, Contract, Milestone, Project, RateCard, Resource, Service, Timesheet, TimesheetRow, UsageRecord } from './types';
import { billRateFor, companyRows, contractOf, contractOfProject, currentEmployee, employeeOf, managerUserIdForProject, projectOf, projectsOfContract, settings, sheetTotals, weekStartOf } from './data';

const now = () => new Date().toISOString();

// ── Service catalog (FR-SRV-001) ───────────────────────────────────────────

export function saveService(input: Partial<Service> & { name: string; unit: Service['unit']; defaultRate: number }): Service {
  if (!input.name.trim()) throw new ValidationError('Service name is required', 'VALIDATION', 'name');
  if (input.defaultRate < 0) throw new ValidationError('Rate cannot be negative', 'VALIDATION', 'defaultRate');
  return db.transaction(() => {
    const existing = input.id ? db.find<Service>(C.services, input.id) : undefined;
    const code = input.code?.trim() || `SVC-${input.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12)}`;
    const itemPatch: Partial<Item> = { code, name: input.name, description: input.description, type: 'Service', group: 'Services', baseUom: input.unit === 'Fixed' ? 'Nos' : input.unit, hsn: input.sac, taxRateId: input.taxRateId, salesAccountId: input.revenueAccountId ?? 'acc_4010', salesPrice: input.defaultRate, isStock: false, status: input.status ?? 'Active' };
    let itemId = existing?.itemId ?? input.itemId;
    const item = db.find<Item>(C.items, itemId);
    if (item) db.update<Item>(C.items, item.id, itemPatch);
    else itemId = db.insert<Item>(C.items, { ...itemPatch, altUoms: [], tracking: 'None', reorderLevel: 0, reorderQty: 0, safetyStock: 0, leadTimeDays: 0, purchasePrice: 0 } as any).id;
    const fields = { itemId: itemId!, code, name: input.name, description: input.description, sac: input.sac, unit: input.unit, defaultRate: input.defaultRate, taxRateId: input.taxRateId, revenueAccountId: input.revenueAccountId ?? 'acc_4010', billableDefault: input.billableDefault ?? true, status: input.status ?? 'Active' };
    const out = existing ? db.update<Service>(C.services, existing.id, fields) : db.insert<Service>(C.services, fields);
    engine.audit({ action: existing ? 'service.updated' : 'service.created', objectType: 'Service', objectId: out.id, objectNumber: out.code, detail: `${out.name} · ${out.unit} · ${out.defaultRate}` });
    return out;
  });
}

// ── Contracts (FR-SRV-002) ─────────────────────────────────────────────────

export function newContract(partial: Partial<Contract> = {}): Contract {
  const co = engine.ctx().company;
  const base = engine.newDocHeader('Contract', { partyType: 'Customer', paymentTerms: co?.defaults.paymentTerms ?? 'Net 30', ...partial });
  const s = settings();
  return { ...base, docType: 'Contract', status: 'Draft', customerId: partial.customerId ?? '', title: partial.title ?? '', billingMethod: partial.billingMethod ?? 'Time & material', amount: partial.amount ?? 0, start: partial.start ?? today(), revenueMethod: partial.revenueMethod ?? s.prjRevenueMethodDefault, taxRateId: partial.taxRateId ?? co?.defaults.taxRateId, serviceItemId: partial.serviceItemId ?? s.prjDefaultServiceItemId, ...partial } as Contract;
}

export function validateContract(c: Contract): { field?: string; message: string }[] {
  const e: { field?: string; message: string }[] = [];
  if (!c.customerId) e.push({ field: 'customerId', message: 'Choose a customer' });
  if (!c.title?.trim()) e.push({ field: 'title', message: 'Contract title is required' });
  if (!c.start) e.push({ field: 'start', message: 'Start date is required' });
  if (c.end && c.end < c.start) e.push({ field: 'end', message: 'End date must be after the start date' });
  const cust = db.find<Customer>(C.customers, c.customerId);
  if (cust && cust.status !== 'Active') e.push({ field: 'customerId', message: `${cust.name} is ${cust.status.toLowerCase()}` });
  switch (c.billingMethod) {
    case 'Fixed price': if (!(c.amount > 0)) e.push({ field: 'amount', message: 'Fixed price needs a contract value' }); break;
    case 'Milestone': if (!(c.amount > 0)) e.push({ field: 'amount', message: 'Milestone contracts need a total value' }); break;
    case 'Time & material': if (!c.rateCardId && !(c.rates?.length)) e.push({ field: 'rateCardId', message: 'Pick a rate card or enter per-role rates' }); break;
    case 'Recurring': if (!c.recurrence || c.recurrence.amount <= 0) e.push({ field: 'recurrence', message: 'Recurring amount is required' }); if (!c.recurrence?.nextBillDate) e.push({ field: 'recurrence', message: 'Next bill date is required' }); break;
    case 'Usage': if (!c.usage?.metric) e.push({ field: 'usage', message: 'Usage metric is required' }); if (!(c.usage && c.usage.unitRate > 0)) e.push({ field: 'usage', message: 'Unit rate is required' }); break;
    case 'Cost plus': if (c.markupPct === undefined || c.markupPct < 0) e.push({ field: 'markupPct', message: 'Markup % is required' }); break;
  }
  return e;
}

export function saveContract(c: Contract, milestones?: Partial<Milestone>[], opts: { expectedVersion?: number } = {}): Contract {
  const errs = validateContract(c);
  if (errs.length) throw new ValidationError(errs.map((x) => x.message).join('; '), 'VALIDATION', errs[0].field);
  return db.transaction(() => {
    const cust = db.find<Customer>(C.customers, c.customerId)!;
    const snap = engine.partySnapshotFor('Customer', c.customerId);
    const rate = c.currency === engine.ctx().currency ? 1 : engine.resolveRate(c.currency, engine.ctx().currency, c.start).rate || 1;
    const value = c.billingMethod === 'Recurring' ? (c.recurrence?.amount ?? 0) : c.amount;
    const doc: Contract = { ...c, partyType: 'Customer', partyId: c.customerId, partyName: cust.name, partySnapshot: snap, rate, totals: { ...c.totals, total: value, subtotal: value, taxable: value, baseTotal: round(value * rate), due: 0 }, dimensions: { ...(c.dimensions ?? {}), ...(projectOf(c.projectId)?.dimensionId ? { Project: projectOf(c.projectId)!.dimensionId } : {}) } };
    const existing = db.find<Contract>(C.contracts, doc.id);
    let out: Contract;
    if (!existing) {
      const number = doc.number.includes('DRAFT') ? engine.allocateNumber('Contract', { date: doc.date, branchId: doc.branchId }) : doc.number;
      out = db.insert<Contract>(C.contracts, { ...doc, number, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
      engine.audit({ action: 'contract.created', objectType: 'Contract', objectId: out.id, objectNumber: out.number, detail: `${out.title} · ${out.billingMethod} · ${cust.name}`, correlationId: out.correlationId });
    } else {
      if (!['Draft', 'Returned', 'Rejected', 'Approved', 'Active'].includes(existing.status)) throw new ValidationError(`Contract is ${existing.status} and cannot be edited`, 'INVALID_STATE');
      const { id, createdAt, createdBy, version, number, status, approvalId, ...patch } = doc as any;
      out = db.update<Contract>(C.contracts, doc.id, { ...patch, status: existing.status === 'Approved' && existing.status !== doc.status ? 'Draft' : existing.status }, { expectedVersion: opts.expectedVersion });
      engine.audit({ action: 'contract.updated', objectType: 'Contract', objectId: out.id, objectNumber: out.number, correlationId: out.correlationId });
    }
    if (milestones) syncMilestones(out, milestones);
    // link project → contract
    if (out.projectId) { const p = projectOf(out.projectId); if (p && p.contractId !== out.id) db.update<Project>(C.projects, p.id, { contractId: out.id, customerId: out.customerId, customerName: cust.name }); }
    return out;
  });
}

/** Replace the contract's milestone / instalment schedule (uninvoiced rows only are editable). */
export function syncMilestones(c: Contract, rows: Partial<Milestone>[]) {
  const kind: Milestone['kind'] = c.billingMethod === 'Fixed price' ? 'Instalment' : 'Milestone';
  const existing = companyRows<Milestone>(C.milestones).filter((m) => m.contractId === c.id);
  const keep = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.name?.trim() && !(r.amount && r.amount > 0)) return;
    const prev = r.id ? existing.find((m) => m.id === r.id) : undefined;
    if (prev?.status === 'Invoiced') { keep.add(prev.id); return; }
    const fields = { contractId: c.id, projectId: c.projectId, kind, order: i + 1, name: r.name?.trim() || `${kind} ${i + 1}`, amount: round(r.amount ?? 0), due: r.due ?? c.start, status: prev?.status ?? r.status ?? 'Pending', deliverable: r.deliverable, achievedAt: prev?.achievedAt ?? r.achievedAt, achievedBy: prev?.achievedBy };
    const out = prev ? db.update<Milestone>(C.milestones, prev.id, fields) : db.insert<Milestone>(C.milestones, fields);
    keep.add(out.id);
  });
  existing.forEach((m) => { if (!keep.has(m.id) && m.status !== 'Invoiced') db.remove(C.milestones, m.id); });
}

export function contractNeedsWorkflow(c: Contract): boolean {
  return !!engine.resolveWorkflow('Contract', { amount: c.totals.baseTotal || c.amount, branchId: c.branchId, partyId: c.customerId });
}

/** Submit for approval; auto-approves when no 'Contract' workflow rule applies. */
export function submitContract(id: string): { request: ApprovalRequest | null; contract: Contract } {
  const c = db.find<Contract>(C.contracts, id);
  if (!c) throw new ValidationError('Contract not found', 'NOT_FOUND');
  if (!['Draft', 'Returned', 'Rejected'].includes(c.status)) throw new ValidationError(`Contract is ${c.status} — only drafts can be submitted`, 'INVALID_STATE');
  const errs = validateContract(c);
  if (errs.length) throw new ValidationError(errs.map((x) => x.message).join('; '), 'VALIDATION', errs[0].field);
  const req = engine.submitForApproval({ docType: 'Contract', collection: C.contracts, docId: c.id, docNumber: c.number, amount: c.totals.baseTotal || c.amount, currency: c.currency, branchId: c.branchId, partyId: c.customerId, summary: `${c.title} · ${c.billingMethod} · ${c.partyName}` });
  if (!req) {
    const out = db.update<Contract>(C.contracts, c.id, { status: 'Approved', approvedAt: now(), approvedBy: engine.ctx().userName, submittedAt: now(), submittedBy: engine.ctx().userName });
    engine.audit({ action: 'contract.approved', objectType: 'Contract', objectId: c.id, objectNumber: c.number, detail: 'Auto-approved — no Contract workflow rule applies', correlationId: c.correlationId });
    return { request: null, contract: out };
  }
  return { request: req, contract: db.find<Contract>(C.contracts, c.id)! };
}

export function activateContract(id: string): Contract {
  const c = db.find<Contract>(C.contracts, id);
  if (!c) throw new ValidationError('Contract not found', 'NOT_FOUND');
  if (c.status !== 'Approved') throw new ValidationError(`Contract must be Approved before activation (currently ${c.status})`, 'INVALID_STATE');
  return db.transaction(() => {
    const out = db.update<Contract>(C.contracts, c.id, { status: 'Active', activatedAt: now(), activatedBy: engine.ctx().userName });
    projectsOfContract(c.id).forEach((p) => { if (p.status === 'Planned') db.update<Project>(C.projects, p.id, { status: 'Active' }); });
    engine.audit({ action: 'contract.activated', objectType: 'Contract', objectId: c.id, objectNumber: c.number, correlationId: c.correlationId });
    engine.notify({ type: 'system', title: `Contract ${c.number} is active`, body: `${c.title} · ${c.partyName}`, link: `projects/contracts/${c.id}` });
    return out;
  });
}

export function completeContract(id: string, reason: string): Contract {
  const c = db.find<Contract>(C.contracts, id);
  if (!c || c.status !== 'Active') throw new ValidationError('Only active contracts can be completed', 'INVALID_STATE');
  const out = db.update<Contract>(C.contracts, c.id, { status: 'Completed', completedAt: now(), notes: [c.notes, `Completed: ${reason}`].filter(Boolean).join('\n') });
  engine.audit({ action: 'contract.completed', objectType: 'Contract', objectId: c.id, objectNumber: c.number, detail: reason, correlationId: c.correlationId });
  return out;
}

export function cancelContract(id: string, reason: string): Contract {
  const c = db.find<Contract>(C.contracts, id);
  if (!c) throw new ValidationError('Contract not found', 'NOT_FOUND');
  if (c.status === 'Completed' || c.status === 'Cancelled') throw new ValidationError(`Contract is already ${c.status}`, 'INVALID_STATE');
  const pending = db.findBy<ApprovalRequest>(C.approvals, (a) => a.docId === c.id && a.status === 'Pending');
  if (pending) db.update<ApprovalRequest>(C.approvals, pending.id, { status: 'Cancelled', completedAt: now(), history: [...pending.history, { at: now(), by: engine.ctx().userName, action: 'Cancelled with document', comment: reason }] });
  const out = db.update<Contract>(C.contracts, c.id, { status: 'Cancelled', cancelReason: reason });
  engine.audit({ action: 'contract.cancelled', objectType: 'Contract', objectId: c.id, objectNumber: c.number, detail: reason, correlationId: c.correlationId });
  return out;
}

export function updateProgress(id: string, period: string, pct: number, note?: string): Contract {
  const c = db.find<Contract>(C.contracts, id);
  if (!c) throw new ValidationError('Contract not found', 'NOT_FOUND');
  if (pct < 0 || pct > 100) throw new ValidationError('% complete must be between 0 and 100', 'VALIDATION', 'pct');
  const progress = [...(c.progress ?? []).filter((p) => p.period !== period), { period, pct, note }].sort((a, b) => a.period.localeCompare(b.period));
  const out = db.update<Contract>(C.contracts, c.id, { progress });
  engine.audit({ action: 'contract.progress', objectType: 'Contract', objectId: c.id, objectNumber: c.number, detail: `${period}: ${pct}% complete${note ? ' · ' + note : ''}`, correlationId: c.correlationId });
  return out;
}

// ── Projects ───────────────────────────────────────────────────────────────

export function saveProject(input: Partial<Project> & { name: string; customerId: string; start: string }): Project {
  if (!input.name.trim()) throw new ValidationError('Project name is required', 'VALIDATION', 'name');
  if (!input.customerId) throw new ValidationError('Choose a customer', 'VALIDATION', 'customerId');
  if (input.end && input.end < input.start) throw new ValidationError('End date must be after the start', 'VALIDATION', 'end');
  return db.transaction(() => {
    const existing = input.id ? db.find<Project>(C.projects, input.id) : undefined;
    const code = existing?.code ?? (input.code?.trim() || engine.allocateNumber('Project', { date: input.start }));
    const cust = db.find<Customer>(C.customers, input.customerId);
    // auto-create / refresh the Project dimension so journals can carry it
    let dimensionId = existing?.dimensionId ?? input.dimensionId;
    const dim = db.find<Dimension>(C.dimensions, dimensionId);
    if (dim) db.update<Dimension>(C.dimensions, dim.id, { name: input.name, status: input.status === 'Cancelled' || input.status === 'Completed' ? 'Inactive' : 'Active' });
    else dimensionId = db.insert<Dimension>(C.dimensions, { type: 'Project', code, name: input.name, status: 'Active', color: '#A855F7' }).id;
    const fields: Omit<Project, keyof import('../../store').BaseRecord> = { code, name: input.name, description: input.description, customerId: input.customerId, customerName: cust?.name, contractId: input.contractId, managerEmployeeId: input.managerEmployeeId, start: input.start, end: input.end, budgetHours: input.budgetHours ?? 0, budgetAmount: input.budgetAmount ?? 0, status: input.status ?? existing?.status ?? 'Planned', dimensionId: dimensionId!, teamEmployeeIds: input.teamEmployeeIds ?? existing?.teamEmployeeIds ?? [], branchId: input.branchId ?? engine.ctx().branchId, statusHistory: existing?.statusHistory ?? [] };
    const out = existing ? db.update<Project>(C.projects, existing.id, fields) : db.insert<Project>(C.projects, fields);
    if (out.contractId) { const c = contractOf(out.contractId); if (c && !c.projectId) db.update<Contract>(C.contracts, c.id, { projectId: out.id, dimensions: { ...(c.dimensions ?? {}), Project: out.dimensionId } }); }
    engine.audit({ action: existing ? 'project.updated' : 'project.created', objectType: 'Project', objectId: out.id, objectNumber: out.code, detail: `${out.name} · ${cust?.name ?? ''}` });
    return out;
  });
}

export function setProjectStatus(id: string, status: Project['status'], reason?: string): Project {
  const p = db.find<Project>(C.projects, id);
  if (!p) throw new ValidationError('Project not found', 'NOT_FOUND');
  if (p.status === status) return p;
  const out = db.update<Project>(C.projects, p.id, { status, statusHistory: [...(p.statusHistory ?? []), { at: now(), by: engine.ctx().userName, from: p.status, to: status, reason }] });
  if (status === 'Completed' || status === 'Cancelled') { const d = db.find<Dimension>(C.dimensions, p.dimensionId); if (d) db.update<Dimension>(C.dimensions, d.id, { status: 'Inactive' }); }
  engine.audit({ action: 'project.status', objectType: 'Project', objectId: p.id, objectNumber: p.code, detail: `${p.status} → ${status}${reason ? ' · ' + reason : ''}` });
  return out;
}

// ── Resources & rate cards ─────────────────────────────────────────────────

export function saveResource(input: Partial<Resource> & { employeeId: string; role: string; costRate: number; billRate: number; capacityHoursPerWeek: number }): Resource {
  const emp = employeeOf(input.employeeId);
  if (!emp) throw new ValidationError('Choose an employee', 'VALIDATION', 'employeeId');
  if (!input.role.trim()) throw new ValidationError('Role is required', 'VALIDATION', 'role');
  if (input.capacityHoursPerWeek <= 0 || input.capacityHoursPerWeek > 80) throw new ValidationError('Capacity must be between 1 and 80 hours per week', 'VALIDATION', 'capacityHoursPerWeek');
  const dupe = db.findBy<Resource>(C.resources, (r) => r.employeeId === input.employeeId && r.id !== input.id);
  if (dupe) throw new ValidationError(`${emp.name} is already a resource (${dupe.role})`, 'DUPLICATE', 'employeeId');
  const fields = { employeeId: emp.id, employeeName: emp.name, role: input.role.trim(), costRate: input.costRate, billRate: input.billRate, capacityHoursPerWeek: input.capacityHoursPerWeek, status: input.status ?? 'Active' };
  const out = input.id && db.find(C.resources, input.id) ? db.update<Resource>(C.resources, input.id, fields) : db.insert<Resource>(C.resources, fields);
  engine.audit({ action: 'resource.saved', objectType: 'Resource', objectId: out.id, objectNumber: emp.code, detail: `${emp.name} · ${out.role} · cost ${out.costRate}/h · bill ${out.billRate}/h` });
  return out;
}

export function saveRateCard(input: Partial<RateCard> & { name: string; currency: string; rows: RateCard['rows'] }): RateCard {
  if (!input.name.trim()) throw new ValidationError('Rate card name is required', 'VALIDATION', 'name');
  const rows = input.rows.filter((r) => r.role.trim()).map((r) => ({ role: r.role.trim(), rate: round(r.rate) }));
  if (!rows.length) throw new ValidationError('Add at least one role rate', 'VALIDATION', 'rows');
  const fields = { code: input.code?.trim() || `RC-${input.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 10)}`, name: input.name.trim(), currency: input.currency, rows, validFrom: input.validFrom, validTo: input.validTo, status: input.status ?? 'Active' };
  const out = input.id && db.find(C.rateCards, input.id) ? db.update<RateCard>(C.rateCards, input.id, fields) : db.insert<RateCard>(C.rateCards, fields);
  engine.audit({ action: 'ratecard.saved', objectType: 'Rate Card', objectId: out.id, objectNumber: out.code, detail: `${out.name} · ${rows.length} roles · ${out.currency}` });
  return out;
}

// ── Timesheets (FR-SRV-003) ────────────────────────────────────────────────

export function newTimesheetRow(partial: Partial<TimesheetRow> = {}): TimesheetRow {
  return { id: uid('tsr'), projectId: '', task: '', hours: [0, 0, 0, 0, 0, 0, 0], billable: true, ...partial };
}

export function newTimesheet(partial: Partial<Timesheet> = {}): Timesheet {
  const emp = partial.employeeId ? employeeOf(partial.employeeId) : currentEmployee();
  const c = engine.ctx();
  return { id: uid('ts'), createdAt: now(), updatedAt: now(), version: 1, companyId: c.companyId, number: 'TS/DRAFT', docType: 'Timesheet', employeeId: emp?.id ?? '', employeeName: emp?.name ?? '', weekStart: weekStartOf(today()), rows: [newTimesheetRow()], totalHours: 0, billableHours: 0, status: 'Draft', branchId: c.branchId, source: 'Web', correlationId: 'corr_' + uid('ts'), ...partial } as Timesheet;
}

export function validateTimesheet(t: Timesheet): { field?: string; message: string }[] {
  const e: { field?: string; message: string }[] = [];
  if (!t.employeeId) e.push({ field: 'employeeId', message: 'Choose an employee' });
  if (!t.weekStart) e.push({ field: 'weekStart', message: 'Week is required' });
  const rows = t.rows.filter((r) => r.hours.some((h) => h > 0));
  if (!rows.length) e.push({ field: 'rows', message: 'Log at least one hour' });
  rows.forEach((r, i) => {
    if (!r.projectId) e.push({ field: 'rows', message: `Row ${i + 1}: choose a project` });
    const p = projectOf(r.projectId);
    if (p && (p.status === 'Completed' || p.status === 'Cancelled')) e.push({ field: 'rows', message: `Row ${i + 1}: ${p.code} is ${p.status.toLowerCase()}` });
    if (r.hours.some((h) => h < 0 || h > 24)) e.push({ field: 'rows', message: `Row ${i + 1}: hours per day must be 0–24` });
  });
  const days = [0, 0, 0, 0, 0, 0, 0];
  rows.forEach((r) => r.hours.forEach((h, i) => { days[i] += h; }));
  if (days.some((d) => d > 24)) e.push({ field: 'rows', message: 'A day cannot exceed 24 hours across rows' });
  if (t.employeeId) {
    const dupe = db.findBy<Timesheet>(C.timesheets, (x) => x.id !== t.id && x.employeeId === t.employeeId && x.weekStart === t.weekStart && x.status !== 'Rejected');
    if (dupe) e.push({ field: 'weekStart', message: `${t.employeeName} already has timesheet ${dupe.number} for this week (${dupe.status})` });
  }
  return e;
}

export function saveTimesheet(t: Timesheet, opts: { expectedVersion?: number } = {}): Timesheet {
  const errs = validateTimesheet(t);
  if (errs.length) throw new ValidationError(errs.map((x) => x.message).join('; '), 'VALIDATION', errs[0].field);
  const emp = employeeOf(t.employeeId)!;
  const rows = t.rows.filter((r) => r.projectId || r.hours.some((h) => h > 0)).map((r) => ({ ...r, hours: r.hours.map((h) => round(Number(h) || 0, 2)) }));
  const tot = sheetTotals(rows);
  const doc = { ...t, employeeName: emp.name, rows, totalHours: tot.total, billableHours: tot.billable };
  const existing = db.find<Timesheet>(C.timesheets, doc.id);
  if (!existing) {
    const number = doc.number.includes('DRAFT') ? engine.allocateNumber('Timesheet', { date: doc.weekStart, branchId: doc.branchId }) : doc.number;
    const out = db.insert<Timesheet>(C.timesheets, { ...doc, number, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
    engine.audit({ action: 'timesheet.created', objectType: 'Timesheet', objectId: out.id, objectNumber: out.number, detail: `${out.employeeName} · week of ${out.weekStart} · ${out.totalHours} h`, correlationId: out.correlationId });
    return out;
  }
  if (!['Draft', 'Returned', 'Rejected'].includes(existing.status)) throw new ValidationError(`Timesheet is ${existing.status} and is locked`, 'INVALID_STATE');
  const { id, createdAt, createdBy, version, number, status, approvalId, ...patch } = doc as any;
  const out = db.update<Timesheet>(C.timesheets, doc.id, { ...patch, status: 'Draft' }, { expectedVersion: opts.expectedVersion });
  engine.audit({ action: 'timesheet.updated', objectType: 'Timesheet', objectId: out.id, objectNumber: out.number, detail: `${out.totalHours} h (${out.billableHours} billable)`, correlationId: out.correlationId });
  return out;
}

/** Value of billable hours (for the approval amount / summary). */
export function timesheetValue(t: Timesheet): number {
  let v = 0;
  t.rows.forEach((r) => {
    if (!r.billable) return;
    const c = contractOfProject(r.projectId);
    const rate = billRateFor(c, t.employeeId, r.serviceId).rate;
    v += r.hours.reduce((a, b) => a + (Number(b) || 0), 0) * rate;
  });
  return round(v);
}

export function submitTimesheet(id: string): { request: ApprovalRequest | null; timesheet: Timesheet } {
  const t = db.find<Timesheet>(C.timesheets, id);
  if (!t) throw new ValidationError('Timesheet not found', 'NOT_FOUND');
  if (!['Draft', 'Returned', 'Rejected'].includes(t.status)) throw new ValidationError(`Timesheet is ${t.status} — only drafts can be submitted`, 'INVALID_STATE');
  const errs = validateTimesheet(t);
  if (errs.length) throw new ValidationError(errs.map((x) => x.message).join('; '), 'VALIDATION', errs[0].field);
  const s = settings();
  const projectIds = Array.from(new Set(t.rows.map((r) => r.projectId).filter(Boolean)));
  const managerUserId = projectIds.map((p) => managerUserIdForProject(p)).find(Boolean);
  const value = timesheetValue(t);
  const c = engine.ctx();
  if (!s.prjTimesheetApproval) return { request: null, timesheet: approveDirect(t, 'Auto-approved — timesheet approval is disabled in settings') };
  const req = engine.submitForApproval({ docType: 'Timesheet', collection: C.timesheets, docId: t.id, docNumber: t.number, amount: value, currency: c.currency, branchId: t.branchId, project: projectIds[0], managerUserId, summary: `${t.employeeName} · week of ${t.weekStart} · ${t.totalHours} h (${t.billableHours} billable)` });
  if (!req) return { request: null, timesheet: approveDirect(t, 'Auto-approved — no Timesheet workflow rule applies') };
  return { request: req, timesheet: db.find<Timesheet>(C.timesheets, t.id)! };
}

function approveDirect(t: Timesheet, detail: string): Timesheet {
  const out = db.update<Timesheet>(C.timesheets, t.id, { status: 'Approved', submittedAt: now(), submittedBy: engine.ctx().userName, approvedAt: now(), approvedBy: 'system' });
  engine.audit({ action: 'timesheet.approved', objectType: 'Timesheet', objectId: t.id, objectNumber: t.number, detail, correlationId: t.correlationId });
  return out;
}

/** Approve / reject through the workflow engine and stamp the timesheet (FR-SRV-003 keeps approver). */
export function actOnTimesheet(id: string, action: 'Approve' | 'Reject' | 'Return' | 'Recall', comment?: string): Timesheet {
  const t = db.find<Timesheet>(C.timesheets, id);
  if (!t) throw new ValidationError('Timesheet not found', 'NOT_FOUND');
  const req = db.find<ApprovalRequest>(C.approvals, t.approvalId) ?? db.findBy<ApprovalRequest>(C.approvals, (a) => a.docId === t.id && a.status === 'Pending');
  if (!req) throw new ValidationError('No pending approval request for this timesheet', 'INVALID_STATE');
  const out = engine.actOnApproval(req.id, action, { comment });
  const patch: Partial<Timesheet> = {};
  if (out.status === 'Approved') { patch.status = 'Approved'; patch.approvedAt = now(); patch.approvedBy = engine.ctx().userName; }
  else if (out.status === 'Rejected') { patch.status = 'Rejected'; patch.rejectedAt = now(); patch.rejectionReason = comment; }
  else if (out.status === 'Returned') patch.status = 'Returned';
  else if (out.status === 'Recalled') patch.status = 'Draft';
  const res = db.update<Timesheet>(C.timesheets, t.id, patch);
  engine.audit({ action: `timesheet.${action.toLowerCase()}`, objectType: 'Timesheet', objectId: t.id, objectNumber: t.number, detail: comment, correlationId: t.correlationId });
  return res;
}

export function deleteDraftTimesheet(id: string) {
  const t = db.find<Timesheet>(C.timesheets, id);
  if (!t) return;
  if (t.status !== 'Draft') throw new ValidationError('Only drafts can be deleted', 'INVALID_STATE');
  db.remove(C.timesheets, id);
  engine.audit({ action: 'timesheet.draft_deleted', objectType: 'Timesheet', objectId: id, objectNumber: t.number });
}

// ── Milestones & usage ─────────────────────────────────────────────────────

export function achieveMilestone(id: string, date = today(), note?: string): Milestone {
  const m = db.find<Milestone>(C.milestones, id);
  if (!m) throw new ValidationError('Milestone not found', 'NOT_FOUND');
  if (m.status !== 'Pending') throw new ValidationError(`Milestone is already ${m.status}`, 'INVALID_STATE');
  const c = contractOf(m.contractId);
  if (c && c.status !== 'Active') throw new ValidationError(`Contract ${c.number} is ${c.status} — activate it first`, 'INVALID_STATE');
  const out = db.update<Milestone>(C.milestones, m.id, { status: 'Achieved', achievedAt: date, achievedBy: engine.ctx().userName, deliverable: note ?? m.deliverable });
  engine.audit({ action: 'milestone.achieved', objectType: 'Milestone', objectId: m.id, objectNumber: `${c?.number ?? ''} · ${m.name}`, detail: `${m.amount} · ready to bill${note ? ' · ' + note : ''}` });
  return out;
}

export function reopenMilestone(id: string, reason: string): Milestone {
  const m = db.find<Milestone>(C.milestones, id);
  if (!m) throw new ValidationError('Milestone not found', 'NOT_FOUND');
  if (m.status !== 'Achieved') throw new ValidationError('Only achieved (uninvoiced) milestones can be reopened', 'INVALID_STATE');
  const out = db.update<Milestone>(C.milestones, m.id, { status: 'Pending', achievedAt: undefined, achievedBy: undefined });
  engine.audit({ action: 'milestone.reopened', objectType: 'Milestone', objectId: m.id, detail: reason });
  return out;
}

export function saveUsage(input: Partial<UsageRecord> & { contractId: string; qty: number; period: string }): UsageRecord {
  const c = contractOf(input.contractId);
  if (!c) throw new ValidationError('Choose a usage contract', 'VALIDATION', 'contractId');
  if (c.billingMethod !== 'Usage') throw new ValidationError(`${c.number} is ${c.billingMethod}, not usage-based`, 'VALIDATION', 'contractId');
  if (!(input.qty > 0)) throw new ValidationError('Quantity must be positive', 'VALIDATION', 'qty');
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new ValidationError('Period must be yyyy-mm', 'VALIDATION', 'period');
  const rate = input.rate ?? tierRate(c, input.qty);
  const fields = { contractId: c.id, metric: input.metric ?? c.usage?.metric ?? 'Usage', qty: round(input.qty, 3), rate: round(rate, 4), amount: round(input.qty * rate), period: input.period, date: input.date ?? `${input.period}-01`, notes: input.notes, invoiced: false, source: input.source ?? 'Web' } as Omit<UsageRecord, keyof import('../../store').BaseRecord>;
  const existing = input.id ? db.find<UsageRecord>(C.usageRecords, input.id) : undefined;
  if (existing?.invoiced) throw new ValidationError('Invoiced usage cannot be edited', 'INVALID_STATE');
  const out = existing ? db.update<UsageRecord>(C.usageRecords, existing.id, fields) : db.insert<UsageRecord>(C.usageRecords, fields);
  engine.audit({ action: 'usage.recorded', objectType: 'Usage', objectId: out.id, objectNumber: c.number, detail: `${out.period} · ${out.qty} ${c.usage?.unit ?? ''} × ${out.rate}` });
  return out;
}

export function tierRate(c: Contract, qty: number): number {
  const tiers = (c.usage?.tiers ?? []).slice().sort((a, b) => a.upTo - b.upTo);
  for (const t of tiers) if (qty <= t.upTo) return t.rate;
  return c.usage?.unitRate ?? 0;
}

export function removeUsage(id: string) {
  const u = db.find<UsageRecord>(C.usageRecords, id);
  if (!u) return;
  if (u.invoiced) throw new ValidationError('Invoiced usage cannot be removed', 'INVALID_STATE');
  db.remove(C.usageRecords, id);
}

// ── Billable expenses (view over C.expenseClaims — read defensively) ────────

export interface ClaimLineView { claimId: string; claimNumber: string; lineId: string; employeeId: string; employeeName: string; date: string; description: string; amount: number; projectDim?: string; projectId?: string; claimStatus: string; billable?: BillableExpense }

/** Approved / reimbursed claim lines, with any project dimension resolved to a Project. */
export function claimLines(): ClaimLineView[] {
  const out: ClaimLineView[] = [];
  const projects = companyRows<Project>(C.projects);
  const flagged = companyRows<BillableExpense>(C.billableExpenses);
  companyRows<any>(C.expenseClaims).forEach((cl) => {
    if (!cl || !Array.isArray(cl.lines)) return;
    if (!['Approved', 'Reimbursed', 'Posted'].includes(String(cl.status))) return;
    cl.lines.forEach((l: any) => {
      if (!l) return;
      const dim = l.dimensions?.Project ?? cl.dimensions?.Project;
      const project = projects.find((p) => p.dimensionId === dim);
      out.push({ claimId: cl.id, claimNumber: cl.number ?? cl.id, lineId: l.id ?? uid('cl'), employeeId: cl.employeeId ?? '', employeeName: cl.employeeName ?? '', date: l.date ?? cl.date ?? '', description: l.description ?? l.categoryName ?? 'Expense', amount: round(Number(l.total ?? l.amount ?? 0)), projectDim: dim, projectId: project?.id, claimStatus: String(cl.status), billable: flagged.find((b) => b.claimId === cl.id && b.lineId === (l.id ?? '')) });
    });
  });
  return out;
}

export function flagBillable(v: ClaimLineView, projectId: string, markupPct: number): BillableExpense {
  const p = projectOf(projectId);
  if (!p) throw new ValidationError('Choose a project', 'VALIDATION', 'projectId');
  if (markupPct < 0 || markupPct > 100) throw new ValidationError('Markup must be 0–100 %', 'VALIDATION', 'markupPct');
  const existing = db.findBy<BillableExpense>(C.billableExpenses, (b) => b.claimId === v.claimId && b.lineId === v.lineId);
  if (existing?.status === 'Invoiced') throw new ValidationError('This expense is already invoiced', 'INVALID_STATE');
  const fields = { claimId: v.claimId, claimNumber: v.claimNumber, lineId: v.lineId, employeeId: v.employeeId, employeeName: v.employeeName, projectId: p.id, contractId: p.contractId, date: v.date, description: v.description, amount: v.amount, markupPct, billAmount: round(v.amount * (1 + markupPct / 100)), status: 'Ready' as const, approvedBy: engine.ctx().userName };
  const out = existing ? db.update<BillableExpense>(C.billableExpenses, existing.id, fields) : db.insert<BillableExpense>(C.billableExpenses, fields);
  engine.audit({ action: 'expense.billable', objectType: 'Billable Expense', objectId: out.id, objectNumber: v.claimNumber, detail: `${v.description} → ${p.code} @ +${markupPct}% = ${out.billAmount}` });
  return out;
}

export function excludeBillable(id: string, reason: string) {
  const b = db.find<BillableExpense>(C.billableExpenses, id);
  if (!b) return;
  if (b.status === 'Invoiced') throw new ValidationError('Invoiced expenses cannot be excluded', 'INVALID_STATE');
  db.update<BillableExpense>(C.billableExpenses, id, { status: 'Excluded' });
  engine.audit({ action: 'expense.excluded', objectType: 'Billable Expense', objectId: id, objectNumber: b.claimNumber, detail: reason });
}
