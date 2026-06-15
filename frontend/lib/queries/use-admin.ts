import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchToolTickets, 
  fetchToolTicket, 
  resolveTicketWithExisting, 
  resolveTicketWithNew, 
  rejectTicket,
  searchTools,
  getCategories
} from "../admin";

// Query hooks
export function useToolTickets(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["admin", "tool-tickets", params],
    queryFn: () => fetchToolTickets(params),
    staleTime: 30 * 1000, // 30 seconds
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('Authentication required') || error.message.includes('401')) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

export function useToolTicket(id: string) {
  return useQuery({
    queryKey: ["admin", "tool-ticket", id],
    queryFn: () => fetchToolTicket(id),
    enabled: !!id,
    staleTime: 30 * 1000, // 30 seconds
    retry: (failureCount, error) => {
      if (error.message.includes('Authentication required') || error.message.includes('401')) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

export function useSearchTools(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ["admin", "search-tools", query, limit],
    queryFn: () => searchTools(query, limit),
    enabled: !!query.trim(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["admin", "categories"],
    queryFn: getCategories,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Mutation hooks
export function useResolveTicketWithExisting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, toolId }: { ticketId: string; toolId: string }) =>
      resolveTicketWithExisting(ticketId, toolId),
    onSuccess: (data, variables) => {
      // Invalidate and refetch tool tickets
      queryClient.invalidateQueries({ queryKey: ["admin", "tool-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tool-ticket", variables.ticketId] });
    },
  });
}

export function useResolveTicketWithNew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, toolData }: { 
      ticketId: string; 
      toolData: {
        name: string;
        description: string;
        logo_url: string;
        categories: number[];
      }
    }) => resolveTicketWithNew(ticketId, toolData),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tool-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tool-ticket", variables.ticketId] });
    },
  });
}

export function useRejectTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => rejectTicket(ticketId),
    onSuccess: (data, ticketId) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tool-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tool-ticket", ticketId] });
    },
  });
}

// Admin stats derived from tool tickets
export function useAdminStats() {
  const { data: ticketsResponse } = useToolTickets({ limit: 1000 });
  
  if (!ticketsResponse) {
    return {
      data: {
        totalTickets: 0,
        pendingTickets: 0,
        resolvedTickets: 0,
        rejectedTickets: 0,
      },
      isLoading: true,
    };
  }

  const stats = {
    totalTickets: ticketsResponse.total_count,
    pendingTickets: 0,
    resolvedTickets: 0,
    rejectedTickets: 0,
  };

  ticketsResponse.tickets.forEach(ticket => {
    switch (ticket.status) {
      case 'pending':
        stats.pendingTickets++;
        break;
      case 'resolved':
        stats.resolvedTickets++;
        break;
      case 'rejected':
        stats.rejectedTickets++;
        break;
    }
  });

  return {
    data: stats,
    isLoading: false,
  };
}