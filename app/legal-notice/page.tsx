import { LegalPage, legalMetadata, type LegalDef } from "@/components/page/LegalPage";

const DEF: LegalDef = { key: "legal_notice_mdx", title: "Legal notice", path: "/legal-notice/" };

export const generateMetadata = () => legalMetadata(DEF);

export default function LegalNotice() {
  return <LegalPage def={DEF} />;
}
