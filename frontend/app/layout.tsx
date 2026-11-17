import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import NavBar from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { getServerAuthState } from "@/lib/auth-server";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter } from "@/components/site-footer";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DEFAULT_TITLE = "StackHub: GTM tool stacks and playbooks from real operators";

// Pages set their own title without a "| StackHub" suffix: the template adds it.
// Indexable pages set `alternates.canonical` themselves. It is deliberately not
// set here: a root canonical is inherited by every page that forgets its own
// and would point them all at the homepage.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authState = await getServerAuthState();

  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <Providers initialAuthState={authState}>
          <NavBar user={authState.status === 'authenticated' ? authState.user : null} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <OnboardingModal />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
