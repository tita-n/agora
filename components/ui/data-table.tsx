/**
 * DataTable: a real table at md+, stacked cards below — ONE markup, two
 * presentations (no mobile horizontal scroll, no data duplication). Rows are
 * declarative so every existing admin/dashboard table can migrate here.
 */
export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** hide on the mobile card (secondary columns) */
  hideMobile?: boolean;
  /** label used on the mobile card when the column stays visible */
  mobileLabel?: string;
};

export function DataTable<T extends { id: string }>({ columns, rows, caption }: {
  columns: Column<T>[];
  rows: T[];
  caption?: string;
}) {
  const mobileCols = columns.filter((c) => !c.hideMobile);
  return (
    <>
      {/* mobile: cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border border-rule bg-card p-3.5">
            {mobileCols.map((c, i) => (
              <div key={c.key} className={i === 0 ? "" : "mt-1.5"}>
                {i !== 0 && mobileCols.length > 1 && (
                  <span className="mr-2 text-xs text-ink-faint">{c.mobileLabel ?? c.header}</span>
                )}
                <span className={i === 0 ? "text-sm font-semibold text-ink" : "text-sm text-ink"}>{c.render(r)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {/* md+: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-rule text-left">
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-rule/60 last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2.5 align-middle text-ink tabular">
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
