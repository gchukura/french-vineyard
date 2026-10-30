"use client";

import { usePathname } from "next/navigation";

import { ButtonLink } from "@/components/SmartLink";
import { bookTourHref } from "@/lib/tour-cta";

export type TourTargets = { regionSlugs: string[]; paths: Record<string, string> };

/** "Book a Tour": the current region's tours page, or all tours outside a region. */
export function BookTourButton({
  targets,
  className,
}: {
  targets: TourTargets;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <ButtonLink
      href={bookTourHref(pathname, targets.regionSlugs, targets.paths)}
      size="compact"
      className={className}
    >
      Book a Tour
    </ButtonLink>
  );
}
