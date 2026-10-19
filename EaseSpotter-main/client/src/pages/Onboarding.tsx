import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ChevronRight, LineChart, Package, Settings, Tag, BarChart4, Store, Gauge } from "lucide-react";

export default function Onboarding() {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const [completedSteps, setCompletedSteps] = useState<string[]>(['setup_account']);

  // Mark a step as completed
  const completeStep = (stepId: string) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };

  // Check if a step is completed
  const isCompleted = (stepId: string) => completedSteps.includes(stepId);

  // Navigate to a feature
  const navigateToFeature = (path: string, stepId: string) => {
    completeStep(stepId);
    setLocation(path);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Welcome to EaseSpotter</h1>
        <p className="text-xl text-muted-foreground">
          Your store is set up and ready to go. Let's explore what you can do!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="transition-all hover:shadow-md">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                Store Setup
              </CardTitle>
              {isCompleted('setup_account') && (
                <span className="bg-green-100 text-green-800 flex items-center rounded-full px-2 py-1 text-xs font-medium">
                  <Check className="h-3 w-3 mr-1" /> Completed
                </span>
              )}
            </div>
            <CardDescription>
              Your store is set up with sample products
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Your store <strong>{user?.vendorName || "Store"}</strong> has been created with sample products to help you explore the platform.</p>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigateToFeature("/products", "view_products")}
            >
              View Products <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Dynamic Pricing
            </CardTitle>
            <CardDescription>
              Set up and manage pricing rules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Create and manage pricing rules that automatically adjust your product prices based on various conditions.</p>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigateToFeature("/pricing-rules", "view_pricing_rules")}
            >
              Explore Pricing Rules <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Inventory Management
            </CardTitle>
            <CardDescription>
              Track and manage your inventory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Monitor stock levels, set up low stock alerts, and get recommendations for restocking.</p>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigateToFeature("/inventory", "view_inventory")}
            >
              Manage Inventory <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5 text-primary" />
              Analytics Dashboard
            </CardTitle>
            <CardDescription>
              Get insights from your store data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Visualize sales performance, track pricing effectiveness, and identify trends to guide your strategy.</p>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigateToFeature("/analytics", "view_analytics")}
            >
              View Analytics <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart4 className="h-5 w-5 text-primary" />
              Competitor Tracking
            </CardTitle>
            <CardDescription>
              Monitor competitor prices and strategies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Track your competitors' prices and product offerings to stay competitive in the market.</p>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigateToFeature("/competitors", "view_competitors")}
            >
              Track Competitors <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* AI Pricing Assistant card has been temporarily removed */}
      </div>

      <div className="mt-12 flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-4">Ready to explore your dashboard?</h2>
        <Button 
          size="lg" 
          onClick={() => setLocation("/")}
          className="px-8"
        >
          Go to Dashboard
        </Button>
      </div>

      <div className="mt-16 mb-8">
        <h2 className="text-2xl font-bold mb-6">Getting Started Checklist</h2>
        <div className="space-y-4 max-w-3xl mx-auto">
          <ChecklistItem 
            title="Set up your store" 
            description="Create your store and add sample products" 
            completed={true} 
          />
          <ChecklistItem 
            title="Explore pricing rules" 
            description="Learn how to set up dynamic pricing rules" 
            completed={isCompleted('view_pricing_rules')} 
          />
          <ChecklistItem 
            title="Manage inventory" 
            description="Check stock levels and set up low stock alerts" 
            completed={isCompleted('view_inventory')} 
          />
          <ChecklistItem 
            title="View analytics" 
            description="Explore your store performance data" 
            completed={isCompleted('view_analytics')} 
          />
          <ChecklistItem 
            title="Track competitors" 
            description="Monitor competitor prices and offerings" 
            completed={isCompleted('view_competitors')} 
          />
          {/* AI Pricing Assistant checklist item has been temporarily removed */}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
      <div className="flex items-center mb-4">
        <div className="mr-4 text-primary">{icon}</div>
        <h3 className="text-xl font-bold">{title}</h3>
      </div>
      <p className="text-gray-600 mb-4">{description}</p>
      <Button variant="outline" className="w-full">
        Explore
      </Button>
    </div>
  );
}

function ChecklistItem({ title, description, completed }: { title: string; description: string; completed: boolean }) {
  return (
    <div className={`p-4 border rounded-lg flex items-start ${completed ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
      <div className={`rounded-full h-5 w-5 mt-0.5 flex items-center justify-center flex-shrink-0 ${completed ? 'bg-green-500' : 'border border-gray-300'}`}>
        {completed && <Check className="h-3 w-3 text-white" />}
      </div>
      <div className="ml-3">
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}