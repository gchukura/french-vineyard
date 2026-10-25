import Link from "next/link";
import type { ComponentProps } from "react";

import { AFFILIATE_REL, isAffiliateHref } from "@/lib/links";

type Props = Omit<ComponentProps<"a">, "href" | "rel"> & { href: string };

/**
 * Internal links use next/link. Links into /go/ are plain anchors, never
 * prefetched, and always carry rel="sponsored nofollow".
 */
export function SmartLink({ href, children, ...rest }: Props) {
  if (isAffiliateHref(href)) {
    return (
      <a href={href} rel={AFFILIATE_REL} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}

// No class merging here, so `className` must only add utilities these
// don't set (margins, width), never override display or padding.
const base =
  "inline-flex min-h-11 items-center justify-center rounded-button text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const buttonStyles = {
  primary: `${base} bg-primary text-on-primary hover:bg-primary/90`,
  secondary: `${base} border border-primary text-primary hover:bg-primary hover:text-on-primary dark:border-chalk dark:text-chalk dark:hover:bg-chalk dark:hover:text-cellar`,
};

const buttonSizes = {
  md: "px-5",
  /** Tighter on phones, for the header bar. */
  compact: "px-3 sm:px-5",
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: Props & { variant?: keyof typeof buttonStyles; size?: keyof typeof buttonSizes }) {
  return (
    <SmartLink
      className={`${buttonStyles[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  );
}
