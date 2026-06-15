import type { SupabaseClient } from '@supabase/supabase-js';

export const fetchApi = async (
  endpoint: string,
  init?: RequestInit | undefined
): Promise<Response> =>
  fetch(`${process.env.NEXT_PUBLIC_API_URL!}${endpoint}`, init);

export const fetchApiAuthenticated = async (
  supabaseClient: SupabaseClient,
  endpoint: string,
  init?: RequestInit | undefined
): Promise<Response> => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  const headers: HeadersInit = {
    ...init?.headers,
  };

  if (session?.access_token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
  }

  return fetch(`${process.env.NEXT_PUBLIC_API_URL!}${endpoint}`, {
    ...init,
    headers,
  });
};