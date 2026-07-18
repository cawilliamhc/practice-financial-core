export interface FinancialInputs {
  weeklyGross: number; // sum of block fees for the ideal week
  utilization: number; // percent 0-100
  workingWeeks: number;
  monthlyExpenses: number;
  taxRate: number; // percent 0-50
  retirementMonthly: number; // $ per month
}

export interface FinancialResult {
  // Ideal-week (unadjusted) figures
  weeklyGross: number;
  // Expected (utilization-adjusted) figures
  weeklyExpected: number;
  monthlyGross: number; // expected monthly gross
  annualGross: number; // expected annual gross
  // Net (gross - expenses)
  monthlyNet: number;
  annualNet: number;
  // Take-home waterfall (annual)
  annualExpenses: number;
  afterExpenses: number; // annualGross - annualExpenses
  taxes: number; // afterExpenses x taxRate (only on positive)
  afterTaxes: number;
  annualRetirement: number;
  takeHomeAnnual: number;
  takeHomeMonthly: number;
}

/**
 * Net = gross - monthly expenses.
 * Weekly expense proration: monthlyExpenses x 12 / workingWeeks.
 * Take-home = (annualGross [utilization already applied] - annualExpenses) x (1 - taxRate) - annualRetirement.
 */
export function computeFinancials(inp: FinancialInputs): FinancialResult {
  const u = inp.utilization / 100;
  const weeklyExpected = inp.weeklyGross * u;
  const annualGross = weeklyExpected * inp.workingWeeks;
  const monthlyGross = annualGross / 12;

  const annualExpenses = inp.monthlyExpenses * 12;
  const monthlyNet = monthlyGross - inp.monthlyExpenses;
  const annualNet = annualGross - annualExpenses;

  const afterExpenses = annualGross - annualExpenses;
  const taxes = afterExpenses > 0 ? afterExpenses * (inp.taxRate / 100) : 0;
  const afterTaxes = afterExpenses - taxes;
  const annualRetirement = inp.retirementMonthly * 12;
  const takeHomeAnnual = afterTaxes - annualRetirement;

  return {
    weeklyGross: inp.weeklyGross,
    weeklyExpected,
    monthlyGross,
    annualGross,
    monthlyNet,
    annualNet,
    annualExpenses,
    afterExpenses,
    taxes,
    afterTaxes,
    annualRetirement,
    takeHomeAnnual,
    takeHomeMonthly: takeHomeAnnual / 12,
  };
}

// ---- Multi-year fee-increase modeling ----
export interface YearProjection {
  year: number; // 1-based
  gross: number; // annual gross
  net: number; // annual net
  takeHome: number; // annual take-home
}

/**
 * Fee increase applies uniformly to all fees -> scales weeklyGross by (1+rate)^(year-1).
 * Expenses, tax rate, retirement, utilization held constant across horizon.
 */
export function multiYearProjection(
  baseWeeklyGross: number,
  feeIncreasePct: number,
  horizonYears: number,
  utilization: number,
  workingWeeks: number,
  monthlyExpenses: number,
  taxRate: number,
  retirementMonthly: number
): YearProjection[] {
  const out: YearProjection[] = [];
  for (let y = 1; y <= horizonYears; y++) {
    const factor = Math.pow(1 + feeIncreasePct / 100, y - 1);
    const weeklyGross = baseWeeklyGross * factor;
    const f = computeFinancials({
      weeklyGross,
      utilization,
      workingWeeks,
      monthlyExpenses,
      taxRate,
      retirementMonthly,
    });
    out.push({ year: y, gross: f.annualGross, net: f.annualNet, takeHome: f.takeHomeAnnual });
  }
  return out;
}
