import { parseSheetDate } from "@/lib/format";

export function LastUpdated({ date, label = "Last updated" }: { date?: string; label?: string }) {
  if (!date) return null;
  const parsed = parseSheetDate(date);
  return (
    <p className="text-sm text-muted">
      {label} {parsed ? <time dateTime={parsed.iso}>{parsed.label}</time> : date}
    </p>
  );
}
