import { getServerAuthState } from "@/lib/auth-server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tickets, Home } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
  }

  // Not an admin: a 404, so the page does not even confirm that /admin exists.
  // This hides the UI only. The backend refuses every /admin API call from a
  // non-admin (RequireAdmin), which is the actual boundary.
  if (!authState.user.is_admin) {
    notFound();
  }

  return (
    <div className="bg-gray-50 flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-sm border-r">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>
        <nav className="mt-6">
          <div className="px-4 space-y-2">
            <Link href="/admin">
              <Button
                variant="ghost"
                className="w-full justify-start"
              >
                <Home className="mr-2 h-4 w-4" />
                Overview
              </Button>
            </Link>
            <Link href="/admin/tool-tickets">
              <Button
                variant="ghost"
                className="w-full justify-start"
              >
                <Tickets className="mr-2 h-4 w-4" />
                Tool Tickets
              </Button>
            </Link>
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}