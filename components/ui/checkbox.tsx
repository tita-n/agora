"use client";
import * as RadixCheckbox from "@radix-ui/react-checkbox";

export function Checkbox({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  id: string;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-rule-strong bg-card data-[state=checked]:border-brass data-[state=checked]:bg-brass"
      >
        <RadixCheckbox.Indicator className="text-xs text-white">✓</RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}
