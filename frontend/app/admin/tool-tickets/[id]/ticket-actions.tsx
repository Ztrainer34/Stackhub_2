"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { TicketResolveForm, type ToolTicket } from "../../ticket-resolve-form";

interface TicketActionsProps {
  ticket: ToolTicket;
}

export function TicketActions({ ticket }: TicketActionsProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolution Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <TicketResolveForm
          ticket={ticket}
          onSuccess={() => router.push("/admin/tool-tickets")}
        />
      </CardContent>
    </Card>
  );
}
