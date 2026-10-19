import { Switch, Route } from "wouter";
import { useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Cashier from "./pages/Cashier";
import PricingRules from "./pages/PricingRules";
import PricingAssistant from "./pages/PricingAssistant";
import Analytics from "./pages/Analytics";
import AdvancedAnalytics from "./pages/AdvancedAnalytics";
import VirtualFitting from "./pages/VirtualFitting";
import SystemStatus from "./pages/SystemStatus";
import VendorSettings from "./pages/VendorSettings";
import TeamManagement from "./pages/TeamManagement";
import Marketing from "./pages/Marketing";
import VendorHealth from "./pages/VendorHealth";
import SupplierManagement from "./pages/SupplierManagement";
import ChannelManagement from "./pages/ChannelManagement";
import Competitors from "./pages/Competitors";
import AuthPage from "./pages/auth-page";
import AcceptInvitation from "./pages/AcceptInvitation";
import StoreSetup from "./pages/StoreSetup";
import Onboarding from "./pages/Onboarding";
import StoreProfile from "./pages/StoreProfile";
import Storefront from "./pages/Storefront";
import ProductDetail from "./pages/ProductDetail";
import HomePage from "./pages/HomePage";
import Features from "./pages/Features";
import Pricing from "./pages/Pricing";
import About from "./pages/About";
import AuthTester from "./pages/auth-tester";
import DashboardLayout from "./components/layout/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/use-auth";
import { CurrencyProvider } from "@/hooks/use-currency";
import { SharedStateProvider } from "@/hooks/use-shared-state";
import { ProtectedRoute } from "@/lib/protected-route";
import { AdminProtectedRoute } from "@/lib/admin-protected-route";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { trackAbTestClickFromUrl } from "@/lib/ab-testing";

function NotFound() {
  return <div className="p-4">404: Page Not Found</div>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth-test" component={AuthTester} />
      <Route path="/stores" component={Storefront} />
      <Route path="/features" component={Features} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/about" component={About} />
      <Route path="/store/:slug" component={Storefront} />
      <Route path="/store/:storeSlug/product/:productSlug" component={ProductDetail} />
      <ProtectedRoute path="/store-setup" component={StoreSetup} />
      <ProtectedRoute path="/onboarding" component={Onboarding} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/products" component={Products} />
      <ProtectedRoute path="/cashier" component={Cashier} />
      <ProtectedRoute path="/pricing-rules" component={PricingRules} />
      <ProtectedRoute path="/pricing-assistant" component={PricingAssistant} />
      <ProtectedRoute path="/vendor-health" component={VendorHealth} />
      <ProtectedRoute path="/suppliers" component={SupplierManagement} />
      <ProtectedRoute path="/channels" component={ChannelManagement} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/advanced-analytics" component={AdvancedAnalytics} />
      <ProtectedRoute path="/competitors" component={Competitors} />
      <ProtectedRoute path="/marketing" component={Marketing} />
      <ProtectedRoute path="/virtual-fitting" component={VirtualFitting} />
      <ProtectedRoute path="/store-profile" component={StoreProfile} />
      <ProtectedRoute path="/system-status" component={SystemStatus} />
      <ProtectedRoute path="/vendors" component={VendorSettings} />
      <ProtectedRoute path="/team" component={TeamManagement} />
      <Route path="/accept-invitation/:token" component={AcceptInvitation} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  // Listen for system color scheme changes
  useEffect(() => {
    // Apply theme when it changes
    const applyTheme = () => {
      const savedTheme = localStorage.getItem("theme") || "system";
      const root = window.document.documentElement;
      
      // Remove existing theme classes
      root.classList.remove("light", "dark");
      
      if (savedTheme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(savedTheme);
      }
    };

    // Watch for system theme changes if using system theme
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", applyTheme);
    
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, []);

  useEffect(() => {
    trackAbTestClickFromUrl().catch((error) => {
      console.error("Failed to track A/B click attribution:", error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <SharedStateProvider>
            <ErrorBoundary>
              <DashboardLayout>
                <AppRoutes />
              </DashboardLayout>
              <Toaster />
            </ErrorBoundary>
          </SharedStateProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
