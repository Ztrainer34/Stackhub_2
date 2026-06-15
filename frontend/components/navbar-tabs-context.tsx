"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface NavbarTabsContextType {
  tabsContent: ReactNode | null;
  setTabsContent: (content: ReactNode | null) => void;
}

const NavbarTabsContext = createContext<NavbarTabsContextType | undefined>(undefined);

export function NavbarTabsProvider({ children }: { children: ReactNode }) {
  const [tabsContent, setTabsContent] = useState<ReactNode | null>(null);

  return (
    <NavbarTabsContext.Provider value={{ tabsContent, setTabsContent }}>
      {children}
    </NavbarTabsContext.Provider>
  );
}

export function useNavbarTabs() {
  const context = useContext(NavbarTabsContext);
  if (context === undefined) {
    throw new Error("useNavbarTabs must be used within a NavbarTabsProvider");
  }
  return context;
}