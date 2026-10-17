/**
 * Field = label + control + hint/error, the only form row in the system
 * (inline errors under the field, never toast-only — DESIGN.md). Pass a
 * native <input>/<textarea>/<select> as children; ids/aria wiring lives
 * here.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-faint">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Shared native-input class (44px targets, hairline border, brass focus
 * comes from the global :focus-visible rule). */
export const inputCls =
  "block w-full rounded-md border border-rule bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-rule-strong focus:outline-none";
