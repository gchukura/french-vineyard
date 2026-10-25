import Image from "next/image";

import { SIZES } from "@/components/Picture";

export type HeroImage = {
  src: string;
  alt: string;
  credit?: string;
  license?: string;
  isAi?: boolean;
};

/** Full-bleed hero with the one gradient CLAUDE.md allows: a bottom-up cellar fade. */
export function Hero({
  image,
  eyebrow,
  title,
  standfirst,
  priority = true,
}: {
  image: HeroImage;
  eyebrow?: string;
  title: string;
  standfirst?: string;
  /** The LCP image: load eagerly at high priority. Only the page's first hero. */
  priority?: boolean;
}) {
  const credit = [image.isAi ? "AI-generated illustration" : null, image.credit, image.license]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="relative isolate flex min-h-[28rem] items-end overflow-hidden bg-cellar text-chalk sm:min-h-[34rem]">
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={SIZES.full}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className="-z-20 object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-t from-cellar/90 via-cellar/45 to-transparent"
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-10 sm:px-6 sm:pb-14">
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 max-w-3xl text-4xl leading-tight text-balance sm:text-6xl">{title}</h1>
        {standfirst ? (
          <p className="mt-4 max-w-2xl text-lg text-chalk/90 sm:text-xl">{standfirst}</p>
        ) : null}
      </div>
      {credit ? (
        <p className="absolute right-3 bottom-2 text-[11px] text-chalk/75">{credit}</p>
      ) : null}
    </section>
  );
}
