/**
 * Caption text for an image credit: "Photo: Jane Doe / Wikimedia Commons,
 * CC BY-SA 4.0", or "AI-generated illustration" for generated images.
 * Undefined when there is nothing to credit.
 */
export function imageCaption({
  credit,
  license,
  isAi = false,
}: {
  credit?: string;
  license?: string;
  isAi?: boolean;
}): string | undefined {
  if (isAi) return ["AI-generated illustration", credit].filter(Boolean).join(" · ");
  const who = credit?.trim();
  const terms = license?.trim();
  if (!who && !terms) return undefined;
  return `Photo: ${[who, terms].filter(Boolean).join(", ")}`;
}
