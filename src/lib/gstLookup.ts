// GSTIN lookup — "enter your GSTIN, we fetch the rest". Today the body is simulated; the UI depends only
// on the returned GstinDetails shape, so a real provider can replace this file (or be switched on by env):
//
//   VITE_GST_LOOKUP_URL   base URL; the module GETs `${url}/${gstin}` and expects a JSON body shaped like
//                         GstinDetails minus `provider`/`fetchedAt` (a thin proxy you control, since
//                         the GST portal itself has no CORS-friendly public API).
//   VITE_GST_LOOKUP_KEY   optional bearer token sent as `Authorization: Bearer …`.
//
// Simulated mode (no URL set) resolves seeded GSTINs from the KNOWN table and synthesises deterministic,
// plausible details for any other well-formed GSTIN. Demo triggers, so every UI state can be reached:
//   PAN letters (chars 3–7) ZZZZZ → "not found" error · YYYYY → status Cancelled · XXXXX → status Suspended
//   entity char (13th)      S → SEZ Unit · D → SEZ Developer · C → Composition · anything else → Regular
// (Real GSTINs carry no SEZ/composition signal in the number — those come from the portal record.)
import { stateNameOf, validateGSTIN } from './format';
import type { Address, GstinDetails } from '../store/types';

const LIVE_URL = import.meta.env.VITE_GST_LOOKUP_URL as string | undefined;
const LIVE_KEY = import.meta.env.VITE_GST_LOOKUP_KEY as string | undefined;
export const GST_LOOKUP_LIVE = !!LIVE_URL;
export const GST_LOOKUP_PROVIDER = GST_LOOKUP_LIVE ? 'GSTN' : 'GSTN (simulated)';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Known records (copied from the seed so this module stays free of store imports) ─────────────────
type Known = Omit<GstinDetails, 'provider' | 'fetchedAt'>;
const addr = (line1: string, city: string, state: string, stateCode: string, pin: string): Address => ({ line1, city, state, stateCode, pin, country: 'IN' });
const known = (gstin: string, legalName: string, tradeName: string, address: Address, extra: Partial<Known> = {}): Known => ({
  gstin, legalName, tradeName, pan: gstin.slice(2, 12), stateCode: gstin.slice(0, 2), state: address.state, constitution: 'Private Limited',
  status: 'Active', taxpayerType: 'Regular', registrationDate: '2017-07-01', address, isSez: false, ...extra,
});

const KNOWN: Record<string, Known> = Object.fromEntries([
  known('27AAAPL1234C1Z5', 'Elixir Business Solution Pvt Ltd', 'Elixir Business Solution', addr('Plot 14, Andheri Industrial Estate', 'Mumbai', 'Maharashtra', '27', '400053')),
  known('24AAAPL1234C2Z3', 'Elixir Business Solution Pvt Ltd', 'Elixir Business Solution — Surat SEZ', addr('2nd Floor, Ring Road', 'Surat', 'Gujarat', '24', '395002'), { taxpayerType: 'SEZ Unit', isSez: true }),
  known('29AABCR5678D1Z3', 'Rajesh Enterprises Pvt Ltd', 'Rajesh Enterprises', addr('11 MG Road', 'Bengaluru', 'Karnataka', '29', '560001')),
  known('24AABCS7890H1Z1', 'Sunrise Industries Pvt Ltd', 'Sunrise Industries', addr('GIDC Vapi', 'Vapi', 'Gujarat', '24', '396195')),
  known('27AABCG3456F1Z5', 'Global Tech Solutions Pvt Ltd', 'Global Tech Solutions', addr('Tower B, BKC', 'Mumbai', 'Maharashtra', '27', '400051')),
  known('29AABCS6543N1Z4', 'Sunshine Exports Pvt Ltd', 'Sunshine Exports', addr('SEZ Unit 12, Whitefield', 'Bengaluru', 'Karnataka', '29', '560066'), { taxpayerType: 'SEZ Unit', isSez: true }),
].map((k) => [k.gstin, k]));

// ── Synthesis tables ─────────────────────────────────────────────────────────────────────────────────
/** PAN 4th letter → holder type → closest BUSINESS_TYPES value. */
const CONSTITUTION: Record<string, string> = { C: 'Private Limited', P: 'Proprietorship', F: 'Partnership', A: 'Trust / Society', B: 'Trust / Society', T: 'Trust / Society' };
const LEGAL_SUFFIX: Record<string, string> = { 'Private Limited': ' Private Limited', 'Public Limited': ' Limited', Partnership: ' & Co', 'Trust / Society': ' Trust' };
/** PAN 5th letter is the first letter of the holder's name — keep synthetic names consistent with it. */
const FIRST_BY_LETTER: Record<string, string> = {
  A: 'Apex', B: 'Bharat', C: 'Crescent', D: 'Deccan', E: 'Everest', F: 'Falcon', G: 'Ganga', H: 'Himalaya', I: 'Indus', J: 'Jyoti', K: 'Kaveri', L: 'Lotus', M: 'Meridian',
  N: 'Narmada', O: 'Orion', P: 'Prime', Q: 'Quantum', R: 'Radiant', S: 'Shree', T: 'Tirumala', U: 'Unity', V: 'Vikram', W: 'Western', X: 'Xenon', Y: 'Yamuna', Z: 'Zenith',
};
const SECOND = ['Enterprises', 'Traders', 'Industries', 'Exports', 'Agencies', 'Technologies', 'Textiles', 'Engineering', 'Logistics', 'Pharma', 'Foods', 'Ventures', 'Motors', 'Infotech', 'Steels', 'Polymers'];
const LINE1 = ['Plot 7, Industrial Estate', 'No. 12, Main Road', '3rd Floor, Trade Centre', 'Unit 5, MIDC Area', 'Shop 21, Market Complex', 'Survey No. 88, Village Road'];
/** State code → a principal city and a PIN in it. */
const CITY_BY_STATE: Record<string, [string, string]> = {
  '01': ['Srinagar', '190001'], '02': ['Shimla', '171001'], '03': ['Ludhiana', '141001'], '04': ['Chandigarh', '160017'], '05': ['Dehradun', '248001'], '06': ['Gurugram', '122001'],
  '07': ['New Delhi', '110001'], '08': ['Jaipur', '302001'], '09': ['Noida', '201301'], '10': ['Patna', '800001'], '11': ['Gangtok', '737101'], '12': ['Itanagar', '791111'],
  '13': ['Dimapur', '797112'], '14': ['Imphal', '795001'], '15': ['Aizawl', '796001'], '16': ['Agartala', '799001'], '17': ['Shillong', '793001'], '18': ['Guwahati', '781001'],
  '19': ['Kolkata', '700001'], '20': ['Ranchi', '834001'], '21': ['Bhubaneswar', '751001'], '22': ['Raipur', '492001'], '23': ['Indore', '452001'], '24': ['Ahmedabad', '380001'],
  '26': ['Silvassa', '396230'], '27': ['Mumbai', '400001'], '29': ['Bengaluru', '560001'], '30': ['Panaji', '403001'], '31': ['Kavaratti', '682555'], '32': ['Kochi', '682001'],
  '33': ['Chennai', '600001'], '34': ['Puducherry', '605001'], '35': ['Port Blair', '744101'], '36': ['Hyderabad', '500001'], '37': ['Vijayawada', '520001'], '38': ['Leh', '194101'],
};

/** 32-bit FNV-1a — deterministic (engine.sha mixes in Date.now()). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function synthesise(gstin: string): Known {
  const stateCode = gstin.slice(0, 2);
  const state = stateNameOf(stateCode);
  if (!state) throw new Error(`State code ${stateCode} is not a recognised GST state`);
  const pan = gstin.slice(2, 12);
  const constitution = CONSTITUTION[gstin[5]] ?? 'Other';
  const entity = gstin[12];
  const taxpayerType: GstinDetails['taxpayerType'] = entity === 'S' ? 'SEZ Unit' : entity === 'D' ? 'SEZ Developer' : entity === 'C' ? 'Composition' : 'Regular';
  const h = fnv1a(gstin);
  const tradeName = `${FIRST_BY_LETTER[gstin[6]] ?? 'Nav'} ${SECOND[h % SECOND.length]}`;
  const [city, pin] = CITY_BY_STATE[stateCode] ?? [state, ''];
  const reg = new Date(Date.UTC(2017, 6, 1) + (h % 3000) * 86_400_000).toISOString().slice(0, 10);
  return {
    gstin, legalName: tradeName + (LEGAL_SUFFIX[constitution] ?? ''), tradeName, pan, stateCode, state, constitution,
    status: 'Active', taxpayerType, registrationDate: reg, isSez: taxpayerType.startsWith('SEZ'),
    address: { line1: LINE1[(h >>> 8) % LINE1.length], city, state, stateCode, pin, country: 'IN' },
  };
}

async function fetchLive(gstin: string): Promise<Known> {
  let res: Response;
  try {
    res = await fetch(`${LIVE_URL!.replace(/\/$/, '')}/${gstin}`, { headers: LIVE_KEY ? { Authorization: `Bearer ${LIVE_KEY}` } : {}, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error('Could not reach the GST lookup service — check your connection or enter the details manually');
  }
  if (res.status === 404) throw new Error('GSTIN not found on the GST portal — check the number or enter the details manually');
  if (!res.ok) throw new Error(`GST lookup failed (HTTP ${res.status}) — try again or enter the details manually`);
  const body = (await res.json()) as Known;
  return { ...body, gstin, pan: body.pan ?? gstin.slice(2, 12), stateCode: body.stateCode ?? gstin.slice(0, 2), state: body.state ?? stateNameOf(gstin.slice(0, 2)) ?? '' };
}

/** Resolve a GSTIN to the taxpayer's registered details. Throws with a user-facing message on any failure. */
export async function lookupGstin(input: string): Promise<GstinDetails> {
  const gstin = (input ?? '').replace(/\s+/g, '').toUpperCase();
  const err = gstin ? validateGSTIN(gstin) : 'Enter a GSTIN';
  if (err) throw new Error(err);
  const fetchedAt = () => new Date().toISOString();
  if (GST_LOOKUP_LIVE) return { ...(await fetchLive(gstin)), provider: 'GSTN', fetchedAt: fetchedAt() };

  await wait(600 + Math.random() * 500);
  const letters = gstin.slice(2, 7);
  if (letters === 'ZZZZZ') throw new Error('GSTIN not found on the GST portal — check the number or enter the details manually');
  const base = KNOWN[gstin] ?? synthesise(gstin);
  const status: GstinDetails['status'] = letters === 'YYYYY' ? 'Cancelled' : letters === 'XXXXX' ? 'Suspended' : base.status;
  return { ...base, status, provider: 'GSTN (simulated)', fetchedAt: fetchedAt() };
}
