import { SiteFooter } from "@/components/footer/SiteFooter";
import { getRegions } from "@/lib/sheets";

export async function Footer() {
  const regions = await getRegions();
  return <SiteFooter regions={regions.map(({ slug, name }) => ({ slug, name }))} />;
}
