import { JsonLd } from "@/components/JsonLd";
import { faqPage, type FaqItem } from "@/lib/schema";

/** Native <details> FAQ. Emits FAQPage JSON-LD for exactly the questions shown. */
export function Faq({
  items,
  title = "Frequently asked questions",
  jsonLd = true,
}: {
  items: FaqItem[];
  title?: string;
  /** Turn off when the same FAQ is rendered twice on a page (styleguide). */
  jsonLd?: boolean;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="text-2xl">{title}</h2>
      <div className="mt-4 divide-y divide-accent/40 border-y border-accent/40">
        {items.map((item) => (
          <details key={item.question} className="group py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
              {item.question}
              <span
                aria-hidden
                className="text-xl leading-none text-accent transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="pb-4 text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
      {jsonLd ? <JsonLd data={faqPage(items)} /> : null}
    </section>
  );
}
