import { SiteHeader } from "@/components/header/SiteHeader";
import { getArticles, getRegions, getTowns } from "@/lib/sheets";
import { regionPathMap } from "@/lib/tour-cta";

export async function Header() {
  const [regions, towns, articles] = await Promise.all([getRegions(), getTowns(), getArticles()]);
  return (
    <SiteHeader
      regions={regions.map((r) => ({
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        image: r.hero_image ? { src: r.hero_image, alt: "" } : null,
      }))}
      tourTargets={{
        regionSlugs: regions.map((r) => r.slug),
        paths: regionPathMap(towns, articles),
      }}
    />
  );
}
