import { compileMDX } from "next-mdx-remote/rsc";

import { mdxComponents } from "@/components/mdx/components";
import { plainText } from "@/lib/content";

/**
 * Renders MDX from the Sheet. JS expressions stay blocked (the library
 * default), so custom tags take string props only:
 *   <TourCards ids="t1, t2" />  <HotelCards ids="h1" />
 *   <PracticalTable caption="…" columns="A|B" rows="x|y; z|w" numeric="1" />
 *   <Callout title="Tip">…</Callout>  <MethodologyBox>…</MethodologyBox>
 * A cell that fails to compile renders as plain paragraphs instead of
 * breaking the page, and the error is logged for the build output.
 */
export async function Mdx({ source, className = "" }: { source?: string; className?: string }) {
  if (!source?.trim()) return null;
  const content = await compile(source);
  return (
    <div className={`prose-fv ${className}`}>
      {content ??
        source
          .split(/\n{2,}/)
          .map((p) => plainText(p))
          .filter(Boolean)
          .map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}

/** Compiled MDX, or null if the source doesn't compile. */
async function compile(source: string) {
  try {
    return (await compileMDX({ source, components: mdxComponents })).content;
  } catch (error) {
    console.error("MDX failed to compile; rendering as text.", error);
    return null;
  }
}
