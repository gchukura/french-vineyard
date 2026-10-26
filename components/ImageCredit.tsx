import { imageCaption } from "@/lib/credit";

/**
 * The credit caption for an image: author, source and licence, linked to the
 * source page when there is one. Renders nothing when there is nothing to
 * credit.
 */
export function ImageCredit({
  credit,
  license,
  sourceUrl,
  className = "",
}: {
  credit?: string;
  license?: string;
  sourceUrl?: string;
  className?: string;
}) {
  const caption = imageCaption({ credit, license });
  if (!caption) return null;
  return (
    <p className={className}>
      {sourceUrl ? (
        <a
          href={sourceUrl}
          rel="noopener"
          target="_blank"
          className="underline-offset-2 hover:underline"
        >
          {caption}
        </a>
      ) : (
        caption
      )}
    </p>
  );
}
