// Narrow, structural type contracts for the engine — deliberately smaller than
// either app's own domain types (Practice Studio's DB-backed ScheduleBlock,
// Client Studio's real Appointment). Both apps' richer types already satisfy
// these via structural typing, so no adapter boilerplate is needed on the
// Practice Studio side; Client Studio just needs to construct plain objects
// with these fields when it collapses real appointments into anonymous blocks.

export interface SessionType {
  id: number;
  name: string;
  fee: number; // USD, whole dollars
  durationMinutes: number;
  billable: number; // 1 = billable, 0 = non-billable
  color: string;
}

export interface ScheduleBlock {
  day: number; // 0=Mon ... 6=Sun
  startMinutes: number; // minutes from midnight
  durationMinutes: number;
  sessionTypeId: number;
  feeOverride: number | null;
  slidingScale: number; // 1 = reduced-fee sliding-scale block
  cadence: string; // "weekly" | "biweekly" (biweekly counts at 0.5x in weekly-average metrics)
}

// Output shape for buildScheduleBlocks — a ScheduleBlock plus the scenario it
// belongs to (mirrors Practice Studio's InsertScheduleBlock).
export interface InsertScheduleBlock extends ScheduleBlock {
  scenarioId: number;
}

export interface Expense {
  amountCents: number;
  frequency: string; // "monthly" | "annual"
}

export interface Scenario {
  id: number;
  isBaseline: number; // 1 = baseline (exactly one, by convention)
}
