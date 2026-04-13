import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1
    }
  }
});
