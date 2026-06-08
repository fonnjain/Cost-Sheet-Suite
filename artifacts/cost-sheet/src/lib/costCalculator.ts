export function calculateCostSheet(inputs: any, rmPrices: any) {
  // Placeholder implementation for calculator
  const steelBasePrice = Number(inputs.steelBasePrice) || 0;
  const incidental = Number(inputs.incidental) || 0;
  const scrapPct = Number(inputs.scrapPct) || 0;
  const recoveryPct = Number(inputs.recoveryPct) || 0;

  const steelLanded = steelBasePrice + incidental;
  const scrapCost = steelLanded * scrapPct;
  const recoveryCost = steelLanded * recoveryPct;
  const rmNet = steelLanded + scrapCost + recoveryCost;

  const zincPrice = Number(inputs.zincPrice) || 0;
  const zincMicron = Number(inputs.zincMicron) || 0;
  const zincCost = (zincPrice / 1000) * zincMicron * 1000;

  const fabLabor = Number(inputs.fabLabor) || 0;
  const weldCons = Number(inputs.weldCons) || 0;
  const galvFl = Number(inputs.galvFl) || 0;
  const packStrn = Number(inputs.packStrn) || 0;
  const loadUnload = Number(inputs.loadUnload) || 0;
  const handover = Number(inputs.handover) || 0;
  const others = Number(inputs.others) || 0;
  const convTotal = fabLabor + weldCons + galvFl + packStrn + loadUnload + handover + others;

  const protoCost = Number(inputs.protoCost) || 0;
  const protoPct = Number(inputs.protoPct) || 0;
  const protoCostPerMt = protoCost * protoPct;

  const wipSteelRate = Number(inputs.wipSteelRate) || 0;
  const wipSteelMonths = Number(inputs.wipSteelMonths) || 0;
  const wipSteelCost = rmNet * wipSteelRate * wipSteelMonths;

  const wipZincRate = Number(inputs.wipZincRate) || 0;
  const wipZincMonths = Number(inputs.wipZincMonths) || 0;
  const wipZincCost = zincCost * wipZincRate * wipZincMonths;
  const financeCost = wipSteelCost + wipZincCost;

  const inspectIns = Number(inputs.inspectIns) || 0;
  const spPacking = Number(inputs.spPacking) || 0;
  const freightOut = Number(inputs.freightOut) || 0;
  const thirdParty = Number(inputs.thirdParty) || 0;
  const agencyComm = Number(inputs.agencyComm) || 0;
  const bgCost = Number(inputs.bgCost) || 0;
  const contingency = inspectIns + spPacking + freightOut + thirdParty + agencyComm + bgCost;

  const baseForCredit = rmNet + zincCost + convTotal + protoCostPerMt + financeCost + contingency;
  
  // Credit costs
  let creditTotal = 0;
  const creditFields = ['openPo', 'finalPayment', 'emd', 'lc', 'vfs', 'abg', 'pbg', 'cpbg', 'advance'];
  for (const field of creditFields) {
    const rate = Number(inputs[`${field}Rate`]) || 0;
    const months = Number(inputs[`${field}Months`]) || 0;
    const pct = Number(inputs[`${field}Pct`]) || 0;
    creditTotal += (rate * months / 12) * pct * baseForCredit;
  }

  const totalBeforeMargin = baseForCredit + creditTotal;
  const marginPct = Number(inputs.marginPct) || 0;
  const quotePrice = marginPct < 1 ? totalBeforeMargin / (1 - marginPct) : totalBeforeMargin;

  return {
    steelLanded,
    scrapCost,
    recoveryCost,
    rmNet,
    zincCost,
    convTotal,
    protoCostPerMt,
    wipSteelCost,
    wipZincCost,
    financeCost,
    contingency,
    baseForCredit,
    creditTotal,
    totalBeforeMargin,
    quotePrice
  };
}

export function formatINR(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value);
}
