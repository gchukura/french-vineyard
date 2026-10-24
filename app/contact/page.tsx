import { LegalPage, legalMetadata, type LegalDef } from "@/components/page/LegalPage";

const DEF: LegalDef = {
  key: "contact_mdx",
  title: "Contact",
  path: "/contact/",
  type: "ContactPage",
};

export const generateMetadata = () => legalMetadata(DEF);

export default function Contact() {
  return <LegalPage def={DEF} />;
}
