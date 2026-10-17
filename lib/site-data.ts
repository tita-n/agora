/**
 * SiteData contract — the platform side re-exports the PURE core types so
 * dashboard/editor components keep one import path while the engine package
 * (core/agora-engine) remains standalone. The contract itself is documented
 * in docs/TEMPLATE_SPEC.md; changing it is a spec change.
 */
export {
  siteDataSchema,
  EMPTY_SITE_DATA,
  buildWaLink,
  formatKobo,
  formatHours,
  type SiteData,
  type SiteHoursEntry,
  type SectionType,
  sectionTypes,
} from "@/core/agora-engine/site-data";
