import type { InsertScheduleBlock } from "./types.js";

export interface TypeAllocation {
  sessionTypeId: number;
  durationMinutes: number;
  fee: number; // full fee for this type, needed to compute sliding fee
  count: number; // sessions/week of this type
  slidingCount: number; // how many of `count` are sliding-scale (<= count)
}

export interface BuildBlocksParams {
  scenarioId: number;
  workingDays: number[]; // subset of 0..6 (Mon=0..Sun=6), any order
  allocations: TypeAllocation[];
  dayStartMinutes: number;
  slidingDiscountPct: number; // 0-100, e.g. 40 means sliding fee = fee * 0.6
  breakMinutes?: number; // buffer inserted between auto-generated back-to-back sessions (default 0)
  dayEndMinutes?: number; // configured end-of-day; when provided, drives overflow detection
}

export interface BuildBlocksResult {
  blocks: InsertScheduleBlock[];
  overflowDays: number[]; // working days whose combined session minutes exceed a
  // typical 12h day (informational only, for a UI warning)
}

/** Reduced (sliding-scale) fee, rounded to the nearest $5. */
export function slidingFeeFor(fullFee: number, discountPct: number): number {
  return Math.max(0, Math.round((fullFee * (1 - discountPct / 100)) / 5) * 5);
}

interface SessionRequest {
  sessionTypeId: number;
  durationMinutes: number;
  feeOverride: number | null;
  slidingScale: number; // 0 | 1
}

export function buildScheduleBlocks(params: BuildBlocksParams): BuildBlocksResult {
  const { scenarioId, allocations, dayStartMinutes, slidingDiscountPct } = params;

  // 1. Build per-type request lists, marking `slidingCount` requests evenly spread.
  const perType: SessionRequest[][] = allocations
    .filter((a) => a.count > 0)
    .map((a) => {
      const slidingCount = Math.max(0, Math.min(a.slidingCount, a.count));
      const requests: SessionRequest[] = [];
      for (let i = 0; i < a.count; i++) {
        // Bresenham-style even spread: mark i is sliding when the running
        // floor(i * slidingCount / count) increases at that i.
        const isSliding =
          Math.floor(((i + 1) * slidingCount) / a.count) > Math.floor((i * slidingCount) / a.count);
        requests.push({
          sessionTypeId: a.sessionTypeId,
          durationMinutes: a.durationMinutes,
          feeOverride: isSliding ? slidingFeeFor(a.fee, slidingDiscountPct) : null,
          slidingScale: isSliding ? 1 : 0,
        });
      }
      return requests;
    });

  // 2. Round-robin interleave the per-type lists into one combined list.
  const combined: SessionRequest[] = [];
  const maxLen = perType.reduce((m, list) => Math.max(m, list.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of perType) {
      if (i < list.length) combined.push(list[i]);
    }
  }

  // 3. Assign combined requests to working days round-robin.
  const days = [...params.workingDays].sort((a, b) => a - b);
  const byDay = new Map<number, SessionRequest[]>();
  for (const d of days) byDay.set(d, []);
  if (days.length > 0) {
    combined.forEach((req, i) => {
      const day = days[i % days.length];
      byDay.get(day)!.push(req);
    });
  }

  // 4. Lay out each day back-to-back from dayStartMinutes, inserting a break
  //    between consecutive sessions. 5. Detect overflow.
  const breakMinutes = params.breakMinutes ?? 0;
  const blocks: InsertScheduleBlock[] = [];
  const overflowDays: number[] = [];
  for (const day of days) {
    const dayRequests = byDay.get(day)!;
    let startMinutes = dayStartMinutes;
    let totalMinutes = 0;
    let lastEnd = dayStartMinutes;
    for (const req of dayRequests) {
      blocks.push({
        scenarioId,
        day,
        startMinutes,
        durationMinutes: req.durationMinutes,
        sessionTypeId: req.sessionTypeId,
        feeOverride: req.feeOverride,
        slidingScale: req.slidingScale,
        cadence: "weekly",
      });
      lastEnd = startMinutes + req.durationMinutes;
      startMinutes += req.durationMinutes + breakMinutes;
      totalMinutes += req.durationMinutes;
    }
    const overflow =
      params.dayEndMinutes != null ? lastEnd > params.dayEndMinutes : totalMinutes > 12 * 60;
    if (dayRequests.length > 0 && overflow) overflowDays.push(day);
  }

  return { blocks, overflowDays };
}
