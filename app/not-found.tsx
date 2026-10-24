import Link from "next/link";

import { wrap } from "@/components/page/blocks";
import { ButtonLink } from "@/components/SmartLink";
import { PLAN_INDEX_HREF, REGIONS_INDEX_HREF, TOURS_INDEX_HREF } from "@/lib/site";

export default function NotFound() {
  return (
    <main id="main" className={`${wrap} flex-1 py-24`}>
      <p className="text-xs font-semibold tracking-[0.2em] text-tag uppercase">Page not found</p>
      <h1 className="mt-2 text-4xl">This page isn&rsquo;t here</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        It may have moved, or it isn&rsquo;t published yet. Try one of these instead.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href={REGIONS_INDEX_HREF}>Wine regions</ButtonLink>
        <ButtonLink href={TOURS_INDEX_HREF} variant="secondary">
          Tours &amp; tastings
        </ButtonLink>
      </div>
      <p className="mt-6 text-sm">
        <Link href={PLAN_INDEX_HREF} className="underline underline-offset-2">
          Plan your trip
        </Link>{" "}
        or go to the{" "}
        <Link href="/" className="underline underline-offset-2">
          home page
        </Link>
        .
      </p>
    </main>
  );
}
