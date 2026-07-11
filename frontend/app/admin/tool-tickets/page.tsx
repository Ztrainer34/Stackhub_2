"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { Eye, Clock, CheckCircle, XCircle, ExternalLink, AlertCircle } from "lucide-react";
import { useToolTickets } from "@/lib/queries/use-admin";
import { useRouter, useSearchParams } from "next/navigation";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
    case "resolved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="mr-1 h-3 w-3" />Resolved</Badge>;
    case "rejected":
      return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ToolTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const status = searchParams.get('status') || undefined;
  const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;

  const { data, isLoading, error } = useToolTickets({ status, page, limit });

  const handleStatusChange = (newStatus: string) => {
    const params = new URLSearchParams(searchParams);
    if (newStatus === 'all') {
      params.delete('status');
    } else {
      params.set('status', newStatus);
    }
    params.delete('page'); // Reset to first page
    router.push(`/admin/tool-tickets?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tool Tickets</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tool Tickets</h1>
            <p className="text-muted-foreground">Manage tool requests from users</p>
          </div>
        </div>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error.message.includes('Authentication') 
              ? 'You need to be logged in to access admin features.'
              : `Error loading tool tickets: ${error.message}`
            }
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tool Tickets</h1>
          <p className="text-muted-foreground">
            Manage tool requests from users
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search tickets..."
                className="max-w-sm"
                // TODO: Add search functionality
              />
            </div>
            <Select value={status || "all"} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <div className="space-y-4">
        {data?.tickets.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">No tool tickets found.</p>
                {status && (
                  <p className="text-xs mt-1">Try changing the status filter or create some test data.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          data?.tickets.map((ticket) => (
          <Card key={ticket.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{ticket.tool_name}</h3>
                    {getStatusBadge(ticket.status)}
                  </div>
                  
                  <p className="text-muted-foreground text-sm">
                    {ticket.tool_description}
                  </p>
                  
                  {ticket.tool_website && (
                    <div className="flex items-center gap-2 text-sm">
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
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    {ticket.categories.map((category) => (
                      <Badge key={category.id} variant="outline" className="text-xs">
                        {category.name}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground">
                    <span>Requested by <strong>{ticket.requester_username}</strong></span>
                    <span className="hidden sm:inline">•</span>
                    {ticket.post_slug ? (
                      <span>for post: <Link href={`/${ticket.requester_username}/${ticket.post_slug}`} className="text-blue-600 hover:underline">{ticket.post_name}</Link></span>
                    ) : (
                      <span>standalone suggestion</span>
                    )}
                    <span className="hidden sm:inline">•</span>
                    <span>{formatDate(ticket.created_at)}</span>
                    {ticket.resolved_at && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span>Resolved: {formatDate(ticket.resolved_at)}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="ml-4">
                  <Link href={`/admin/tool-tickets/${ticket.id}`}>
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {data.tickets.length} of {data.total_count} tickets
              </p>
              <div className="flex gap-2">
                {/* TODO: Add pagination controls */}
                <Button variant="outline" size="sm" disabled={data.page === 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={data.page === data.total_pages}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}