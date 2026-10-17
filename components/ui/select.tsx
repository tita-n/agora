"use client";
import * as RadixSelect from "@radix-ui/react-select";
import { inputCls } from "./field";

/** Radix Select styled as a Market Ledger field (keyboard + SR for free;
 * the native <select> fallback class is reused for borders). */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={`${inputCls} flex items-center justify-between gap-2 text-left data-[placeholder]:text-ink-faint`}
      >
        <RadixSelect.Value placeholder={placeholder ?? "Choose…"} />
        <RadixSelect.Icon className="text-ink-faint">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-auto rounded-md border border-rule bg-card shadow-lift"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer select-none items-center rounded px-3 py-2.5 text-sm text-ink data-[highlighted]:bg-ink/5 data-[state=checked]:font-semibold"
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
