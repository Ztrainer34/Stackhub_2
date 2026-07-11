"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { ArrowLeft, ExternalLink, User, Calendar, FileText, AlertCircle } from "lucide-react";
import { TicketActions } from "./ticket-actions";
import { useToolTicket } from "@/lib/queries/use-admin";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>;
    case "resolved":
      return <Badge className="bg-green-100 text-green-800">Resolved</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ToolTicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ToolTicketDetailPage({ params }: ToolTicketDetailPageProps) {
  const [id, setId] = useState<string>("");
  
  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);
  
  const { data: ticket, isLoading, error } = useToolTicket(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/tool-tickets">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Tickets
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/tool-tickets">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Tickets
            </Button>
          </Link>
        </div>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message.includes('Authentication') 
              ? 'You need to be logged in to access admin features.'
              : `Error loading tool ticket: ${error?.message || 'Ticket not found'}`
            }
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/tool-tickets">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tickets
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{ticket.tool_name}</h1>
          <p className="text-muted-foreground">Tool Request #{ticket.id}</p>
        </div>
        {getStatusBadge(ticket.status)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tool Details */}
          <Card>
            <CardHeader>
              <CardTitle>Tool Information</CardTitle>
              <CardDescription>Details provided by the requester</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Name</h3>
                <p>{ticket.tool_name}</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {ticket.tool_description}
                </p>
              </div>
              
              {ticket.tool_website && (
                <div>
                  <h3 className="font-semibold mb-2">Website</h3>
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <a 
                      href={ticket.tool_website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {ticket.tool_website}
                    </a>
                  </div>
                </div>
              )}
              
              <div>
                <h3 className="font-semibold mb-2">Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {ticket.categories.map((category) => (
                    <Badge key={category.id} variant="outline">
                      {category.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {ticket.status === "pending" && (
            <TicketActions ticket={ticket} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Request Info */}
          <Card>
            <CardHeader>
              <CardTitle>Request Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Requested by</p>
                  <Link 
                    href={`/${ticket.requester_username}`}
                    className="text-blue-600 hover:underline"
                  >
                    {ticket.requester_username}
                  </Link>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(ticket.created_at)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Associated Post</p>
                  {ticket.post_slug ? (
                    <Link
                      href={`/${ticket.requester_username}/${ticket.post_slug}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {ticket.post_name}
                    </Link>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Standalone suggestion (no post)
                    </p>
                  )}
                </div>
              </div>

              {ticket.resolved_at && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Resolved</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(ticket.resolved_at)}
                      </p>
                      {ticket.resolver_username && (
                        <p className="text-sm text-muted-foreground">
                          by {ticket.resolver_username}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Post Preview */}
          {ticket.post_slug && (
            <Card>
              <CardHeader>
                <CardTitle>Related Post</CardTitle>
                <CardDescription>The post this tool was requested for</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/${ticket.requester_username}/${ticket.post_slug}`}
                  className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <h4 className="font-semibold text-sm">{ticket.post_name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    by {ticket.requester_username}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-blue-600">
                    <ExternalLink className="h-3 w-3" />
                    View Post
                  </div>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}