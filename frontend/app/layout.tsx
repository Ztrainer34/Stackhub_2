import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import NavBar from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { getServerAuthState } from "@/lib/auth-server";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter } from "@/components/site-footer";
import { DEFAULT_OG_IMAGE } from "@/lib/og";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Favicons come from the file conventions in this folder: favicon.ico,
// icon.svg (switches colours with the browser's dark mode) and apple-icon.png.
export const metadata: Metadata = {
  metadataBase: new URL("https://stackhub.me"),
  title: "StackHub",
  description: "Show and Tell for Marketeers",
  openGraph: {
    siteName: "StackHub",
    title: "StackHub",
    description: "Show and Tell for Marketeers",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_OG_IMAGE.url],
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
