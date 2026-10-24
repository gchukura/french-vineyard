import { LegalPage, legalMetadata, type LegalDef } from "@/components/page/LegalPage";

const DEF: LegalDef = {
  key: "about_mdx",
  title: "About us",
  path: "/about/",
  type: "AboutPage",
};

export const generateMetadata = () => legalMetadata(DEF);

export default function About() {
  return <LegalPage def={DEF} />;
}
