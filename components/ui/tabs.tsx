"use client";
import * as RadixTabs from "@radix-ui/react-tabs";

export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { value: string; label: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onChange} aria-label={ariaLabel}>
      <RadixTabs.List className="flex gap-1 overflow-x-auto border-b border-rule">
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className="min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm text-ink-muted data-[state=active]:border-brass data-[state=active]:font-semibold data-[state=active]:text-ink"
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
