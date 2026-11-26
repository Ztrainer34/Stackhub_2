import Link from "next/link";
import { cn } from "@/lib/utils";
import { PublicNav } from "./public-nav";

/** The four squares of the StackHub mark. */
function BrandMark() {
  return (
    <span aria-hidden="true" className="grid grid-cols-[10px_10px] gap-[3px]">
      {[false, true, true, false].map((blue, i) => (
        <i key={i} className={cn("h-2.5 w-2.5 rounded-[3px]", blue ? "bg-brand" : "bg-foreground")} />
      ))}
    </span>
  );
}

/** The header logged-out visitors see on every page. Sticks to the top. */
export function PublicHeader() {
  return (
    // relative to the sticky header: the mobile menu drops down under it.
    <header className="public-theme sticky top-0 z-40 w-full border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1280px] items-center gap-3 px-4 min-[641px]:min-h-[72px] min-[641px]:gap-7 min-[901px]:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-heading text-xl font-bold leading-none tracking-[-0.02em]"
        >
          <BrandMark />
          StackHub
        </Link>
        <PublicNav />
      </div>
    </header>
  );
}
