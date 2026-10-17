import type { SlotId } from "./types";

/**
 * Plugin slot registry (docs/PLUGIN_SPEC.md). THIS PHASE: the contract and
 * an empty registry only — the render pipeline calls slotFragments() on
 * every tenant render and gets nothing back, which is what makes plugins
 * work on ANY template later without touching packages.
 */
export type { SlotId } from "./types";

/** businessId is part of the future gating API, kept now so the call site
 * never needs restructuring. */
export async function slotFragments(
  _businessId: string
): Promise<Partial<Record<SlotId, string>>> {
  void _businessId;
  return {}; // no plugins installed — empty registry by design
}
