import { SiteHeader } from "@/components/header/SiteHeader";
import { getRegions } from "@/lib/sheets";

export async function Header() {
  const regions = await getRegions();
  return (
    <SiteHeader
      regions={regions.map((r) => ({
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        image: r.hero_image ? { src: r.hero_image, alt: "" } : null,
      }))}
    />
  );
}
