import Link from "next/link";

/**
 * Market Ledger button. md is 44px tall (touch target floor, DESIGN.md);
 * variants: primary = brass (the single confident accent), secondary = ink
 * outline, ghost = bare, danger = typed-confirm contexts. Rendered as <a>
 * via `href` so nav buttons are real links (works with JS off, prefetches).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const cls = (variant: ButtonVariant, size: "sm" | "md" | "lg") =>
  [
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
    "disabled:opacity-50 disabled:pointer-events-none select-none",
    size === "sm" ? "px-3 text-xs min-h-9" : size === "lg" ? "px-6 text-base min-h-12" : "px-4 text-sm min-h-11",
    variant === "primary" && "bg-brass text-white hover:bg-brass-dark active:bg-brass-dark",
    variant === "secondary" && "border border-ink/25 text-ink hover:bg-ink/5",
    variant === "ghost" && "text-ink hover:bg-ink/5",
    variant === "danger" && "border border-danger/40 text-danger hover:bg-danger/10",
  ]
    .filter(Boolean)
    .join(" ");

export function Button({
  variant = "primary",
  size = "md",
  href,
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  const c = `${cls(variant, size)} ${className}`;
  if (href !== undefined) {
    return href.startsWith("http") ? (
      <a href={href} className={c} target="_blank" rel="noreferrer">{children}</a>
    ) : (
      <Link href={href} className={c}>{children}</Link>
    );
  }
  return (
    <button className={c} {...rest}>
      {children}
    </button>
  );
}
