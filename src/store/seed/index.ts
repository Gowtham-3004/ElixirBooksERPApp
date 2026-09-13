// Composes all seed slices into one DB snapshot. Each module owns its own file.
import type { DB } from '../db';
import { seedPlatform, seedOrg, seedMasters } from './core';
import { seedSales } from './sales';
import { seedPurchase } from './purchase';
import { seedInventory } from './inventory';
import { seedBanking } from './banking';
import { seedPos } from './pos';
import { seedTaxation } from './taxation';
import { seedPayroll } from './payroll';
import { seedAssets } from './assets';
import { seedBudgets } from './budgets';
import { seedAccounting } from './accounting';
import { seedServices } from './services';
import { seedManufacturing } from './manufacturing';
import { seedAdmin } from './admin';
import { seedReports } from './reports';
import { seedCrm } from './crm';
import { seedConsolidation } from './consolidation';

export function buildSeed(): DB {
  const parts: Partial<DB>[] = [
    seedPlatform(), seedOrg(), seedMasters(),
    seedAccounting(), seedInventory(), seedSales(), seedPurchase(), seedBanking(), seedPos(),
    seedTaxation(), seedPayroll(), seedAssets(), seedBudgets(), seedServices(), seedManufacturing(),
    seedAdmin(), seedReports(), seedCrm(), seedConsolidation(),
  ];
  const out: DB = {};
  for (const p of parts) {
    for (const [k, rows] of Object.entries(p)) {
      if (!rows) continue;
      out[k] = [...(out[k] ?? []), ...rows];
    }
  }
  dedupeJournalNumbers(out);
  return out;
}

/**
 * Each module seeds its own journals and picks its own JV numbers, so numbers
 * collide across slices. Issued numbers must be unique (FR-DOC-003), so keep the
 * earliest holder of each number, renumber the rest onto free numbers in the same
 * company's series, repoint every record that referenced the old number, and move
 * the series' `next` past the highest number in use.
 */
function dedupeJournalNumbers(out: DB) {
  const journals = (out.journals ?? []) as any[];
  if (!journals.length) return;
  const parse = (n: string) => /^(.*?)(\d+)$/.exec(n ?? '');
  const used = new Map<string, Set<string>>(); // companyId → numbers
  const maxSeq = new Map<string, number>(); // companyId|prefix → highest sequence
  const ordered = [...journals].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || String(a.id).localeCompare(String(b.id)));
  const renamed: { id: string; from: string; to: string }[] = [];

  for (const j of ordered) {
    const co = j.companyId ?? '—';
    const set = used.get(co) ?? new Set<string>();
    used.set(co, set);
    const m = parse(j.number ?? '');
    if (m) maxSeq.set(`${co}|${m[1]}`, Math.max(maxSeq.get(`${co}|${m[1]}`) ?? 0, Number(m[2])));
    if (!j.number || !set.has(j.number)) {
      if (j.number) set.add(j.number);
      continue;
    }
    // collision — allocate the next free number on this prefix
    const prefix = m ? m[1] : 'JV/26-27/';
    const pad = m ? m[2].length : 4;
    let seq = (maxSeq.get(`${co}|${prefix}`) ?? 0) + 1;
    let next = `${prefix}${String(seq).padStart(pad, '0')}`;
    while (set.has(next)) next = `${prefix}${String(++seq).padStart(pad, '0')}`;
    maxSeq.set(`${co}|${prefix}`, seq);
    renamed.push({ id: j.id, from: j.number, to: next });
    j.number = next;
    set.add(next);
  }
  if (!renamed.length) return;

  // repoint documents that stored the old journal number alongside the journal id
  const byId = new Map(renamed.map((r) => [r.id, r.to]));
  for (const rows of Object.values(out)) {
    for (const r of rows as any[]) {
      if (r.journalId && byId.has(r.journalId)) r.journalNumber = byId.get(r.journalId);
      if (Array.isArray(r.journalIds)) {
        for (const jid of r.journalIds) if (byId.has(jid)) r.journalNumbers = undefined;
      }
    }
  }
  // keep the live series ahead of every issued number
  for (const s of (out.numberSeries ?? []) as any[]) {
    if (s.docType !== 'Journal') continue;
    const top = maxSeq.get(`${s.companyId ?? '—'}|${s.prefix}`) ?? 0;
    if (top >= s.next) s.next = top + 1;
  }
}

export { IDS, rec, SEED_NOW } from './core';
