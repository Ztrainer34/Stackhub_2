"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  ExternalLink,
  Globe,
  Linkedin,
  MapPin,
  Twitter,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tool, ToolVendorInput } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";
import { useUpdateToolPage } from "@/lib/queries/use-tool-page";
import { EditButton } from "./edit-button";

/** The card is one form, so an emptied field is saved as empty on purpose. */
function toForm(tool: Tool): ToolVendorInput {
  return {
    website: tool.vendor?.website ?? "",
    x_profile: tool.vendor?.x_profile ?? "",
    linkedin_profile: tool.vendor?.linkedin_profile ?? "",
    head_office: tool.vendor?.head_office ?? "",
    year_of_foundation: tool.vendor?.year_of_foundation ?? null,
  };
}

export function ToolPageVendor({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ToolVendorInput>(() => toForm(current));
  const save = useUpdateToolPage(tool.id);

  const openDialog = () => {
    setForm(toForm(current));
    setOpen(true);
  };

  const set = (field: keyof ToolVendorInput, value: string) =>
    setForm((previous) => ({
      ...previous,
      [field]:
        field === "year_of_foundation"
          ? value.trim() === ""
            ? null
            : Number(value)
          : value,
    }));

  const submit = () => {
    const year = form.year_of_foundation;
    if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2100)) {
      toast.error("Enter the founding year as four digits, e.g. 2012.");
      return;
    }
    save.mutate({ vendor: form }, { onSuccess: () => setOpen(false) });
  };

  const vendor = current.vendor;
  const isEmpty =
    !vendor?.head_office &&
    !vendor?.year_of_foundation &&
    !vendor?.linkedin_profile &&
    !vendor?.x_profile &&
    !vendor?.website;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Vendor information</CardTitle>
        {current.is_owner && (
          <EditButton label="Edit vendor information" onClick={openDialog} />
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          {vendor?.head_office && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{vendor.head_office}</span>
            </div>
          )}

          {vendor?.year_of_foundation && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Founded in {vendor.year_of_foundation}</span>
            </div>
          )}

          {vendor?.linkedin_profile && (
            <div className="flex items-center gap-2">
              <Linkedin className="w-4 h-4 text-muted-foreground" />
              <a
                href={vendor.linkedin_profile}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                LinkedIn profile
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {vendor?.x_profile && (
            <div className="flex items-center gap-2">
              <Twitter className="w-4 h-4 text-muted-foreground" />
              <a
                href={`https://twitter.com/${vendor.x_profile.replace("@", "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                {vendor.x_profile}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {vendor?.website && (
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <a
                href={vendor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Website
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {isEmpty && (
            <p className="text-sm text-muted-foreground">
              {current.is_owner
                ? "Nothing here yet — use the pencil to add your company details."
                : "No vendor details yet."}
            </p>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vendor information</DialogTitle>
            <DialogDescription>
              Leave a field empty to remove it from the page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vendor-website">Website</Label>
              <Input
                id="vendor-website"
                value={form.website}
                onChange={(event) => set("website", event.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-hq">Head office</Label>
              <Input
                id="vendor-hq"
                value={form.head_office}
                onChange={(event) => set("head_office", event.target.value)}
                placeholder="Paris"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-year">Founded in</Label>
              <Input
                id="vendor-year"
                type="number"
                inputMode="numeric"
                value={form.year_of_foundation ?? ""}
                onChange={(event) => set("year_of_foundation", event.target.value)}
                placeholder="2012"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-linkedin">LinkedIn profile</Label>
              <Input
                id="vendor-linkedin"
                value={form.linkedin_profile}
                onChange={(event) => set("linkedin_profile", event.target.value)}
                placeholder="https://www.linkedin.com/company/…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-x">X handle</Label>
              <Input
                id="vendor-x"
                value={form.x_profile}
                onChange={(event) => set("x_profile", event.target.value)}
                placeholder="@example"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
