// Lixi's brain. Today this is a stub — the drawer, voice input and thread are real, the answers are
// placeholders. Keep `ask()` and `suggestionsFor()` as the only surface so a model-backed client can
// replace this file without touching the UI.

export interface LixiContext {
  /** current route path, e.g. "sales/invoices" */
  path: string;
  module: string;
  moduleLabel?: string;
  company?: string;
  user?: string;
}

const TIPS: Record<string, string[]> = {
  home: ['Try "Show me overdue receivables" or "What needs my approval today?"', 'Ask about any KPI on this dashboard.'],
  sales: ['Try "Which invoices are overdue?" or "Create an invoice for …".', 'Ask about a customer\'s outstanding balance.'],
  purchase: ['Try "Bills due this week" or "Open purchase orders".', 'Ask which vendor invoices are on hold.'],
  inventory: ['Try "Items below reorder level" or "Stock value by warehouse".', 'Ask about a batch or serial number.'],
  accounting: ['Try "Unposted journals" or "Trial balance for this period".', 'Ask what a period close will lock.'],
  banking: ['Try "Unreconciled bank lines" or "Cash position today".', 'Ask about a payment or receipt by reference.'],
  taxation: ['Try "GST payable this month" or "TDS due dates".', 'Ask which returns are pending.'],
  reports: ['Try "Profit & loss for last quarter" or "Top 5 customers by revenue".', 'Ask me to explain any figure on a report.'],
  setup: ['Try "Where do I change the invoice number series?" or "How do I add a user?".', 'Ask about any setting by name.'],
};

const SUGGESTIONS: Record<string, string[]> = {
  home: ['What needs my attention today?', 'Show overdue receivables', 'Summarise this month'],
  approvals: ['What is waiting on me?', 'Which approvals are past SLA?'],
  sales: ['Which invoices are overdue?', 'Create a new invoice', 'Top customers this month'],
  purchase: ['Bills due this week', 'Open purchase orders', 'Vendor invoices on hold'],
  inventory: ['Items below reorder level', 'Stock value by warehouse', 'Recent adjustments'],
  accounting: ['Unposted journals', 'What will a period close lock?', 'Trial balance summary'],
  banking: ['Cash position today', 'Unreconciled lines', 'Match this statement'],
  taxation: ['GST payable this month', 'TDS due dates', 'Pending returns'],
  payroll: ['Next payroll run', 'Employees missing inputs'],
  reports: ['Explain this report', 'Profit & loss for last quarter', 'Top 5 customers by revenue'],
  setup: ['How do I add a user?', 'Where is the invoice number series?', 'Switch to dark mode'],
  admin: ['How do I add a user?', 'Change the invoice number series', 'Lock a period'],
  masters: ['Import customers from a file', 'Add a new item', 'Set up a price list'],
};

/** Chips shown above the composer — page-aware, so the first question is one click away. */
export function suggestionsFor(ctx: LixiContext): string[] {
  return SUGGESTIONS[ctx.module] ?? ['What can you help with?', 'Where do I find settings?', 'Summarise this page'];
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Placeholder reply. Swap the body for a model call; the UI only depends on the returned string. */
export async function ask(message: string, ctx: LixiContext): Promise<string> {
  await wait(500 + Math.min(900, message.length * 12));
  const where = ctx.moduleLabel ? ` on ${ctx.moduleLabel}` : '';
  const tips = TIPS[ctx.module] ?? TIPS.home;
  const first = ctx.user ? `Thanks, ${ctx.user.split(' ')[0]}. ` : '';
  return `${first}I heard: "${message.trim()}".\n\nI'm not connected to a model yet, so I can't act on that${where} — but I've kept it in our thread. Once my model is wired up I'll answer from ${ctx.company ?? 'your company'}'s live books.\n\n${tips[0]}`;
}
