import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ClosingStack } from "@/components/ClosingStack";
import { JsonLd } from "@/components/JsonLd";
import { Mdx } from "@/components/mdx/Mdx";
import { PageBottom, PageTop, wrap } from "@/components/page/blocks";
import { configText } from "@/lib/config";
import { excerpt } from "@/lib/content";
import { getSiteData } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export type LegalDef = {
  /** Config key holding the page MDX, e.g. "about_mdx". */
  key: string;
  title: string;
  path: string;
  /** schema.org page type: AboutPage, ContactPage or WebPage. */
  type?: string;
};

export async function legalMetadata(def: LegalDef): Promise<Metadata> {
  const d = await getSiteData();
  return pageMetadata({
    title: def.title,
    description: excerpt(configText(d.config, def.key)),
    path: def.path,
  });
}

/**
 * Pages whose copy lives in the Config tab. No copy, no page: a 404 is
 * better than invented legal text.
 */
export async function LegalPage({ def, children }: { def: LegalDef; children?: ReactNode }) {
  const d = await getSiteData();
  const row = d.config.get(def.key);
  if (!row?.value && !children) notFound();
  return (
    <main id="main">
      <PageTop
        title={def.title}
        crumbs={[
          { name: "Home", href: "/" },
          { name: def.title, href: def.path },
        ]}
      />
      <div className={`${wrap} py-10`}>
        <Mdx source={row?.value} />
        {children}
      </div>
      <PageBottom updated={row?.updated_at}>
        <ClosingStack
          cta={{
            title: "Back to planning",
            primary: { label: "Browse tours", href: "/tours/" },
            secondary: { label: "Compare regions", href: "/regions/" },
          }}
        />
      </PageBottom>
      <JsonLd
        data={{ "@type": def.type ?? "WebPage", name: def.title, url: absoluteUrl(def.path) }}
      />
    </main>
  );
}
