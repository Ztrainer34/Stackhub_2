"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";

import { HOME_ROUTES, SHOW_RANKING_LINKS, SHOW_STACKS_LINKS } from "@/lib/home/config";

const LINKS = [
  { href: HOME_ROUTES.tools, label: "Tools" },
  ...(SHOW_RANKING_LINKS ? [{ href: HOME_ROUTES.rankings, label: "Rankings" }] : []),
  { href: HOME_ROUTES.playbooks, label: "PB" },
  ...(SHOW_STACKS_LINKS ? [{ href: HOME_ROUTES.stacks, label: "Stacks" }] : []),
];

/**
 * Plain GET to /search, works without JS. Without t=post the search page sends
 * the visitor back to the homepage.
 */
function SearchField({ id, className, autoFocus }: { id: string; className?: string; autoFocus?: boolean }) {
  return (
    <form role="search" action={HOME_ROUTES.search} method="get" className={className}>
      <label htmlFor={id} className="sr-only">
        Search StackHub
      </label>
      <input type="hidden" name="t" value="post" />
      <div className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          name="q"
          type="search"
          required
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Search tools, users, posts"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </form>
  );
}

/**
 * Header content for LOGGED-OUT visitors, on every page:
 * Tools | Rankings | PB | Stacks .......... [search] Log in | Add your stack
 * Below `md` (768px) the links and Log in move into a menu button. Below `lg`
 * (1024px) the search field becomes an icon that opens it under the header.
 *
 * Rendered by the header's logged-out branch next to the StackHub wordmark. The
 * header container must be `relative`, so the mobile menu drops down under it.
 * Signed-in users keep the header with search, +, bell and avatar.
 */
export function PublicNav() {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const pathname = usePathname();
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);

  // Close the menu after navigation.
  useEffect(() => {
    setOpen(false);
    setSearching(false);
  }, [pathname]);

  // Escape closes the menu or the search and hands the focus back to its button.
  useEffect(() => {
    if (!open && !searching) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      setSearching(false);
      (open ? menuButton : searchButton).current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, searching]);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-foreground">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <SearchField id="nav-search" className="hidden w-64 lg:block xl:w-72" />
        <button
          ref={searchButton}
          type="button"
          onClick={() => {
            setOpen(false);
            setSearching((v) => !v);
          }}
          aria-expanded={searching}
          aria-controls="public-search"
          aria-label="Search"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background lg:hidden"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
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
          onClick={() => {
            setSearching(false);
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border bg-background md:hidden"
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {searching && (
        <div id="public-search" className="absolute inset-x-0 top-full z-50 border-b bg-background p-4 shadow-sm lg:hidden">
          <SearchField id="nav-search-small" autoFocus />
        </div>
      )}

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
