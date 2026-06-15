"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { fetchApiAuthenticated } from "@/lib/api";

async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  if (!username || username.length < 3) {
    throw new Error("Username must be at least 3 characters");
  }

  const supabase = createClient();
  
  // Backend will validate the JWT token
  const response = await fetchApiAuthenticated(
    supabase,
    `/profile/username/available?username=${encodeURIComponent(username)}`
  );

  if (response.status === 401) {
    throw new Error("Authentication expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error("Failed to check username availability");
  }

  return response.json();
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useUsernameValidation() {
  const [username, setUsername] = useState('');
  const debouncedUsername = useDebounce(username, 500);

  const validation = useQuery({
    queryKey: ['username-available', debouncedUsername],
    queryFn: () => checkUsernameAvailability(debouncedUsername),
    enabled: debouncedUsername.length >= 3,
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes('Authentication required')) {
        return false;
      }
      return failureCount < 2;
    }
  });

  const isValid = validation.data?.available === true;
  const isInvalid = validation.data?.available === false;
  const isChecking = validation.isFetching && debouncedUsername.length >= 3;
  const showError = validation.error && debouncedUsername.length >= 3;

  const getValidationMessage = () => {
    if (isChecking) return "Checking...";
    if (isValid) return "✅ Available";
    if (isInvalid) return "❌ Not available";
    if (showError) return `❌ ${validation.error?.message}`;
    if (username.length > 0 && username.length < 3) return "Username must be at least 3 characters";
    return "";
  };

  const getValidationStatus = () => {
    if (isChecking) return "checking";
    if (isValid) return "valid";
    if (isInvalid || showError) return "invalid";
    if (username.length > 0 && username.length < 3) return "invalid";
    return "neutral";
  };

  return {
    username,
    setUsername,
    isValid: isValid && username.length >= 3,
    isChecking,
    message: getValidationMessage(),
    status: getValidationStatus(),
    error: validation.error,
  };
}