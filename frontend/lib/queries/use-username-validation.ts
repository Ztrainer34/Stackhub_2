"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { fetchApiAuthenticated } from "@/lib/api";
import { normalizeUsername, usernameProblem } from "@/lib/username";

async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  const problem = usernameProblem(username);
  if (problem) throw new Error(problem);

  const supabase = createClient();
  
  // Backend will validate the JWT token
  const response = await fetchApiAuthenticated(
    supabase,
    `/profile/username/available?username=${encodeURIComponent(normalizeUsername(username))}`
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
    // Only ask the server about a username that could exist; the format
    // problem itself is shown without a round trip.
    enabled: usernameProblem(debouncedUsername) === null,
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
  // Shown as soon as the field is non-empty, so a bad character is flagged
  // while typing rather than after the debounce and a server round trip.
  const formatProblem = username.length > 0 ? usernameProblem(username) : null;
  const isChecking = validation.isFetching && !formatProblem;
  const showError = validation.error && !formatProblem;

  const getValidationMessage = () => {
    if (formatProblem) return `❌ ${formatProblem}`;
    if (isChecking) return "Checking...";
    if (isValid) return "✅ Available";
    if (isInvalid) return "❌ Not available";
    if (showError) return `❌ ${validation.error?.message}`;
    return "";
  };

  const getValidationStatus = () => {
    if (formatProblem) return "invalid";
    if (isChecking) return "checking";
    if (isValid) return "valid";
    if (isInvalid || showError) return "invalid";
    return "neutral";
  };

  return {
    username,
    setUsername,
    isValid: isValid && !formatProblem,
    isChecking,
    message: getValidationMessage(),
    status: getValidationStatus(),
    error: validation.error,
  };
}