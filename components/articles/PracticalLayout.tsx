import type { LayoutProps } from "@/components/articles/types";
import { Mdx } from "@/components/mdx/Mdx";
import { extractHeadings } from "@/lib/content";

/** Practical how-to: the "## " headings are the steps, listed up front. */
export function PracticalLayout({ article }: LayoutProps) {
  const steps = extractHeadings(article.body_mdx);
  return (
    <div className="space-y-10">
      {steps.length ? (
        <nav aria-label="Steps" className="max-w-3xl rounded-card border border-accent/50 p-5">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">
            In this guide
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm marker:text-tag">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </nav>
      ) : null}
      <Mdx source={article.body_mdx} />
    </div>
  );
}
