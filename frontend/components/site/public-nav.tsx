"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { HOME_ROUTES, SHOW_RANKING_LINKS, SHOW_STACKS_LINKS } from "@/lib/home/config";

const LINKS = [
  { href: HOME_ROUTES.tools, label: "Tools" },
  ...(SHOW_RANKING_LINKS ? [{ href: HOME_ROUTES.rankings, label: "Rankings" }] : []),
  { href: HOME_ROUTES.playbooks, label: "PB" },
  ...(SHOW_STACKS_LINKS ? [{ href: HOME_ROUTES.stacks, label: "Stacks" }] : []),
];

/**
 * Header content for LOGGED-OUT visitors, on every page:
 * Tools | Rankings | PB | Stacks .......... Log in | Add your stack
 * Below `md` (768px) the links and Log in move into a menu button.
 *
 * Rendered by the header's logged-out branch next to the StackHub wordmark. The
 * header container must be `relative`, so the mobile menu drops down under it.
 * Signed-in users keep the header with search, +, bell and avatar.
 */
export function PublicNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuButton = useRef<HTMLButtonElement>(null);

  // Close the menu after navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the menu and hands the focus back to its button.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-foreground">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <Link href={HOME_ROUTES.login} className="hidden px-1 py-2 text-sm font-medium md:inline">
          Log in
        </Link>
        <Link
          href={HOME_ROUTES.addStack}
          className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Add your stack
        </Link>
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border bg-background md:hidden"
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <nav
          id="public-mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-full z-50 border-b bg-background px-4 pb-4 shadow-sm md:hidden"
        >
          {[...LINKS, { href: HOME_ROUTES.login, label: "Log in" }].map((l) => (
            <Link key={l.label} href={l.href} className="block border-b py-3 font-medium last:border-b-0">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
