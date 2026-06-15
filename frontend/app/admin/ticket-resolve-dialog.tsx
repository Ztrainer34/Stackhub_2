"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TicketResolveForm, type ToolTicket } from "./ticket-resolve-form";

interface TicketResolveDialogProps {
  ticket: ToolTicket;
}

export function TicketResolveDialog({ ticket }: TicketResolveDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve Ticket</DialogTitle>
          <DialogDescription>
            Choose how to resolve this tool request ticket.
          </DialogDescription>
        </DialogHeader>
        <TicketResolveForm
          ticket={ticket}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
