// Faithful port of the v6 cost-sheet engine.
// Source: attached_assets/Vijay_Cost_Sheet_Suite-v6_1780913717806.html
// The RM Price List is a set of simple Excel formulas (+ and AVERAGE) referencing
// the fully-embedded "Billet and Gauge" sheet. We evaluate them exactly in TS so
// finished RM prices match v6 to the rupee. User edits in the RM console are passed
// as `overrides` keyed by Billet cell address.

import { BILLET_FULL, RM_FULL, INITIAL_DATA, MASTER_SPECS, V6Sheet } from "./data";

export type Overrides = Record<string, number>;

const BILLET_SHEET = "Billet and Gauge";
const RM_SHEET = "RM Price List";

const SHEETS: Record<string, V6Sheet> = {
  [BILLET_SHEET]: BILLET_FULL,
  [RM_SHEET]: RM_FULL,
};

// ---------- Excel cell helpers ----------
function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(64 + ((n - 1) % 26) + 1) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function expandRange(range: string): string[] {
  const [a, b] = range.split(":");
  const ma = a.match(/([A-Z]+)(\d+)/)!;
  const mb = b.match(/([A-Z]+)(\d+)/)!;
  const c1 = colToNum(ma[1]);
  const c2 = colToNum(mb[1]);
  const r1 = +ma[2];
  const r2 = +mb[2];
  const out: string[] = [];
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      out.push(numToCol(c) + r);
    }
  }
  return out;
}

// ---------- Formula evaluator ----------
type EvalResult = number | string | null;

function makeEvaluator(overrides: Overrides) {
  const cache = new Map<string, EvalResult>();

  function rawCell(sheet: string, addr: string): { f: string } | number | string | null {
    if (sheet === BILLET_SHEET && overrides[addr] !== undefined) return overrides[addr];
    const c = SHEETS[sheet]?.[addr];
    if (!c) return null;
    if (c.f) return { f: c.f };
    return c.v == null ? null : c.v;
  }

  function evalCell(sheet: string, addr: string): EvalResult {
    const key = sheet + "!" + addr;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    cache.set(key, 0); // cycle guard (no real cycles in v6 data)
    const v = rawCell(sheet, addr);
    let res: EvalResult;
    if (v === null) res = null;
    else if (typeof v === "number") res = v;
    else if (typeof v === "string") res = v;
    else res = evalFormula(sheet, v.f);
    cache.set(key, res);
    return res;
  }

  function refToNumber(curSheet: string, ref: string): number | number[] {
    ref = ref.trim();
    let sheet = curSheet;
    let addr = ref;
    const m = ref.match(/^'([^']+)'!(.+)$/) || ref.match(/^([A-Za-z _]+)!(.+)$/);
    if (m) {
      sheet = m[1];
      addr = m[2];
    }
    addr = addr.replace(/\$/g, "");
    if (addr.includes(":")) {
      return expandRange(addr).map((a) => {
        const r = evalCell(sheet, a);
        return typeof r === "number" ? r : 0;
      });
    }
    const r = evalCell(sheet, addr);
    if (typeof r === "number") return r;
    if (r === null || r === "" || r === "-") return 0;
    const n = Number(r);
    return isNaN(n) ? 0 : n;
  }

  function evalFormula(sheet: string, formula: string): number {
    let f = formula.replace(/^=/, "").trim();
    // AVERAGE(...) — v6 only uses AVERAGE
    f = f.replace(/AVERAGE\(([^)]+)\)/gi, (_m, inner: string) => {
      const vals: number[] = [];
      for (const part of inner.split(",")) {
        const r = refToNumber(sheet, part);
        if (Array.isArray(r)) vals.push(...r);
        else vals.push(r);
      }
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return "(" + avg + ")";
    });
    // Replace cell / cross-sheet references with their numeric values.
    f = f.replace(
      /'[^']+'!\$?[A-Z]+\$?\d+|\b\$?[A-Z]+\$?\d+\b/g,
      (tok) => {
        const v = refToNumber(sheet, tok);
        return "(" + (typeof v === "number" ? v : 0) + ")";
      },
    );
    try {
      // Only arithmetic remains (v6 formulas use + only, but support all basic ops).
      // eslint-disable-next-line no-new-func
      return Function('"use strict";return (' + f + ")")() as number;
    } catch {
      return 0;
    }
  }

  function cellNum(sheet: string, addr: string): number | null {
    const v = evalCell(sheet, addr);
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && v !== "-") {
      const n = Number(v);
      return isNaN(n) ? null : n;
    }
    return null;
  }
  function cellStr(sheet: string, addr: string): string | null {
    const v = evalCell(sheet, addr);
    return v != null ? String(v).trim() : null;
  }

  return { cellNum, cellStr };
}

// ---------- RM data parsing (verbatim from v6) ----------
export interface RMSupplier {
  col: string;
  make: string;
  supplier: string;
}
export interface RMRow {
  row: number;
  section: string;
  category: string | null;
  prices: Record<string, number>;
}
export interface RMBlock {
  suppliers: RMSupplier[];
  rows: RMRow[];
}
export interface RMData {
  angles: RMBlock;
  flats: RMBlock;
  rounds: RMBlock;
  rsj: RMBlock;
  plate: RMBlock;
  pipe: RMBlock;
  hardware: RMBlock;
  fbolts: RMBlock;
  zincPrice: number | null;
  rmDate: string;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildRMData(overrides: Overrides = {}): RMData {
  const { cellNum, cellStr } = makeEvaluator(overrides);

  function readBlock(
    makeRow: number,
    supplierRow: number,
    range: [number, number],
    cols: string[],
  ): RMBlock {
    const result: RMBlock = { suppliers: [], rows: [] };
    for (const col of cols) {
      const makeTag = cellStr(RM_SHEET, `${col}${makeRow}`);
      const supplier = cellStr(RM_SHEET, `${col}${supplierRow}`);
      if (makeTag) {
        const make = makeTag.replace(/^\(|\)$/g, "").trim();
        result.suppliers.push({ col, make, supplier: supplier || "" });
      }
    }
    for (let r = range[0]; r <= range[1]; r++) {
      const section = cellStr(RM_SHEET, `B${r}`);
      const category = cellStr(RM_SHEET, `C${r}`);
      if (!section) continue;
      const prices: Record<string, number> = {};
      for (const s of result.suppliers) {
        const v = cellNum(RM_SHEET, `${s.col}${r}`);
        if (v !== null) prices[s.col] = v;
      }
      result.rows.push({ row: r, section, category, prices });
    }
    return result;
  }

  const angles = readBlock(7, 8, [9, 16], ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]);
  const flats = readBlock(22, 23, [24, 30], ["D", "E", "F", "G", "H", "I", "J"]);
  const rounds = readBlock(36, 37, [38, 40], ["D", "E", "F", "G", "H", "I"]);
  const rsj = readBlock(47, 48, [49, 75], ["D", "E", "F", "G", "H", "I", "J", "K"]);
  const plate = readBlock(82, 83, [84, 89], ["D", "E", "F"]);
  const pipe = readBlock(96, 97, [98, 102], ["D", "E", "F", "G", "H"]);
  const hardware = readBlock(112, 113, [114, 119], ["D", "E", "F", "G", "H", "I"]);
  const fbolts = readBlock(126, 127, [128, 130], ["D", "E", "F"]);
  const zincPrice = cellNum(BILLET_SHEET, "C6");
  const rmDate = cellStr(BILLET_SHEET, "C4") || todayStr();
  return { angles, flats, rounds, rsj, plate, pipe, hardware, fbolts, zincPrice, rmDate };
}

export function getDistinctMakes(rm: RMData): string[] {
  const set = new Set<string>();
  for (const b of [rm.angles, rm.flats, rm.rounds, rm.rsj, rm.plate, rm.pipe, rm.hardware, rm.fbolts]) {
    if (b && b.suppliers) for (const s of b.suppliers) for (const part of s.make.split("/")) set.add(part.trim());
  }
  return Array.from(set).sort();
}

// ---------- RM price pick (verbatim) ----------
export function pickRMPriceForCategory(
  rm: RMData,
  category: string,
  make: string,
  matType: string,
): number | null {
  const catLower = category.toLowerCase();
  let block: RMBlock;
  let catFilter: ((row: RMRow) => boolean) | null;
  if (catLower.includes("plate")) {
    block = rm.plate;
    catFilter = null;
  } else if (catLower.includes("channel")) {
    block = rm.rsj;
    catFilter = (row) => !!row.section && row.section.includes("(MC)");
  } else if (catLower.includes("super heavy")) {
    block = rm.angles;
    catFilter = (row) => !!row.category && row.category.toLowerCase().includes("super heavy");
  } else if (catLower.includes("ultra heavy")) {
    block = rm.angles;
    catFilter = (row) => !!row.category && row.category.toLowerCase().includes("ultra heavy");
  } else if (catLower.includes("heavy")) {
    block = rm.angles;
    catFilter = (row) => !!row.category && row.category.toLowerCase() === "heavy";
  } else if (catLower.includes("medium")) {
    block = rm.angles;
    catFilter = (row) => !!row.category && row.category.toLowerCase() === "medium";
  } else if (catLower.includes("light")) {
    block = rm.angles;
    catFilter = (row) => !!row.category && row.category.toLowerCase() === "light";
  } else if (catLower.startsWith("m-")) {
    block = rm.hardware;
    catFilter = (row) => !!row.section && row.section.toLowerCase().includes(catLower);
  } else {
    return null;
  }

  const cols = block.suppliers
    .filter(
      (s) =>
        s.make.toUpperCase().split("/").some((p) => p.trim() === make.toUpperCase()) ||
        s.make.toUpperCase() === make.toUpperCase(),
    )
    .map((s) => s.col);
  if (cols.length === 0) cols.push(...block.suppliers.map((s) => s.col));

  const vals: number[] = [];
  for (const row of block.rows) {
    if (catFilter && !catFilter(row)) continue;
    for (const col of cols) if (row.prices[col] !== undefined) vals.push(row.prices[col]);
  }
  if (!vals.length) return null;
  let avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (matType === "HT") {
    if (block === rm.angles) avg += 3500;
    else if (block === rm.plate) avg += 3500;
    else if (block === rm.rsj) avg += 2000;
  }
  return avg;
}

export interface RMBreakdownItem {
  category: string;
  ratio: number;
  price: number | null;
  contrib: number;
}

export function calculateRMPrice(
  rm: RMData,
  spec: any,
  inp: any,
): { rm_price: number; breakdown: RMBreakdownItem[] } {
  const sch = spec.schema;
  const breakdown: RMBreakdownItem[] = [];
  if (sch === "tlt5" || sch === "subp") {
    const kvObj = spec.ratios.kv_options.find((o: any) => o.kv === inp.kv);
    if (!kvObj) return { rm_price: 0, breakdown };
    let total = 0;
    for (const [cat, ratio] of Object.entries(kvObj.ratios) as [string, number][]) {
      if (!ratio || ratio === 0) continue;
      const price = pickRMPriceForCategory(rm, cat, inp.make, inp.matType);
      const contrib = (price || 0) * ratio;
      total += contrib;
      breakdown.push({ category: cat, ratio, price, contrib });
    }
    return { rm_price: total, breakdown };
  }
  if (sch === "rsj") {
    const kvObj = spec.ratios.kv_options.find((o: any) => o.kv === inp.kv);
    if (!kvObj) return { rm_price: 0, breakdown };
    let sum = 0;
    for (const v of Object.values(kvObj.ratios) as number[]) sum += v || 0;
    if (sum === 0) sum = 1;
    let total = 0;
    for (const [cat, raw] of Object.entries(kvObj.ratios) as [string, number][]) {
      if (!raw) continue;
      const ratio = raw / sum;
      const price = pickRMPriceForCategory(rm, cat, inp.make, inp.matType);
      const contrib = (price || 0) * ratio;
      total += contrib;
      breakdown.push({ category: cat, ratio, price, contrib });
    }
    return { rm_price: total, breakdown };
  }
  if (sch === "hwfast") {
    const typeObj = spec.ratios.type_options.find((o: any) => o.type === inp.hwType);
    if (!typeObj) return { rm_price: 0, breakdown };
    let total = 0;
    for (const [cat, ratio] of Object.entries(typeObj.ratios) as [string, number][]) {
      if (!ratio) continue;
      const price = pickRMPriceForCategory(rm, cat, inp.make, "MS");
      const contrib = (price || 0) * ratio;
      total += contrib;
      breakdown.push({ category: cat, ratio, price, contrib });
    }
    return { rm_price: total, breakdown };
  }
  if (sch === "railc") {
    const secObj = spec.ratios.sections.find((s: any) => s.section === inp.section);
    if (!secObj) return { rm_price: 0, breakdown };
    let platePct = Number(secObj.plate_pct);
    if (!Number.isFinite(platePct)) platePct = 0;
    let channelPct = Number(secObj.channel_pct);
    if (!Number.isFinite(channelPct)) channelPct = 1 - platePct;
    const platePrice = pickRMPriceForCategory(rm, "Plate", inp.make, inp.matType) || 0;
    const channelPrice = pickRMPriceForCategory(rm, "Channel", inp.make, inp.matType) || 0;
    const blended = platePct * platePrice + channelPct * channelPrice;
    breakdown.push({ category: `Plate (${(platePct * 100).toFixed(1)}%)`, ratio: platePct, price: platePrice, contrib: platePct * platePrice });
    breakdown.push({ category: `Channel (${(channelPct * 100).toFixed(1)}%)`, ratio: channelPct, price: channelPrice, contrib: channelPct * channelPrice });
    return { rm_price: blended, breakdown };
  }
  const manual = Number(inp.manualRM) || 0;
  return { rm_price: manual, breakdown: [{ category: "Manual entry", ratio: 1, price: manual, contrib: manual }] };
}

// ---------- Cost sheet (verbatim) ----------
export interface CreditLine {
  rate: number;
  months: number;
  pct: number;
  principal: number;
  cost: number;
}
export interface CostResults {
  rmCalc: { rm_price: number; breakdown: RMBreakdownItem[] };
  rmPrice: number;
  steel: { landed: number; scrap: number; recovery: number; total: number; incidental: number };
  zinc: { price: number; micron: number; total: number };
  conversion: number;
  proto: number;
  financing: { wipSteel: number; wipZinc: number; total: number };
  contractual: number;
  subtotal: number;
  credit: Record<string, CreditLine>;
  creditTotal: number;
  total: number;
  margins: { pct: number; amount: number; quote: number }[];
}

export function calculateCostSheet(rm: RMData, spec: any, i: any): CostResults {
  const rmCalc = calculateRMPrice(rm, spec, i);
  const rmPrice = rmCalc.rm_price;

  const incidental = +i.incidental || 0;
  const landed = rmPrice + incidental;
  const scrap = landed * (+i.scrap_pct || 0);
  const recovery = scrap * (+i.recovery_pct || 0);
  const steelTotal = landed + scrap + recovery;

  const zincPrice = +i.zinc_price || 0;
  const zincMicron = +i.zincMicron || 0;
  const zincTotal = zincPrice * zincMicron;

  const convTotal =
    (+i.fab_labor || 0) +
    (+i.weld_cons || 0) +
    (+i.galv_fl || 0) +
    (+i.pack_strn || 0) +
    (+i.load_unload || 0) +
    (+i.handover || 0) +
    (+i.others_conv || 0);

  const protoCost = (+i.proto_cost || 0) * (+i.proto_pct || 0);

  const wipSteel = steelTotal * 1.18 * (+i.wip_steel_months || 0) * (+i.wip_steel_rate || 0);
  const wipZinc = zincTotal * 1.18 * (+i.wip_zinc_months || 0) * (+i.wip_zinc_rate || 0);
  const financingTotal = wipSteel + wipZinc;

  const contractualTotal =
    (+i.inspect_ins || 0) +
    (+i.sp_packing || 0) +
    (+i.freight_out || 0) +
    (+i.third_party || 0) +
    (+i.agency_comm || 0) +
    (+i.bg_cost || 0);

  const subtotal = steelTotal + zincTotal + convTotal + protoCost + financingTotal + contractualTotal;

  const credit: Record<string, CreditLine> = {};
  let creditTotal = 0;
  for (const k of ["open_p", "open_f", "emd", "lc", "vfs", "abg", "pbg", "cpbg"]) {
    const rate = +i[k + "_rate"] || 0;
    const months = +i[k + "_months"] || 0;
    const pct = +i[k + "_pct"] || 0;
    const principal = pct * subtotal * 1.18;
    const cost = rate * months * pct * principal;
    credit[k] = { rate, months, pct, principal, cost };
    creditTotal += cost;
  }
  {
    const rate = +i.adv_rate || 0;
    const months = +i.adv_months || 0;
    const pct = +i.adv_pct || 0;
    const principal = pct * subtotal;
    const cost = -rate * months * principal;
    credit.adv = { rate, months, pct, principal, cost };
    creditTotal += cost;
  }

  const total = subtotal + creditTotal;

  const margins: { pct: number; amount: number; quote: number }[] = [];
  for (let idx = 0; idx < 4; idx++) {
    const m = +i["margin_" + idx] || 0;
    margins.push({ pct: m, amount: total * m, quote: total + total * m });
  }

  return {
    rmCalc,
    rmPrice,
    steel: { landed, scrap, recovery, total: steelTotal, incidental },
    zinc: { price: zincPrice, micron: zincMicron, total: zincTotal },
    conversion: convTotal,
    proto: protoCost,
    financing: { wipSteel, wipZinc, total: financingTotal },
    contractual: contractualTotal,
    subtotal,
    credit,
    creditTotal,
    total,
    margins,
  };
}

// ---------- Input form helpers (drives the React calculator) ----------
export function buildDefaultInputs(spec: any, rm: RMData): Record<string, any> {
  const d = spec.defaults || {};
  const inputs: Record<string, any> = JSON.parse(JSON.stringify(d));
  const margins: number[] = d.margins || [0.03, 0.05, 0.08, 0.1];
  for (let idx = 0; idx < 4; idx++) inputs["margin_" + idx] = margins[idx] != null ? margins[idx] : 0;
  delete inputs.margins;

  if (spec.schema === "tlt5" || spec.schema === "subp") {
    const kvOpts = spec.ratios.kv_options || [];
    inputs.kv = kvOpts[1]?.kv || kvOpts[0]?.kv || "";
    inputs.make = "PG/NTPC";
    inputs.matType = "MS";
    inputs.zincMicron = d.zinc_micron != null ? d.zinc_micron : 0.045;
  } else if (spec.schema === "rsj") {
    const kvOpts = spec.ratios.kv_options || [];
    inputs.kv = kvOpts[1]?.kv || kvOpts[0]?.kv || "";
    inputs.make = "NPG";
    inputs.matType = "MS";
    inputs.zincMicron = d.zinc_micron != null ? d.zinc_micron : 0.05;
  } else {
    inputs.manualRM = d.rm_price || 50000;
    inputs.matType = "MS";
    inputs.zincMicron = d.zinc_micron != null ? d.zinc_micron : 0.05;
  }
  inputs.zinc_price = d.zinc_price || rm.zincPrice || 285000;
  return inputs;
}

export { MASTER_SPECS, INITIAL_DATA };
