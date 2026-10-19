import { QueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "./runtime-config";

type ApiRequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface GetQueryFnOptions {
  on401?: "throw" | "returnNull";
}

export const apiRequest = async (
  method: ApiRequestMethod,
  url: string,
  body?: any,
  customHeaders?: Record<string, string>
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  const options: RequestInit = {
    method,
    headers,
    credentials: "include",
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  return fetch(buildApiUrl(url), options);
};

export const getQueryFn = (options: GetQueryFnOptions = {}) => {
  return async ({ queryKey }: { queryKey: unknown[] }) => {
    const url = queryKey[0] as string;
    
    try {
      const res = await fetch(buildApiUrl(url), {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401 && options.on401 === "returnNull") {
          return null;
        }
        
        if (res.status >= 500) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }

        throw new Error(`${res.status}: ${await res.text()}`);
      }

      return res.json();
    } catch (error) {
      if (error instanceof Error && error.message.includes("401") && options.on401 === "returnNull") {
        return null;
      }
      throw error;
    }
  };
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(buildApiUrl(queryKey[0] as string), {
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status >= 500) {
            throw new Error(`${res.status}: ${res.statusText}`);
          }

          throw new Error(`${res.status}: ${await res.text()}`);
        }

        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30000, // 30 seconds instead of Infinity
      retry: 1,
      keepPreviousData: true, // Keep previous data while fetching new data
    },
    mutations: {
      retry: false,
    }
  },
});
