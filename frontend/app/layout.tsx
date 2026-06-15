import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import NavBar from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { getServerAuthState } from "@/lib/auth-server";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stackhub",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full flex flex-col`}
      >
        <Providers initialAuthState={authState}>
          <NavBar user={authState.status === 'authenticated' ? authState.user : null} />
          <main className="flex-1 min-h-0">{children}</main>
          <OnboardingModal />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
