import { Picture, SIZES, type ImageData } from "@/components/Picture";
import { SmartLink } from "@/components/SmartLink";

export const cardClass =
  "rounded-card border border-transparent bg-surface transition-colors hover:border-accent focus-within:border-accent";

export type CardProps = {
  href: string;
  title: string;
  image?: ImageData | null;
  eyebrow?: string;
  description?: string;
  ratio?: "3:2" | "4:3";
};

export function Card({ href, title, image, eyebrow, description, ratio = "3:2" }: CardProps) {
  return (
    <article className={`group relative overflow-hidden ${cardClass}`}>
      <Picture image={image} ratio={ratio === "3:2" ? "3 / 2" : "4 / 3"} sizes={SIZES.card} />
      <div className="p-5">
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-widest text-tag uppercase">{eyebrow}</p>
        ) : null}
        <h3 className="mt-1 text-xl leading-snug">
          <SmartLink
            href={href}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {title}
          </SmartLink>
        </h3>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
      </div>
    </article>
  );
}
