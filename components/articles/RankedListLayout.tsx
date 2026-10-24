import type { LayoutProps } from "@/components/articles/types";
import { Mdx } from "@/components/mdx/Mdx";
import { extractHeadings, stripRank } from "@/lib/content";

/** A numbered list: each "## n. Name" heading is one entry; a jump list sits on top. */
export function RankedListLayout({ article }: LayoutProps) {
  const entries = extractHeadings(article.body_mdx).map(stripRank);
  return (
    <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
      {entries.length ? (
        <nav aria-label="The list" className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">The list</p>
          <ol className="mt-3 space-y-2 text-sm">
            {entries.map((e, i) => (
              <li key={e} className="flex gap-3">
                <span className="font-heading font-semibold text-accent tabular-nums">{i + 1}</span>
                {e}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <Mdx source={article.body_mdx} />
    </div>
  );
}
