import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Route, Redirect } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user, isLoading, error } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (error && !user) {
    return (
      <Route path={path}>
        <div className="flex min-h-screen items-center justify-center p-6">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>We couldn't process your request.</AlertTitle>
            <AlertDescription>
              Please try again or contact support if the issue continues.
            </AlertDescription>
          </Alert>
        </div>
      </Route>
    );
  }

  return (
    <Route path={path}>
      {user ? (
        user.role === "cashier" && path !== "/cashier" ? (
          <Redirect to="/cashier" />
        ) : (
          <Component />
        )
      ) : <Redirect to="/" />}
    </Route>
  );
}
