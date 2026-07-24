import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { termsHtml } from "@/lib/legal/terms";

export const metadata: Metadata = {
  title: "Terms of Service | StackHub",
  description: "The terms that govern your use of StackHub.",
};

export default function TermsPage() {
  return <LegalDoc active="/terms" html={termsHtml} />;
}
