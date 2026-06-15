import { fetchApiAuthenticated } from './api';
import { createClient } from '@/utils/supabase/client';

export interface ToolTicket {
  id: string;
  tool_name: string;
  tool_description: string;
  tool_website: string;
  status: "pending" | "resolved" | "rejected";
  post_id: string;
  post_name: string;
  post_slug: string;
  requested_by: string;
  requester_username: string;
  resolved_by?: string;
  resolver_username?: string;
  resolved_tool_id?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  categories: Array<{ id: number; name: string }>;
}

export interface ToolTicketsResponse {
  tickets: ToolTicket[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
}

export interface AdminStats {
  totalTickets: number;
  pendingTickets: number;
  resolvedTickets: number;
  rejectedTickets: number;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  logo_url: string;
  categories: Array<{ id: number; name: string }>;
}

// Fetch tool tickets with pagination and filtering
export async function fetchToolTickets(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<ToolTicketsResponse> {
  const supabase = createClient();
  
  const searchParams = new URLSearchParams();
  if (params?.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }
  if (params?.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params?.limit) {
    searchParams.set('limit', params.limit.toString());
  }

  const endpoint = `/admin/tool-tickets${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  
  try {
    const response = await fetchApiAuthenticated(supabase, endpoint);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error ${response.status}:`, errorText);
      throw new Error(`Failed to fetch tool tickets: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching tool tickets:', error);
    throw error;
  }
}

// Fetch a single tool ticket
export async function fetchToolTicket(id: string): Promise<ToolTicket> {
  const supabase = createClient();
  
  const response = await fetchApiAuthenticated(supabase, `/admin/tool-tickets/${id}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch tool ticket: ${response.statusText}`);
  }
  
  return response.json();
}

// Resolve ticket with existing tool
export async function resolveTicketWithExisting(ticketId: string, toolId: string): Promise<void> {
  const supabase = createClient();
  
  const response = await fetchApiAuthenticated(supabase, `/admin/tool-tickets/${ticketId}/resolve-existing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool_id: toolId }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to resolve ticket: ${response.statusText}`);
  }
}

// Resolve ticket by creating new tool
export async function resolveTicketWithNew(ticketId: string, toolData: {
  name: string;
  description: string;
  logo_url: string;
  categories: number[];
}): Promise<Tool> {
  const supabase = createClient();
  
  const response = await fetchApiAuthenticated(supabase, `/admin/tool-tickets/${ticketId}/resolve-new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toolData),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create tool and resolve ticket: ${response.statusText}`);
  }
  
  return response.json();
}

// Reject a tool ticket
export async function rejectTicket(ticketId: string): Promise<void> {
  const supabase = createClient();
  
  const response = await fetchApiAuthenticated(supabase, `/admin/tool-tickets/${ticketId}/reject`, {
    method: 'POST',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to reject ticket: ${response.statusText}`);
  }
}

// Search for existing tools
export async function searchTools(query: string, limit: number = 10): Promise<Tool[]> {
  const supabase = createClient();
  
  const searchParams = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });
  
  const response = await fetchApiAuthenticated(supabase, `/tool/autocomplete?${searchParams.toString()}`);
  
  if (!response.ok) {
    throw new Error(`Failed to search tools: ${response.statusText}`);
  }
  
  const results = await response.json();
  
  // Transform the autocomplete results to match our Tool interface
  return results.map((result: { id: string; name: string; description?: string; logo_url?: string }) => ({
    id: result.id,
    name: result.name,
    description: result.description || '',
    logo_url: result.logo_url || '',
    categories: [], // Autocomplete doesn't include categories, would need separate API call
  }));
}

// Get admin dashboard stats
export async function getAdminStats(): Promise<AdminStats> {
  try {
    // Since we don't have a dedicated stats endpoint, we'll fetch all tickets and calculate stats
    const allTickets = await fetchToolTickets({ limit: 1000 }); // Get a large number to cover all tickets
    
    const stats = {
      totalTickets: allTickets.total_count,
      pendingTickets: 0,
      resolvedTickets: 0,
      rejectedTickets: 0,
    };
    
    // Count by status
    allTickets.tickets.forEach(ticket => {
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
    
    return stats;
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    // Return fallback stats if API fails
    return {
      totalTickets: 0,
      pendingTickets: 0,
      resolvedTickets: 0,
      rejectedTickets: 0,
    };
  }
}

// Get categories for creating new tools
export async function getCategories(): Promise<Array<{ id: number; name: string }>> {
  const supabase = createClient();
  
  try {
    // Use the existing homepage endpoint which includes categories
    const response = await fetchApiAuthenticated(supabase, '/homepage/top-categories?limit=100');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }
    
    const categories = await response.json();
    
    // Transform the response to match our expected format
    return categories.map((cat: { id: number; name: string }) => ({
      id: cat.id,
      name: cat.name
    }));
  } catch (error) {
    // Fallback to some common categories if the API fails
    console.warn('Failed to fetch categories, using fallback:', error);
    return [
      { id: 1, name: "Analytics" },
      { id: 2, name: "Marketing" },
      { id: 3, name: "SaaS" },
      { id: 4, name: "CRM" },
      { id: 5, name: "Email Marketing" },
      { id: 6, name: "Design" },
      { id: 7, name: "Development" },
      { id: 8, name: "Communication" },
    ];
  }
}