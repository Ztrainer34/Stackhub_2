import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { cookiesHtml } from "@/lib/legal/cookies";

export const metadata: Metadata = {
  title: "Cookie Policy | StackHub",
  description: "How StackHub uses cookies and similar technologies.",
};

export default function CookiesPage() {
  return <LegalDoc active="/cookies" html={cookiesHtml} />;
}
