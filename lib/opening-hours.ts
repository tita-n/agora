/**
 * Opening hours: the validated shape stored in Business.openingHours (Json).
 * One entry per weekday — either closed, or open+close as "HH:MM"
 * (24h, minutes). Zod schema for WRITES; a defensive parser for READS so a
 * hand-edited/drifted row degrades to "no hours" instead of crashing a
 * tenant's public page. Pure + unit-tested.
 */
import { z } from "zod";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type DayHours = { closed: true } | { closed?: false; open: string; close: string };
export type OpeningHours = Record<Weekday, DayHours>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const daySchema = z.union([
  z.object({ closed: z.literal(true) }).strict(),
  z
    .object({
      closed: z.literal(false).optional(),
      open: z.string().regex(TIME_RE, "Use 24-hour HH:MM, e.g. 09:00"),
      close: z.string().regex(TIME_RE, "Use 24-hour HH:MM, e.g. 17:30"),
    })
    .strict(),
]);

export const openingHoursSchema = z
  .object(Object.fromEntries(WEEKDAYS.map((d) => [d, daySchema])) as Record<Weekday, typeof daySchema>)
  .superRefine((val, ctx) => {
    for (const d of WEEKDAYS) {
      const day = val[d];
      if (!("open" in day)) continue;
      if (day.open >= day.close) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [d, "close"],
          message: "Closing time must be after opening time (we don't support after-midnight hours yet)",
        });
      }
    }
  });

/** minutes since midnight — validated "HH:MM" only */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Human summary for rendering, e.g. "9:00–17:30". Input assumed valid. */
export function formatHours(day: DayHours): string {
  if (day.closed) return "Closed";
  return `${day.open}–${day.close}`;
}

export function hoursRangeLabel(hours: OpeningHours): string | null {
  // Compact one-liner: identical-days ranges collapsed (Mon–Fri 09:00–17:00).
  const fmt = (t: string) => {
    const [h, m] = t.split(":");
    const hh = Number(h);
    const ampm = hh >= 12 ? "pm" : "am";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return m === "00" ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
  };
  const short: Record<Weekday, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
  };
  const label = (d: DayHours) => (d.closed ? "Closed" : `${fmt(d.open)}–${fmt(d.close)}`);
  const groups: { days: Weekday[]; text: string }[] = [];
  for (const d of WEEKDAYS) {
    const text = label(hours[d]);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(d);
    else groups.push({ days: [d], text });
  }
  if (groups.length === 1 && groups[0].days.length === 7 && groups[0].text === "Closed") return null;
  return groups
    .map((g) => {
      const names =
        g.days.length === 1 ? short[g.days[0]] : `${short[g.days[0]]}–${short[g.days[g.days.length - 1]]}`;
      return `${names}: ${g.text}`;
    })
    .join("\n");
}

export function toMinutesSafe(t: string | undefined): number | null {
  return typeof t === "string" && TIME_RE.test(t) ? toMinutes(t) : null;
}

/** Defensive READ parse: anything not exactly the contract → null
 * (= "no hours stored"). Never throws, never trusts. */
export function parseOpeningHours(raw: unknown): OpeningHours | null {
  const parsed = openingHoursSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Dashboard/wizard form shape → storage shape. A day marked closed (or left
 * blank) becomes {closed:true}; open days go through the SAME daySchema +
 * ordering rules as the storage schema, so the input schema can never accept
 * anything the stored shape would reject on read.
 */
const dayInput = z.preprocess((v) => {
  if (typeof v === "object" && v !== null) {
    const d = v as { closed?: boolean; open?: string; close?: string };
    if (d.closed === true) return { closed: true };
    return { closed: false, open: (d.open ?? "").trim(), close: (d.close ?? "").trim() };
  }
  return v;
}, daySchema);

export const openingHoursInput = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, dayInput])) as Record<Weekday, typeof dayInput>
);

