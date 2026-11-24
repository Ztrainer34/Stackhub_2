import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import NavBar from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { getServerAuthState } from "@/lib/auth-server";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter } from "@/components/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The public pages' fonts (.public-theme in globals.css).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StackHub",
  description: "Show and Tell for Marketeers",
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
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${spaceGrotesk.variable} antialiased min-h-screen flex flex-col`}
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
