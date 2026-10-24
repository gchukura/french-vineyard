export type Cell = string | number;

/** Zebra table for practical facts. Figures use tabular (monospaced) numerals. */
export function PracticalTable({
  caption,
  columns,
  rows,
  numeric = [],
}: {
  caption: string;
  columns: string[];
  rows: Cell[][];
  /** Indexes of columns to right-align. */
  numeric?: number[];
}) {
  const align = (i: number) => (numeric.includes(i) ? "text-right" : "text-left");
  return (
    <div className="overflow-x-auto rounded-card border border-accent/40">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="px-4 py-3 text-left font-heading text-lg font-semibold">
          {caption}
        </caption>
        <thead>
          <tr className="border-y border-accent/40">
            {columns.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-2 font-semibold ${align(i)}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="odd:bg-surface">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className={`px-4 py-2 font-medium ${align(i)}`}>
                    {cell}
                  </th>
                ) : (
                  <td key={i} className={`px-4 py-2 ${align(i)}`}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
