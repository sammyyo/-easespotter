import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { Badge } from "@/components/ui/badge";
import { Tag, LineChart, BarChart4, Users } from "lucide-react";
import LogoImg from "@/assets/EaseSpotter.png";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState("login");
  const { user } = useAuth();
  const [_, navigate] = useLocation();

  useEffect(() => {
    window.history.pushState({ authBackRedirect: true }, "", window.location.href);

    const handleBackNavigation = () => {
      navigate("/", { replace: true });
    };

    window.addEventListener("popstate", handleBackNavigation);
    return () => window.removeEventListener("popstate", handleBackNavigation);
  }, [navigate]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(user.role === "cashier" ? "/cashier" : "/dashboard");
    }
  }, [user, navigate]);

  return (
    <div className="flex h-screen">
      {/* Auth Form Column */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center mb-4">
              <img src={LogoImg} alt="EaseSpotter Logo" className="h-12 mr-3" />
              <h1 className="text-4xl font-bold tracking-tight text-primary">
                EaseSpotter
              </h1>
            </div>
            <p className="mt-2 text-muted-foreground">
              Sign in to your account to access your dashboard
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-6">
              <LoginForm />
            </TabsContent>
            <TabsContent value="register" className="mt-6">
              <RegisterForm />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Hero Column */}
      <div className="hidden md:flex flex-1 flex-col justify-center bg-gradient-to-b from-primary/10 to-primary/5 p-12">
        <div className="max-w-xl mx-auto">
          <Badge variant="outline" className="mb-4">
            Retail Pricing Solution
          </Badge>
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            Optimize your pricing strategy with real-time analytics
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            EaseSpotter helps you maximize profits and stay competitive with
            advanced pricing algorithms and competitive intelligence.
          </p>

          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-start space-x-3">
              <Tag className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-medium mb-1">Dynamic Pricing</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically adjust prices based on demand, competition, and inventory levels
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <LineChart className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-medium mb-1">Market Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  Track competitor prices and identify market trends in real-time
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <BarChart4 className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-medium mb-1">Performance Metrics</h3>
                <p className="text-sm text-muted-foreground">
                  Visualize sales performance and pricing effectiveness
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-medium mb-1">Multi-tenant Platform</h3>
                <p className="text-sm text-muted-foreground">
                  Secure access for all your team members with role-based permissions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
