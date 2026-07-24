import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { privacyHtml } from "@/lib/legal/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy | StackHub",
  description: "How StackHub collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return <LegalDoc active="/privacy" html={privacyHtml} />;
}
