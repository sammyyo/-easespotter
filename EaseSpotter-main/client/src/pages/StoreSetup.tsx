import { useState } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

// Create form validation schema
const storeSetupSchema = z.object({
  name: z.string().min(2, {
    message: "Store name must be at least 2 characters",
  }),
  category: z.string({
    required_error: "Please select a category for your store",
  }),
});

type StoreSetupFormValues = z.infer<typeof storeSetupSchema>;

export default function StoreSetup() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { user, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-populate with user data if available
  const defaultValues: Partial<StoreSetupFormValues> = {
    name: "",
    category: "",
  };

  const form = useForm<StoreSetupFormValues>({
    resolver: zodResolver(storeSetupSchema),
    defaultValues,
  });

  async function onSubmit(data: StoreSetupFormValues) {
    setIsSubmitting(true);
    
    try {
      if (!user) {
        throw new Error("You must be logged in to create a store");
      }

      console.log("Creating store with data:", data);
      console.log("Current user:", user);
      
      // Create the store
      const response = await apiRequest("POST", "/api/vendors", {
        ...data,
        userId: user.id  // Add user ID to link the vendor to the user
      });
      
      if (!response.ok) {
        let errorMessage = "Failed to create store";
        try {
          const errorData = await response.json();
          console.error("Store creation error:", errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error("Could not parse error response:", e);
        }
        throw new Error(errorMessage);
      }
      
      const vendorData = await response.json();
      console.log("Store created successfully:", vendorData);
      
      // Add sample products to the store
      try {
        const sampleProductsResponse = await apiRequest(
          "POST", 
          "/api/sample-products", 
          { vendorId: vendorData.id }
        );
        
        if (!sampleProductsResponse.ok) {
          console.warn("Failed to add sample products, continuing anyway");
        } else {
          console.log("Sample products added successfully");
        }
      } catch (productError) {
        console.error("Error adding sample products:", productError);
        // Continue even if adding sample products fails
      }
      
      // Refresh user data to get updated vendorId
      console.log("Refreshing user data...");
      const updatedUser = await refreshUser();
      console.log("User data refreshed:", updatedUser);
      
      // Show success message
      toast({
        title: "Store created successfully!",
        description: "Your store has been set up with sample products.",
      });

      // Wait a moment to make sure the user data is refreshed
      setTimeout(() => {
        // Navigate to onboarding page
        console.log("Navigating to onboarding page...");
        setLocation("/onboarding");
      }, 1000);
    } catch (error: any) {
      console.error("Store setup error:", error);
      toast({
        title: "Error creating store",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (user?.vendorId) {
    // User already has a store, redirect to onboarding
    setLocation("/onboarding");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex flex-col items-center justify-center w-full md:w-1/2 px-6 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold">Set Up Your Store</h1>
            <p className="text-muted-foreground mt-2">
              Tell us about your business to get started with EaseSpotter
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Awesome Store" {...field} />
                    </FormControl>
                    <FormDescription>
                      This is how your store will appear to customers
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="electronics">Electronics</SelectItem>
                        <SelectItem value="clothing">Clothing</SelectItem>
                        <SelectItem value="food">Food & Grocery</SelectItem>
                        <SelectItem value="home">Home & Furniture</SelectItem>
                        <SelectItem value="beauty">Beauty & Personal Care</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose the category that best fits your store
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating Store..." : "Create Store"}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      <div className="hidden md:flex md:w-1/2 bg-primary/10 items-center justify-center p-8">
        <div className="max-w-lg">
          <h2 className="text-3xl font-bold mb-4">Welcome to EaseSpotter</h2>
          <p className="text-xl mb-6">
            You're just one step away from accessing powerful pricing and inventory tools.
          </p>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="bg-primary text-primary-foreground rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0">1</div>
              <div>
                <h3 className="font-medium">Set up your store</h3>
                <p className="text-muted-foreground">Enter basic information about your business</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-primary text-primary-foreground rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0">2</div>
              <div>
                <h3 className="font-medium">Get sample data</h3>
                <p className="text-muted-foreground">We'll create sample products to help you explore the platform</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-primary text-primary-foreground rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0">3</div>
              <div>
                <h3 className="font-medium">Learn the platform</h3>
                <p className="text-muted-foreground">Follow our guided tour to see all the features available to you</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}