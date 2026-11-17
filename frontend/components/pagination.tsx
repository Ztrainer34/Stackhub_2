import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount?: number;
  /** Click handler. Ignored for a page that has a `pageHref`. */
  onPageChange?: (page: number) => void;
  /**
   * When given, Previous/Next are real `<a href>` links, so crawlers can walk
   * the pages. Prefer it on public listing pages.
   */
  pageHref?: (page: number) => string;
  showPageInfo?: boolean;
  itemName?: string; // e.g., "tools", "posts", "results"
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
  pageHref,
  showPageInfo = true,
  itemName = "items"
}: PaginationProps) {
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between mt-6">
      {showPageInfo && (
        <div className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
          {totalCount && ` (${totalCount} total ${itemName})`}
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <PageButton
          page={currentPage - 1}
          enabled={hasPrevPage}
          pageHref={pageHref}
          onPageChange={onPageChange}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </PageButton>

        <span className="text-sm text-muted-foreground px-2">
          {currentPage} / {totalPages}
        </span>

        <PageButton
          page={currentPage + 1}
          enabled={hasNextPage}
          pageHref={pageHref}
          onPageChange={onPageChange}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  page,
  enabled,
  pageHref,
  onPageChange,
  children,
}: {
  page: number;
  enabled: boolean;
  pageHref?: (page: number) => string;
  onPageChange?: (page: number) => void;
  children: React.ReactNode;
}) {
  if (enabled && pageHref) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={pageHref(page)}>
          {children}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onPageChange?.(page)}
      disabled={!enabled}
    >
      {children}
    </Button>
  );
}
