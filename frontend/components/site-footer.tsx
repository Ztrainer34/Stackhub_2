import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-6 max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} StackHub. All rights reserved.</span>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/cookies" className="hover:text-foreground transition-colors">
            Cookie Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
