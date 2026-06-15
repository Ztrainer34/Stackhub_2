import { getServerAuthState } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tickets, Home } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const authState = await getServerAuthState();

  // TODO: Add proper admin role check
  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
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