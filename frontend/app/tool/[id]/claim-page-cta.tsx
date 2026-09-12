"use client";

import { BadgeCheck, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tool } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";
import { claimFormUrl } from "@/lib/tool-claim";

/**
 * "Claim this page" — the route for someone at the vendor to take the page
 * over. It disappears once the page has an owner, and owners see a confirmation
 * that they hold the edit rights instead.
 */
export function ClaimPageCta({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  if (current.is_owner) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 pt-6">
          <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You manage this page. Use the pencils to update the logo,
            description, vendor details and categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Already claimed by somebody else, or there is no form to send people to.
  const href = claimFormUrl(current);
  if (current.is_claimed || !href) return null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Button asChild className="w-full">
          <a href={href} target="_blank" rel="noopener noreferrer">
            Claim this page
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        </Button>
        <p className="text-sm text-muted-foreground">
          Work at {current.name}? Take over this page to adapt the content and
          logo.
        </p>
      </CardContent>
    </Card>
  );
}
