import { ReactNode, createContext, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Types based on our db schema
interface User {
  id: number;
  username: string;
  email: string;
  vendorId?: number;
  vendorName?: string; // Added for store name display
  role: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

interface LoginData {
  username: string;
  password: string;
}

interface RegisterData extends LoginData {
  email: string;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
  deleteAccountMutation: UseMutationResult<void, Error, void>;
  refreshUser: () => Promise<User | null>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user");
      console.log("Auth response status:", res.status);

      if (res.status === 401) return null;
      if (!res.ok) {
        throw new Error("We couldn't process your request. Please try again or contact support if the issue continues.");
      }

      const userData = await res.json();
      console.log("User data:", userData);
      return userData;
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        throw new Error("Login failed");
      }
      return await res.json();
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/user"], user);
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (newUser: RegisterData) => {
      console.log("Registering new user:", { ...newUser, password: "[REDACTED]" });
      const res = await apiRequest("POST", "/api/register", newUser);
      
      if (!res.ok) {
        let errorMessage = "Registration failed";
        
        try {
          const errorData = await res.json();
          console.error("Registration error response:", errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error("Could not parse error response:", e);
        }
        
        throw new Error(errorMessage);
      }
      
      const userData = await res.json();
      console.log("Registration successful:", userData);
      return userData;
    },
    onSuccess: (user: User) => {
      console.log("Setting user data after registration:", user);
      queryClient.setQueryData(["/api/user"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      console.error("Registration mutation error:", error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/logout");
      if (!res.ok) {
        throw new Error("Logout failed");
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      // Invalidate all queries to refetch with new authentication state
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!user || typeof user !== 'object' || !('id' in user)) {
        throw new Error("No user logged in");
      }
      
      // Now TypeScript knows user has an id property
      const res = await apiRequest("DELETE", `/api/users/${user.id}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to delete account");
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      // Invalidate all queries to refetch with new authentication state
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add function to refresh user data
  const refreshUser = async (): Promise<User | null> => {
    try {
      const response = await apiRequest("GET", "/api/user");
      
      if (response.status === 401) {
        queryClient.setQueryData(["/api/user"], null);
        return null;
      }
      
      if (!response.ok) {
        throw new Error("Failed to refresh user data");
      }
      
      const userData = await response.json();
      queryClient.setQueryData(["/api/user"], userData);
      return userData;
    } catch (error) {
      console.error("Error refreshing user data:", error);
      return user ?? null; // Return current user data if refresh fails
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        deleteAccountMutation,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
