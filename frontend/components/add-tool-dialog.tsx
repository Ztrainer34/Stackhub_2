"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SuggestedToolForm,
  SuggestedToolFormData,
} from "@/components/suggested-tool-form";
import { suggestTool } from "@/lib/tool";
import { createClient } from "@/utils/supabase/client";

type View = "form" | "confirmation";

export function AddToolDialog() {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("form");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setView("form"), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = async (data: SuggestedToolFormData) => {
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      await suggestTool(supabase, {
        name: data.name,
        description: data.description,
        website: data.website,
        categories: data.categories,
      });
      setView("confirmation");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit tool");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    setOpen(false);
    // Refresh the /tools listing so a newly-approved tool would show up.
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add tool
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        {view === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add tool</DialogTitle>
              <DialogDescription className="text-sm space-y-2 pt-1">
                <span className="block">
                  Couldn&apos;t find a tool and want to add it? Amazing! Thank
                  you for your contribution 🙏
                </span>
                <span className="block">
                  Other users will rely on the information you fill in. So
                  please double check its accuracy 🔍
                </span>
              </DialogDescription>
            </DialogHeader>

            <SuggestedToolForm
              onSubmit={handleSubmit}
              onCancel={() => setOpen(false)}
              submitLabel={isSubmitting ? "Submitting..." : "Add tool"}
            />
          </>
        ) : (
          <div className="p-2 text-center">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-center">
                Thank you for adding a new tool!
              </DialogTitle>
              <DialogDescription className="text-sm pt-3 text-center">
                Once we&apos;ve reviewed the information, we&apos;ll add your
                tool to StackHub and notify you.
              </DialogDescription>
            </DialogHeader>

            <Button
              type="button"
              onClick={handleDone}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
