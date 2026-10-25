import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, type Crumb } from "@/lib/jsonld";

/** Visible trail plus matching BreadcrumbList JSON-LD. The last item is the current page. */
export function Breadcrumbs({ items, jsonLd = true }: { items: Crumb[]; jsonLd?: boolean }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-2">
              {i ? <span aria-hidden>/</span> : null}
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex min-h-8 items-center underline-offset-4 hover:underline"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {jsonLd ? <JsonLd data={breadcrumbJsonLd(items)} /> : null}
    </nav>
  );
}
