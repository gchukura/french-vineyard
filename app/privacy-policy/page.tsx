import { LegalPage, legalMetadata, type LegalDef } from "@/components/page/LegalPage";

const DEF: LegalDef = {
  key: "privacy_policy_mdx",
  title: "Privacy policy",
  path: "/privacy-policy/",
};

export const generateMetadata = () => legalMetadata(DEF);

export default function PrivacyPolicy() {
  return <LegalPage def={DEF} />;
}
