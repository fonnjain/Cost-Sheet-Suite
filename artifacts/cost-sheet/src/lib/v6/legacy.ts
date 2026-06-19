import type { CostResults } from "./engine";

// Maps the v6 engine's CostResults + v6-keyed inputs into the flat storage
// shape (camelCase inputs + flat costBreakdown) that the dashboard, review and
// PDF export pages read. New quotes are computed by the faithful v6 engine but
// persisted in this stable shape so all downstream display code keeps working.

export interface LegacyCostBreakdown {
  [key: string]: number;
  steelLanded: number;
  scrapCost: number;
  recoveryCost: number;
  rmNet: number;
  zincCost: number;
  convTotal: number;
  protoCostPerMt: number;
  wipSteelCost: number;
  wipZincCost: number;
  financeCost: number;
  contingency: number;
  baseForCredit: number;
  creditTotal: number;
  totalBeforeMargin: number;
  quotePrice: number;
}

// v6 credit id -> legacy camelCase credit id
const CREDIT_ID_MAP: Record<string, string> = {
  open_p: "openPo",
  open_f: "finalPayment",
  emd: "emd",
  lc: "lc",
  vfs: "vfs",
  abg: "abg",
  pbg: "pbg",
  cpbg: "cpbg",
  adv: "advance",
};

export function toLegacyShape(
  i: Record<string, any>,
  r: CostResults,
  marginIdx: number
): { legacyInputs: Record<string, any>; legacyCostBreakdown: LegacyCostBreakdown } {
  const legacyInputs: Record<string, any> = {
    // Steel base price is the computed RM/MT so the dashboard can show it.
    steelBasePrice: r.rmPrice,
    incidental: +i.incidental || 0,
    scrapPct: +i.scrap_pct || 0,
    recoveryPct: +i.recovery_pct || 0,
    zincPrice: +i.zinc_price || 0,
    zincMicron: +i.zincMicron || 0,
    fabLabor: +i.fab_labor || 0,
    weldCons: +i.weld_cons || 0,
    galvFl: +i.galv_fl || 0,
    packStrn: +i.pack_strn || 0,
    loadUnload: +i.load_unload || 0,
    handover: +i.handover || 0,
    others: +i.others_conv || 0,
    protoCost: +i.proto_cost || 0,
    protoPct: +i.proto_pct || 0,
    wipSteelRate: +i.wip_steel_rate || 0,
    wipSteelMonths: +i.wip_steel_months || 0,
    wipZincRate: +i.wip_zinc_rate || 0,
    wipZincMonths: +i.wip_zinc_months || 0,
    inspectIns: +i.inspect_ins || 0,
    spPacking: +i.sp_packing || 0,
    freightOut: +i.freight_out || 0,
    thirdParty: +i.third_party || 0,
    agencyComm: +i.agency_comm || 0,
    bgCost: +i.bg_cost || 0,
    marginPct: r.margins[marginIdx]?.pct ?? 0,
    // Material selectors (kv is also stored as the top-level kvOption column).
    make: i.make ?? "",
    matType: i.matType ?? "",
  };

  for (const [v6Id, legacyId] of Object.entries(CREDIT_ID_MAP)) {
    legacyInputs[`${legacyId}Rate`] = +i[`${v6Id}_rate`] || 0;
    legacyInputs[`${legacyId}Months`] = +i[`${v6Id}_months`] || 0;
    legacyInputs[`${legacyId}Pct`] = +i[`${v6Id}_pct`] || 0;
  }

  const legacyCostBreakdown: LegacyCostBreakdown = {
    steelLanded: r.steel.landed,
    scrapCost: r.steel.scrap,
    recoveryCost: r.steel.recovery,
    rmNet: r.steel.total,
    zincCost: r.zinc.total,
    convTotal: r.conversion,
    protoCostPerMt: r.proto,
    wipSteelCost: r.financing.wipSteel,
    wipZincCost: r.financing.wipZinc,
    financeCost: r.financing.total,
    contingency: r.contractual,
    baseForCredit: r.subtotal,
    creditTotal: r.creditTotal,
    totalBeforeMargin: r.total,
    quotePrice: r.margins[marginIdx]?.quote ?? 0,
  };

  return { legacyInputs, legacyCostBreakdown };
}
