"use client";

import { useState } from "react";
import ContentReader from "./ContentReader";
import { Button } from "@/components/ui/button";
import { FileText, Eye } from "lucide-react";

interface ContentViewerProps {
  publishedContent: string | null;
  draftContent: string | null;
  isOwned: boolean;
  isPublished: boolean;
  lastPublishedAt?: string;
  lastDraftUpdateAt?: string;
}

export default function ContentViewer({
  publishedContent,
  draftContent,
  isOwned,
  isPublished,
  lastPublishedAt,
  lastDraftUpdateAt,
}: ContentViewerProps) {
  const [showDraft, setShowDraft] = useState(false);

  // Format the last published date
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Only show toggle if:
  // 1. User owns the post
  // 2. Post is published (so there's both published and draft versions)
  // 3. There is draft content
  const canToggle = isOwned && isPublished && draftContent;

  // Show draft indicator if viewing a draft (unpublished post)
  const showDraftIndicator = isOwned && !isPublished;

  // Determine which content to show:
  // - If unpublished (draft only), show draft content
  // - If published and user toggled to draft view, show draft content
  // - Otherwise show published content
  const currentContent = !isPublished ? draftContent : (showDraft ? draftContent : publishedContent);

  return (
    <div className="space-y-4">
      {canToggle && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
          <div className="flex-1 flex items-center gap-2">
            {showDraft ? (
              <>
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Viewing draft version{lastDraftUpdateAt && ` (last updated ${formatDate(lastDraftUpdateAt)})`}
                </span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Viewing published version{lastPublishedAt && ` (last published ${formatDate(lastPublishedAt)})`}
                </span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDraft(!showDraft)}
          >
            {showDraft ? "View Published" : "View Draft"}
          </Button>
        </div>
      )}

      {showDraftIndicator && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Viewing draft version{lastDraftUpdateAt && ` (last updated ${formatDate(lastDraftUpdateAt)})`}
          </span>
        </div>
      )}

      <div className="leading-8">
        <ContentReader initialContent={currentContent} />
      </div>
    </div>
  );
}
