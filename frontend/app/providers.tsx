"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { NavbarTabsProvider } from "@/components/navbar-tabs-context";
import type { AuthState } from "@/lib/queries/use-auth";

interface ProvidersProps {
  children: React.ReactNode;
  initialAuthState: AuthState;
}

export default function Providers({ 
  children, 
  initialAuthState
}: ProvidersProps) {
  const [queryClient] = useState(
    () => {
      const client = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      });

      // Pre-populate React Query cache with server auth state
      client.setQueryData(['auth'], initialAuthState);

      return client;
    }
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NavbarTabsProvider>
        {children}
      </NavbarTabsProvider>
    </QueryClientProvider>
  );
}
