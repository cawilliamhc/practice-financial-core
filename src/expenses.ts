import type { Expense } from "./types.js";

export function expenseMonthly(e: Expense): number {
  const dollars = e.amountCents / 100;
  return e.frequency === "annual" ? dollars / 12 : dollars;
}

export function expenseAnnual(e: Expense): number {
  const dollars = e.amountCents / 100;
  return e.frequency === "annual" ? dollars : dollars * 12;
}

export function totalMonthlyExpenses(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + expenseMonthly(e), 0);
}

export function totalAnnualExpenses(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + expenseAnnual(e), 0);
}
