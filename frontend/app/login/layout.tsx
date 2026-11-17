import type { Metadata } from "next";

// Not a page anyone should land on from a search engine. `follow` stays on so
// links out of it still count.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
