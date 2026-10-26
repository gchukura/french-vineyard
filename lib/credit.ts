/**
 * Caption text for an image credit: "Photo: Jane Doe / Wikimedia Commons,
 * CC BY-SA 4.0". Undefined when there is nothing to credit.
 */
export function imageCaption({
  credit,
  license,
}: {
  credit?: string;
  license?: string;
}): string | undefined {
  const who = credit?.trim();
  const terms = license?.trim();
  if (!who && !terms) return undefined;
  return `Photo: ${[who, terms].filter(Boolean).join(", ")}`;
}

/** Pages in an Images row's used_on cell ("/a/, /b/"), in order, without repeats. */
export function usedOn(cell?: string): string[] {
  return [
    ...new Set(
      (cell ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
