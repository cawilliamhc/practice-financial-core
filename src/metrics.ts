import type { ScheduleBlock, SessionType } from "./types.js";

export function blockFee(block: ScheduleBlock, type?: SessionType): number {
  if (block.feeOverride != null) return block.feeOverride;
  return type ? type.fee : 0;
}

/** Standard (non-discounted) fee for a block — used to compute access subsidy. */
export function standardFee(block: ScheduleBlock, type?: SessionType): number {
  return type ? type.fee : (block.feeOverride ?? 0);
}

/**
 * Weekly-average weight for a block. An every-other-week (biweekly) block only
 * occurs on half of the weeks, so it contributes 0.5x to every weekly-average
 * metric (revenue, hours, session count, sliding-scale subsidy). Weekly blocks
 * contribute 1x.
 */
export function cadenceWeight(block: ScheduleBlock): number {
  return block.cadence === "biweekly" ? 0.5 : 1;
}

export function isBiweekly(block: ScheduleBlock): boolean {
  return block.cadence === "biweekly";
}

export interface ScenarioMetrics {
  revenue: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  sessionCount: number;
  effectiveRate: number;
  longestStretchMinutes: number;
  revenueByType: { name: string; color: string; value: number }[];
  // Sliding-scale / access
  slidingSessions: number;
  accessSubsidy: number; // weekly standard - charged, summed over sliding-scale blocks
  // Cadence breakdown (raw block counts, not weekly-average-weighted)
  weeklyBlockCount: number; // blocks that occur every week
  biweeklyBlockCount: number; // blocks that occur every other week
}

export function computeMetrics(
  blocks: ScheduleBlock[],
  typesById: Map<number, SessionType>
): ScenarioMetrics {
  let revenue = 0;
  let billableMinutes = 0;
  let nonBillableMinutes = 0;
  let slidingSessions = 0;
  let accessSubsidy = 0;
  let sessionCount = 0;
  let weeklyBlockCount = 0;
  let biweeklyBlockCount = 0;
  const byType = new Map<number, { name: string; color: string; value: number }>();

  for (const b of blocks) {
    const t = typesById.get(b.sessionTypeId);
    const fee = blockFee(b, t);
    const billable = t ? t.billable === 1 : true;
    // Every-other-week blocks count at 0.5x in ALL weekly-average metrics.
    const w = cadenceWeight(b);
    if (isBiweekly(b)) biweeklyBlockCount += 1;
    else weeklyBlockCount += 1;
    revenue += fee * w;
    sessionCount += w;
    if (billable) billableMinutes += b.durationMinutes * w;
    else nonBillableMinutes += b.durationMinutes * w;
    if (b.slidingScale === 1) {
      slidingSessions += w;
      accessSubsidy += Math.max(0, standardFee(b, t) - fee) * w;
    }
    if (t) {
      const cur = byType.get(t.id) ?? { name: t.name, color: t.color, value: 0 };
      cur.value += fee * w;
      byType.set(t.id, cur);
    }
  }

  const billableHours = billableMinutes / 60;
  // Effective hourly rate is unaffected by cadence by construction
  // (0.5x fee / 0.5x hours), but we compute it from the weighted totals anyway.
  const effectiveRate = billableHours > 0 ? revenue / billableHours : 0;

  // Longest continuous stretch without a break (per day), across billable+non-billable.
  let longestStretchMinutes = 0;
  for (let day = 0; day < 7; day++) {
    const dayBlocks = blocks
      .filter((b) => b.day === day)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    let stretchStart = -1;
    let stretchEnd = -1;
    for (const b of dayBlocks) {
      const end = b.startMinutes + b.durationMinutes;
      if (stretchStart === -1) {
        stretchStart = b.startMinutes;
        stretchEnd = end;
      } else if (b.startMinutes <= stretchEnd) {
        stretchEnd = Math.max(stretchEnd, end);
      } else {
        longestStretchMinutes = Math.max(longestStretchMinutes, stretchEnd - stretchStart);
        stretchStart = b.startMinutes;
        stretchEnd = end;
      }
    }
    if (stretchStart !== -1) {
      longestStretchMinutes = Math.max(longestStretchMinutes, stretchEnd - stretchStart);
    }
  }

  const revenueByType = Array.from(byType.values())
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return {
    revenue,
    billableMinutes,
    nonBillableMinutes,
    sessionCount,
    effectiveRate,
    longestStretchMinutes,
    revenueByType,
    slidingSessions,
    accessSubsidy,
    weeklyBlockCount,
    biweeklyBlockCount,
  };
}

export function overlaps(
  a: { day: number; startMinutes: number; durationMinutes: number },
  b: { day: number; startMinutes: number; durationMinutes: number }
): boolean {
  if (a.day !== b.day) return false;
  const aEnd = a.startMinutes + a.durationMinutes;
  const bEnd = b.startMinutes + b.durationMinutes;
  return a.startMinutes < bEnd && b.startMinutes < aEnd;
}
