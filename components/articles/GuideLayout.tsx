import type { LayoutProps } from "@/components/articles/types";
import { Mdx } from "@/components/mdx/Mdx";

export function GuideLayout({ article }: LayoutProps) {
  return <Mdx source={article.body_mdx} />;
}
