import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import RootHeader from "@/components/layout/RootHeader";
import LogoImg from "../assets/EaseSpotter.png";
import IncreasedSalesAndProfitabilityImg from "../assets/increased-sales-and-profitability.jpg";
import StreamlinedOperationsImg from "../assets/streamlined-operations.jpg";
import EnhancedCustomerSatisfactionImg from "../assets/enhanced-customer-satisfaction.jpg";
import { useCurrency } from "@/hooks/use-currency";
import { 
  ArrowRight, 
  Truck, 
  ShoppingBag, 
  LineChart, 
  BarChart, 
  Megaphone, 
  Globe,
  Store,
  ExternalLink 
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { currency } = useCurrency();
  const [_, navigate] = useLocation();
  const [stores, setStores] = useState<{ id: number; name: string; description: string | null; logoUrl: string | null; bannerUrl: string | null; themeColor: string | null; storeType: string | null; slug: string; }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/public/stores");
        
        if (!response.ok) {
          throw new Error(`Failed to fetch stores: ${response.status}`);
        }
        
        const data = await response.json();
        setStores(data);
      } catch (err) {
        console.error("Error fetching stores:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <RootHeader />

      {/* Main Hero Section */}
      <div className="relative h-[600px] w-full overflow-hidden">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/EaseSpotter_Home_Retail_image.png')"
          }}
        >
          <div className="absolute inset-0 bg-black/20 mix-blend-multiply"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/30"></div>
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex h-full items-center justify-center text-center">
          <div className="max-w-4xl px-4">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Pricing and Inventory Tools for Independent Retailers
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              EaseSpotter helps store owners manage products, track stock, scan sales, publish store data, and keep pricing
              decisions grounded in real inventory and competitor signals.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthLoading ? (
                <div className="h-12 w-40 rounded-md bg-white/20" aria-hidden="true" />
              ) : user ? (
                <Button size="lg" onClick={() => navigate("/dashboard")} className="bg-secondary px-8 py-3 text-secondary-foreground hover:bg-secondary/90">
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={() => navigate("/auth")} className="bg-secondary px-8 py-3 text-secondary-foreground hover:bg-secondary/90">
                    Get Started Free
                  </Button>
                  <Button variant="outline" size="lg" className="border-white/80 bg-white/10 px-8 py-3 text-white hover:bg-white hover:text-primary">
                    Watch Demo
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Hero Section */}
      <div className="border-b border-outline-variant/50 bg-background">
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
            <div className="flex-1 space-y-6">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-primary dark:text-white">
                Dynamic Pricing for Modern Retail Teams
              </h1>
              <p className="text-lg text-muted-foreground">
                Track inventory, monitor competitor prices, and apply pricing rules from one vendor dashboard.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthLoading ? (
                  <div className="h-11 w-40 rounded-md bg-muted" aria-hidden="true" />
                ) : user ? (
                  <Button size="lg" onClick={() => navigate("/dashboard")} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    Go to Dashboard <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="outline" size="lg">
                  Schedule a Demo
                </Button>
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-md rounded-lg border border-outline-variant/70 bg-card p-6 shadow-[0_10px_30px_rgba(15,23,42,0.10)]">
                <h3 className="text-xl font-bold mb-4">Pricing Optimization Demo</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-md">
                    <div className="flex justify-between items-center">
                      <span>Current Price</span>
                      <span className="font-bold">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(24.99)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 bg-primary text-primary-foreground rounded-md">
                    <div className="flex justify-between items-center">
                      <span>Recommended Price</span>
                      <span className="font-bold">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(29.99)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-success/10 rounded-md">
                      <div className="text-sm font-medium">Projected Revenue</div>
                      <div className="text-lg font-bold text-success">+12.5%</div>
                    </div>
                    <div className="p-3 bg-secondary/10 rounded-md">
                      <div className="text-sm font-medium">Competitive Edge</div>
                      <div className="text-lg font-bold text-secondary">8/10</div>
                    </div>
                  </div>
                  {user ? (
                    <Button variant="default" size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => navigate("/pricing-rules")}>
                      View Pricing Rules
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => navigate("/auth")}>
                      Try Now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Store Directory Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold flex items-center text-primary">
            <Store className="mr-2 h-8 w-8 text-secondary" /> Discover Our Stores
          </h2>
          <Button variant="outline" onClick={() => navigate("/stores")} className="flex items-center gap-1">
            All Stores <ExternalLink className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <p className="text-muted-foreground mb-8">Browse verified stores using EaseSpotter to publish searchable product catalogs.</p>
        
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="p-0">
                  <Skeleton className="h-40 w-full" />
                </CardHeader>
                <CardContent className="p-4 pt-16">
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter className="flex justify-between p-4">
                  <Skeleton className="h-10 w-24" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
            <p className="font-bold">Error loading stores</p>
            <p>{error}</p>
          </div>
        ) : stores.length === 0 ? (
          <div className="p-8 bg-gray-50 rounded-lg text-center">
            <h2 className="text-xl font-semibold mb-2">No Stores Available</h2>
            <p className="text-gray-600 mb-4">
              There are currently no verified stores to display.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.slice(0, 3).map((store) => (
              <Card 
                key={store.id} 
                className="overflow-hidden border-outline-variant/70 hover:shadow-lg transition-shadow duration-300"
                style={{ borderTopColor: store.themeColor || 'hsl(var(--secondary))', borderTopWidth: '4px' }}
              >
                <CardHeader className="p-0">
                  {/* Banner image - either custom or default */}
                  <div 
                    className="h-40 bg-cover bg-center relative"
                    style={{ 
                      backgroundImage: `url(${store.bannerUrl || '/images/store-banner.png'})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  >
                    {/* Container with relative position needed for absolute positioning of logo */}
                    <div className="relative w-full h-full">
                      {/* Logo positioned to straddle bottom of banner */}
                      <div className="absolute left-1/2 transform -translate-x-1/2 bottom-0 translate-y-1/2 z-10">
                        {store.logoUrl ? (
                          <div className="bg-white p-2 rounded-full shadow-lg h-24 w-24 flex items-center justify-center border-4 border-white">
                            <img 
                              src={store.logoUrl} 
                              alt={`${store.name} logo`} 
                              className="max-h-18 max-w-18 object-contain rounded-full"
                              onError={(e) => {
                                console.error("Error loading logo image in card");
                                e.currentTarget.onerror = null; // prevent looping
                                e.currentTarget.src = LogoImg;
                                e.currentTarget.alt = "Default Brand Image";
                              }}
                            />
                          </div>
                        ) : (
                          <div className="bg-white p-4 rounded-full shadow-lg h-24 w-24 flex items-center justify-center border-4 border-white">
                            <div className="text-lg font-bold text-gray-700 text-center">{store.name.substring(0, 2).toUpperCase()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-4 pt-16">
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-xl">{store.name}</CardTitle>
                    {store.storeType && (
                      <Badge variant="outline" className="ml-2 border-secondary/40 bg-secondary/10 text-secondary">
                        {store.storeType}
                      </Badge>
                    )}
                  </div>
                  
                  <Separator className="my-2" />
                  
                  <p className="text-muted-foreground line-clamp-3">
                    {store.description || "No description available."}
                  </p>
                </CardContent>
                
                <CardFooter className="flex justify-between p-4">
                  <Button onClick={() => navigate(`/store/${store.slug}`)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    Visit Store
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12 text-primary">Powerful Features for Smart Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<ShoppingBag className="h-10 w-10 text-primary" />}
            title="Inventory Management"
            description="Track and manage your inventory with real-time updates and smart reordering recommendations."
          />
          <FeatureCard 
            icon={<LineChart className="h-10 w-10 text-primary" />}
            title="Advanced Analytics"
            description="Make data-driven decisions with comprehensive reports and intuitive visualizations."
          />
          <FeatureCard 
            icon={<BarChart className="h-10 w-10 text-primary" />}
            title="Competitor Tracking"
            description="Monitor your competitors' prices and promotions to stay ahead of the market."
          />
          <FeatureCard 
            icon={<Megaphone className="h-10 w-10 text-primary" />}
            title="Marketing Campaigns"
            description="Create and manage targeted marketing campaigns with personalized customer segmentation."
          />
          <FeatureCard 
            icon={<Globe className="h-10 w-10 text-primary" />}
            title="Multi-Channel Management"
            description="Synchronize pricing across all your sales channels with automated rules and policies."
          />
          <FeatureCard 
            icon={<Truck className="h-10 w-10 text-primary" />}
            title="Supplier Management"
            description="Optimize your relationships with suppliers through performance tracking and negotiations."
          />
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-surface-container py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-primary">Benefits of Using EaseSpotter</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Keep pricing, stock, and store operations easier to manage as your catalog grows.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Increased Sales and Profitability */}
            <div className="bg-card rounded-lg overflow-hidden border border-outline-variant/70 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-64 overflow-hidden">
                <img
                  src={IncreasedSalesAndProfitabilityImg}
                  alt="Increased sales and profitability"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-3 text-center">Increased Sales and Profitability</h3>
                <p className="text-muted-foreground text-center">
                  Boost revenue and margins with intelligent pricing and optimized inventory management.
                </p>
              </div>
            </div>

            {/* Streamlined Operations */}
            <div className="bg-card rounded-lg overflow-hidden border border-outline-variant/70 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-64 overflow-hidden">
                <img
                  src={StreamlinedOperationsImg}
                  alt="Streamlined operations"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-3 text-center">Streamlined Operations</h3>
                <p className="text-muted-foreground text-center">
                  Simplify workflows, reduce manual tasks, and improve overall efficiency.
                </p>
              </div>
            </div>

            {/* Enhanced Customer Satisfaction */}
            <div className="bg-card rounded-lg overflow-hidden border border-outline-variant/70 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-64 overflow-hidden">
                <img
                  src={EnhancedCustomerSatisfactionImg}
                  alt="Enhanced customer satisfaction"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-3 text-center">Enhanced Customer Satisfaction</h3>
                <p className="text-muted-foreground text-center">
                  Deliver exceptional shopping experiences with AR visualization and seamless inventory management.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-background py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4 text-primary">Ready to Optimize Your Pricing Strategy?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Start with product management, cashier checkout, inventory updates, and pricing controls built for store teams.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            {isAuthLoading ? (
              <div className="h-11 w-40 rounded-md bg-muted" aria-hidden="true" />
            ) : user ? (
              <Button size="lg" onClick={() => navigate("/dashboard")} className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                Go to Dashboard
              </Button>
            ) : (
              <Button size="lg" onClick={() => navigate("/auth")} className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                Get Started Today
              </Button>
            )}
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-card border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <img src={LogoImg} alt="EaseSpotter Logo" className="h-8" />
              <span className="font-bold text-lg">EaseSpotter</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} EaseSpotter. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-card border border-outline-variant/70 rounded-lg p-6 transition-all hover:-translate-y-0.5 hover:border-secondary/50 hover:shadow-md">
      <div className="mb-4 inline-flex rounded-md bg-secondary/10 p-2 text-secondary [&_svg]:text-secondary">{icon}</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
