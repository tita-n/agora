/**
 * "Minimal" as a theme module (Phase 2.5). The component itself is
 * untouched — AC6 says every existing business must keep rendering exactly
 * as before — this file only adapts it to the new { data, agoraHref }
 * contract. It intentionally ignores products/services/gallery/etc: Minimal
 * is what it is (name, logo, description, contact) and remains the safe
 * fallback for unknown templateKeys.
 */
import { MinimalSite } from "@/components/themes/minimal-site";
import type { SiteRenderProps, ThemeModule } from "./types";

function renderSite({ data, agoraHref }: SiteRenderProps) {
  const b = data.business;
  return (
    <MinimalSite
      agoraHref={agoraHref}
      data={{
        name: b.name,
        description: b.description,
        logoUrl: b.logoUrl,
        // siteConfig.primaryColor is seeded FROM Business.primaryColor for
        // sites without a stored config, so nothing changes for them; once
        // an owner uses the design page, the sync keeps both in step.
        primaryColor: data.config.primaryColor,
        contactEmail: b.contactEmail,
        contactPhone: b.contactPhone,
        address: b.address,
      }}
    />
  );
}

export const MinimalTheme: ThemeModule = {
  key: "minimal",
  label: "Minimal",
  tagline: "One clean page: your name, story, and how to reach you.",
  forWho: "Any business that just needs a polished online card.",
  Site: renderSite,
};
