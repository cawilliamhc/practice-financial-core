import type { Scenario } from "./types.js";

export function baselineOf<T extends Scenario>(scenarios: T[]): T | undefined {
  return scenarios.find((s) => s.isBaseline === 1) ?? scenarios[0];
}
