import { publicStoreLocationSchema, emptyStoreLocation } from "../../../shared/store-location";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
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

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, Store, Upload, Users, Bell, Settings, Package,
  ChevronRight, Plus, Tag, ExternalLink, Image, Info, Copy, Download,
  MoreHorizontal, Pencil, QrCode, Trash, Edit, AlertCircle
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { StoreProductForm } from "@/components/products/StoreProductForm";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { optimizeImage, validateImageSize } from "@/lib/image-utils";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

// Form schema
const storeProfileSchema = z.object({
  publicLocation: publicStoreLocationSchema,
  name: z.string().min(2, "Store name must be at least 2 characters"),
  description: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  contactEmail: z.string().email("Must be a valid email").optional().or(z.literal("")),
  themeColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color").optional(),
  integrationType: z.enum(["manual", "shopify", "woocommerce", "magento", "bigcommerce", "other"]),
  locationLabelPrimary: z.string().min(1, "Primary location label is required").default("Aisle"),
  locationLabelSecondary: z.string().min(1, "Secondary location label is required").default("Shelf"),
  brandImageUrl: z.string().optional(),
  bannerUrl: z.string().optional()
});

type StoreProfileFormValues = z.infer<typeof storeProfileSchema>;

const primaryLocationLabelOptions = ["Aisle", "Zone", "Section", "Rack", "Room", "Bay"];
const secondaryLocationLabelOptions = ["Shelf", "Bin", "Row", "Level", "Slot"];

const getLocationLabelSelectValue = (value: string | undefined, options: string[]) => (
  value && options.includes(value) ? value : "other"
);

const parseIntegrationSettings = (settings: unknown): Record<string, any> => {
  if (!settings) return {};
  if (typeof settings === "string") {
    try {
      const parsed = JSON.parse(settings);
      return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  return typeof settings === "object" ? settings as Record<string, any> : {};
};

const getStoreLocationLabels = (storeProfile: any) => {
  const integrationSettings = parseIntegrationSettings(storeProfile?.integrationSettings);
  const nestedLabels = integrationSettings.locationLabels && typeof integrationSettings.locationLabels === "object"
    ? integrationSettings.locationLabels
    : {};

  return {
    primary: storeProfile?.locationLabelPrimary || nestedLabels.primary || "Aisle",
    secondary: storeProfile?.locationLabelSecondary || nestedLabels.secondary || "Shelf",
  };
};

export default function StoreProfile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [, navigate] = useLocation();
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [isEditProductDialogOpen, setIsEditProductDialogOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  // Promotion management state
  const [isAddPromotionDialogOpen, setIsAddPromotionDialogOpen] = useState(false);
  const [isEditPromotionDialogOpen, setIsEditPromotionDialogOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<any>(null);

  // Fetch store profile data
  const { data: storeProfile, isLoading: isLoadingProfile, error: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["/api/stores/profile"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stores/profile");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch store profile");
      }
      return res.json();
    }
  });
  
  // Fetch store products
  const { data: storeProducts, isLoading: isLoadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ["/api/stores/products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stores/products");
      if (!res.ok) {
        // Don't throw error, just return empty array
        return [];
      }
      return res.json();
    },
    enabled: !!storeProfile, // Only fetch products when store profile is loaded
  });

  const formatSku = (sku?: string | null) => (
    !sku || sku.startsWith("__NO_SKU__") ? "N/A" : sku
  );

  // Fetch store followers
  const { data: followers, isLoading: isLoadingFollowers } = useQuery({
    queryKey: ["/api/stores/followers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stores/followers");
      if (!res.ok) {
        // Don't throw error for followers, just return empty array
        return [];
      }
      return res.json();
    }
  });
  
  // Fetch store promotions
  const { data: promotions, isLoading: isLoadingPromotions, refetch: refetchPromotions } = useQuery({
    queryKey: ["/api/promotions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/promotions");
      if (!res.ok) {
        // Don't throw error for promotions, just return empty array
        return [];
      }
      return res.json();
    },
    enabled: !!storeProfile, // Only fetch promotions when store profile is loaded
  });

  // Create form with default values from store profile
  const form = useForm<StoreProfileFormValues>({
    resolver: zodResolver(storeProfileSchema),
    defaultValues: {
      publicLocation: {...emptyStoreLocation},
      name: "",
      description: "",
      website: "",
      contactEmail: "",
      themeColor: "#FFFFFF",
      integrationType: "manual",
      locationLabelPrimary: "Aisle",
      locationLabelSecondary: "Shelf",
      brandImageUrl: "",
      bannerUrl: ""
    },
  });

  // Create a ref to track profile update status
  const profileUpdatedRef = useRef(false);

  // Update form values when store profile data is loaded
  useEffect(() => {
    if (storeProfile) {
      const locationLabels = getStoreLocationLabels(storeProfile);
      form.reset({
        publicLocation: storeProfile.publicLocation || {...emptyStoreLocation},
        name: storeProfile.name || "",
        description: storeProfile.description || "",
        website: storeProfile.website || "",
        contactEmail: storeProfile.contactEmail || "",
        themeColor: storeProfile.themeColor || "#FFFFFF",
        integrationType: "manual",
        locationLabelPrimary: locationLabels.primary,
        locationLabelSecondary: locationLabels.secondary,
        brandImageUrl: storeProfile.logoUrl || "", // Using logoUrl from the backend but saving as brandImageUrl
        bannerUrl: storeProfile.bannerUrl || "" // Banner image URL
      });
      
      
      // Reset the update flag when new data is loaded
      profileUpdatedRef.current = false;
    }
  }, [storeProfile, form]);

  // Update store profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: StoreProfileFormValues) => {
      const res = await apiRequest("POST", "/api/stores/profile", {
        ...data,
        integrationType: "manual",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update store profile");
      }
      return res.json();
    },
    onSuccess: (updatedProfile) => {
      // Set the flag to indicate a successful update
      profileUpdatedRef.current = true;
      queryClient.setQueryData(["/api/stores/profile"], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("/api/vendors"),
      });
      
      toast({
        title: "Profile updated",
        description: "Your store profile has been updated successfully.",
      });
      
      // Force a profile refresh after a small delay to ensure backend processing is complete
      setTimeout(() => {
        refetchProfile();
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Add promotion mutation
  const addPromotionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/promotions", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add promotion");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Promotion added",
        description: "Your promotion has been added successfully.",
      });
      setIsAddPromotionDialogOpen(false);
      refetchPromotions();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add promotion",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Update promotion mutation
  const updatePromotionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/promotions/${data.id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update promotion");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Promotion updated",
        description: "Your promotion has been updated successfully.",
      });
      setIsEditPromotionDialogOpen(false);
      setSelectedPromotion(null);
      refetchPromotions();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update promotion",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Delete promotion mutation
  const deletePromotionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/promotions/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete promotion");
      }
      return true;
    },
    onSuccess: () => {
      toast({
        title: "Promotion deleted",
        description: "Your promotion has been deleted successfully.",
      });
      refetchPromotions();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete promotion",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle form submission with proper error handling
  const onSubmit = (data: StoreProfileFormValues) => {
    // Create a copy of the data to avoid modifying the form data directly
    const submissionData = { ...data };
    
    // Handle the image upload separately to avoid navigation issues
    updateProfileMutation.mutate(submissionData, {
      onSuccess: (updatedProfile) => {
        // We don't need to manually update the UI, as the query invalidation will do that
        console.log("Profile updated successfully", updatedProfile);
      }
    });
  };

  const onInvalidSubmit = () => {
    toast({
      title: "Check store profile fields",
      description: "Some profile fields need attention before the store profile can be saved.",
      variant: "destructive",
    });
  };

  // Show loader when initial data is loading
  if (isLoadingProfile && !storeProfile) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show error if profile fetch failed
  if (profileError) {
    return (
      <div className="space-y-8">
        <Alert variant="destructive">
          <AlertTitle>Error loading store profile</AlertTitle>
          <AlertDescription>
            {profileError instanceof Error ? profileError.message : "Failed to load store profile data. Please try again."}
          </AlertDescription>
        </Alert>
        <Button 
          className="mt-4" 
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] })}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Store Profile</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button" 
            size="sm"
            className="flex items-center gap-1"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files[0]) {
                  const file = target.files[0];
                  
                  // Validate the image size before processing
                  if (!validateImageSize(file, 500)) { // 500KB limit
                    toast({
                      title: "File too large",
                      description: "Please select an image smaller than 500KB for better performance.",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Show loading toast
                  toast({
                    title: "Processing image",
                    description: "Optimizing and uploading your logo...",
                  });
                  
                  try {
                    // Use our new image optimization utility
                    optimizeImage(file, 200, 200, 0.85, 'webp')
                      .then(async (optimizedFile) => {
                        // Convert the optimized file to base64 for upload
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const base64String = reader.result as string;
                          
                          // Update the form with the optimized image data
                          form.setValue('brandImageUrl', base64String);
                          const imageData = {
                            ...form.getValues(),
                            brandImageUrl: base64String
                          };
                          
                          // Save the changes
                          updateProfileMutation.mutate(imageData, {
                            onSuccess: () => {
                              toast({
                                title: "Logo updated",
                                description: "Your store logo has been optimized and updated.",
                              });
                              refetchProfile();
                            }
                          });
                        };
                        
                        reader.readAsDataURL(optimizedFile);
                      })
                      .catch((error) => {
                        toast({
                          title: "Image processing failed",
                          description: error instanceof Error ? error.message : "Failed to optimize image",
                          variant: "destructive",
                        });
                      });
                  } catch (error) {
                    toast({
                      title: "Image processing error",
                      description: error instanceof Error ? error.message : "Failed to process image",
                      variant: "destructive",
                    });
                  }
                }
              };
              input.click();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Logo
          </Button>
          
          <Button
            type="button"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files[0]) {
                  const file = target.files[0];
                  
                  // Validate the image size before processing
                  if (!validateImageSize(file, 800)) { // 800KB limit for banner
                    toast({
                      title: "File too large",
                      description: "Please select an image smaller than 800KB for better performance.",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Show loading toast
                  toast({
                    title: "Processing image",
                    description: "Optimizing and uploading your banner...",
                  });
                  
                  try {
                    // Use our new image optimization utility with banner dimensions
                    optimizeImage(file, 1200, 600, 0.85, 'webp')
                      .then(async (optimizedFile) => {
                        // Convert the optimized file to base64 for upload
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const base64String = reader.result as string;
                          
                          // Update the form with the optimized image data
                          form.setValue('bannerUrl', base64String);
                          const imageData = {
                            ...form.getValues(),
                            bannerUrl: base64String
                          };
                          
                          // Save the changes
                          updateProfileMutation.mutate(imageData, {
                            onSuccess: () => {
                              toast({
                                title: "Banner updated",
                                description: "Your store banner has been optimized and updated.",
                              });
                              refetchProfile();
                            }
                          });
                        };
                        
                        reader.readAsDataURL(optimizedFile);
                      })
                      .catch((error) => {
                        toast({
                          title: "Image processing failed",
                          description: error instanceof Error ? error.message : "Failed to optimize image",
                          variant: "destructive",
                        });
                      });
                  } catch (error) {
                    toast({
                      title: "Image processing error",
                      description: error instanceof Error ? error.message : "Failed to process image",
                      variant: "destructive",
                    });
                  }
                }
              };
              input.click();
            }}
          >
            <Image className="h-4 w-4 mr-2" />
            Upload Banner
          </Button>
          
          {storeProfile?.slug && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
              onClick={() => navigate(`/store/${storeProfile.slug}`)}
            >
              <ExternalLink className="h-4 w-4" />
              View Store
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" /> Profile
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center">
            <Package className="h-4 w-4 mr-2" /> Products
          </TabsTrigger>
          <TabsTrigger value="promotions" className="flex items-center">
            <Tag className="h-4 w-4 mr-2" /> Promotions
          </TabsTrigger>
          <TabsTrigger value="followers" className="flex items-center">
            <Users className="h-4 w-4 mr-2" /> Followers
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Store Profile</CardTitle>
              <CardDescription>
                Manage your store's public profile information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Store Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell customers about your store"
                            className="resize-none"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>
                          A brief description of your store
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website URL</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://example.com" 
                              {...field} 
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Your store's website URL
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Email</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="contact@example.com" 
                              {...field}
                              value={field.value || ""} 
                            />
                          </FormControl>
                          <FormDescription>
                            Email for customer inquiries
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <section className="space-y-4 rounded-lg border p-4" aria-label="Public store location">
                    <h3 className="font-semibold">Store location in the app</h3>
                    <p className="text-sm text-muted-foreground">
                      Add your customer-facing address and map coordinates so shoppers can find your store nearby.
                      This is separate from your business contact address in Vendor Settings.
                    </p>
                    <FormField control={form.control} name="publicLocation.address" render={({field}) => (
                      <FormItem><FormLabel>Store address</FormLabel>
                        <FormControl><Textarea {...field} placeholder="Street, building number, postal code, city, country" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(["latitude", "longitude"] as const).map((coordinate) => (
                        <FormField key={coordinate} control={form.control} name={`publicLocation.${coordinate}`} render={({field}) => (
                          <FormItem><FormLabel>{coordinate === "latitude" ? "Latitude" : "Longitude"}</FormLabel>
                            <FormControl><Input type="number" step="any" min={coordinate === "latitude" ? -90 : -180}
                              max={coordinate === "latitude" ? 90 : 180} value={field.value ?? ""}
                              onBlur={field.onBlur} ref={field.ref} name={field.name}
                              onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      ))}
                    </div>
                    <Button type="button" variant="outline" onClick={() => {
                      if (!navigator.geolocation) {
                        toast({title: "Location unavailable", description: "Enter the coordinates from your map instead."});
                        return;
                      }
                      navigator.geolocation.getCurrentPosition((position) => {
                        form.setValue("publicLocation.latitude", position.coords.latitude, {shouldDirty: true, shouldValidate: true});
                        form.setValue("publicLocation.longitude", position.coords.longitude, {shouldDirty: true, shouldValidate: true});
                      }, () => toast({title: "Could not get your location", description: "Allow location access or enter the coordinates manually."}),
                      {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
                    }}>Use current location</Button>
                    <p className="text-sm text-muted-foreground">Use current location only while you are at the store. You can also copy latitude and longitude from your map.</p>
                    <FormField control={form.control} name="publicLocation.published" render={({field}) => (
                      <FormItem className="flex items-center justify-between gap-4">
                        <div><FormLabel>Show this location in the app</FormLabel>
                          <FormDescription>Your address and map location will be publicly visible. Save your profile to apply changes.</FormDescription></div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </section>

                  {/* Hidden inputs for image URLs */}
                  <input type="hidden" {...form.register("brandImageUrl")} />
                  <input type="hidden" {...form.register("bannerUrl")} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="themeColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Theme Color</FormLabel>
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="text" 
                                  {...field}
                                  value={field.value || "#FFFFFF"} 
                                />
                              </FormControl>
                              <div 
                                className="h-10 w-10 rounded-md border"
                                style={{ backgroundColor: field.value || "#FFFFFF" }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {[
                                "#FFFFFF", // White
                                "#3498db", // Blue
                                "#2ecc71", // Green
                                "#e74c3c", // Red
                                "#9b59b6", // Purple
                                "#f1c40f", // Yellow
                                "#1abc9c", // Teal
                                "#e67e22", // Orange
                                "#34495e", // Dark Blue
                                "#7f8c8d", // Gray
                                "#16a085", // Dark Green
                              ].map((color) => (
                                <div
                                  key={color}
                                  className={`h-8 w-8 rounded-md border cursor-pointer hover:scale-110 transition-transform ${
                                    field.value === color ? 'ring-2 ring-primary ring-offset-2' : ''
                                  } ${color === "#FFFFFF" ? 'border-gray-300' : 'border'}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => field.onChange(color)}
                                  title={color}
                                />
                              ))}
                            </div>
                          </div>
                          <FormDescription>
                            Optional: Select or enter your store's primary color
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full sm:w-auto"
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Profile
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Store Products</CardTitle>
                <CardDescription>
                  Manage your store's product catalog
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => {
                    setSelectedProduct(null); // Ensure we're showing store QR code, not product
                    setIsQRDialogOpen(true);
                  }}
                >
                  <QrCode className="h-4 w-4 mr-1" />
                  Store QR Code
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => setIsAddProductDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Product
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingProducts ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : storeProducts && storeProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeProducts.map((product: any) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            {product.imageUrl || product.image_url ? (
                              <div className="h-10 w-10 rounded-md overflow-hidden">
                                <img 
                                  src={product.imageUrl || product.image_url} 
                                  alt={product.name} 
                                  className="h-full w-full object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://placehold.co/40x40?text=No+Image';
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="truncate max-w-[200px]">{product.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatSku(product.sku)}</TableCell>
                        <TableCell>${parseFloat(product.basePrice).toFixed(2)}</TableCell>
                        <TableCell>
                          {product.category ? (
                            <Badge variant="outline">{product.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Uncategorized</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  // Open edit dialog with selected product
                                  setSelectedProduct(product);
                                  setIsEditProductDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  // View product QR code
                                  setSelectedProduct(product);
                                  setIsQRDialogOpen(true);
                                }}
                              >
                                <QrCode className="h-4 w-4 mr-2" />
                                QR Code
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  // Delete product confirmation dialog
                                  if (confirm("Are you sure you want to delete this product?")) {
                                    apiRequest("DELETE", `/api/stores/products/${product.id}`)
                                      .then(res => {
                                        if (!res.ok) {
                                          throw new Error("Failed to delete product");
                                        }
                                        queryClient.invalidateQueries({ queryKey: ["/api/stores/products"] });
                                        toast({
                                          title: "Product deleted",
                                          description: "The product has been removed from your store."
                                        });
                                      })
                                      .catch(error => {
                                        toast({
                                          title: "Error deleting product",
                                          description: error.message,
                                          variant: "destructive"
                                        });
                                      });
                                  }
                                }}
                                className="text-red-600"
                              >
                                <Trash className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-lg">No products yet</h4>
                      <p className="text-sm text-muted-foreground mb-4">Add your first product to get started</p>
                      <Button 
                        onClick={() => setIsAddProductDialogOpen(true)}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Product
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Promotions Tab */}
        <TabsContent value="promotions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Store Promotions</CardTitle>
                <CardDescription>
                  Manage special offers and discounts for your products
                </CardDescription>
              </div>
              <Button
                onClick={() => setIsAddPromotionDialogOpen(true)}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Promotion
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingPromotions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : promotions && promotions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Date Range</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promotions.map((promotion: any) => {
                      const now = new Date();
                      const startDate = new Date(promotion.startDate);
                      const endDate = new Date(promotion.endDate);
                      const isActive = now >= startDate && now <= endDate;

                      return (
                        <TableRow key={promotion.id}>
                          <TableCell className="font-medium">
                            {promotion.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {promotion.type ? promotion.type.replace(/_/g, ' ') : 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {promotion.type === 'percent_off' 
                              ? `${promotion.value}%` 
                              : promotion.type === 'amount_off' 
                                ? `$${promotion.value}` 
                                : promotion.value}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">
                                Start: {new Date(promotion.startDate).toLocaleDateString()}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                End: {new Date(promotion.endDate).toLocaleDateString()}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isActive ? "default" : "secondary"}>
                              {isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedPromotion(promotion);
                                    setIsEditPromotionDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    if (window.confirm("Are you sure you want to delete this promotion?")) {
                                      deletePromotionMutation.mutate(promotion.id);
                                    }
                                  }}
                                >
                                  <Trash className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Tag className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-lg">No promotions yet</h4>
                      <p className="text-sm text-muted-foreground mb-4">Create your first promotion to attract customers</p>
                      <Button 
                        onClick={() => setIsAddPromotionDialogOpen(true)}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Promotion
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Followers Tab */}
        <TabsContent value="followers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Store Followers</CardTitle>
              <CardDescription>
                Users who follow your store for updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingFollowers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : followers && followers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Follow Date</TableHead>
                      <TableHead>Notification Preferences</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followers.map((follower: any) => (
                      <TableRow key={follower.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{follower.username}</div>
                            <div className="text-sm text-muted-foreground">{follower.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(follower.followDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {follower.notificationPreferences?.promotions && (
                              <Badge variant="outline">Promotions</Badge>
                            )}
                            {follower.notificationPreferences?.newProducts && (
                              <Badge variant="outline">New Products</Badge>
                            )}
                            {follower.notificationPreferences?.priceDrops && (
                              <Badge variant="outline">Price Drops</Badge>
                            )}
                            {follower.notificationPreferences?.restockAlerts && (
                              <Badge variant="outline">Restock Alerts</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={follower.status === "active" ? "default" : "secondary"}
                          >
                            {follower.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No followers yet. When users follow your store, they'll appear here.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Add Product Dialog */}
      <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
        <DialogContent className="max-w-2xl h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Store Product</DialogTitle>
            <DialogDescription>
              Add a new product to your store catalog
            </DialogDescription>
          </DialogHeader>
          
          {storeProfile && (
            <StoreProductForm 
              onSubmit={(values) => {
                // Convert basePrice from number to string to match database schema
                const basePrice = typeof values.basePrice === 'number' 
                  ? values.basePrice.toString() 
                  : String(values.basePrice);
                
                const productData = {
                  ...values,
                  basePrice,
                  // Ensure currentPrice is provided and also a string
                  currentPrice: basePrice // Set currentPrice same as basePrice initially
                };
                
                console.log("Submitting product data:", productData);
                
                apiRequest("POST", "/api/stores/products", productData)
                  .then(res => {
                    if (!res.ok) {
                      // Try to get error message from response
                      return res.json().then(data => {
                        throw new Error(data.error || "Failed to add product");
                      });
                    }
                    return res.json();
                  })
                  .then(() => {
                    setIsAddProductDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ["/api/stores/products"] });
                    toast({
                      title: "Product added",
                      description: "Your product has been added to the store catalog."
                    });
                  })
                  .catch(error => {
                    console.error("Product add error:", error);
                    toast({
                      title: "Error adding product",
                      description: error.message,
                      variant: "destructive"
                    });
                  });
              }}
              defaultValues={{}}
              mode="create"
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Edit Product Dialog */}
      <Dialog open={isEditProductDialogOpen} onOpenChange={setIsEditProductDialogOpen}>
        <DialogContent className="max-w-lg h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product information
            </DialogDescription>
          </DialogHeader>
          
          {storeProfile && selectedProduct && (
            <StoreProductForm 
              onSubmit={(values) => {
                // Convert basePrice from number to string to match database schema
                const basePrice = typeof values.basePrice === 'number' 
                  ? values.basePrice.toString() 
                  : String(values.basePrice);
                
                // For product update, we need to include currentPrice which is required by the database
                // If no currentPrice is provided, use basePrice as the currentPrice
                const currentPrice = selectedProduct.currentPrice || basePrice;
                
                const productData = {
                  ...values,
                  basePrice,
                  currentPrice
                };
                
                console.log("Updating product data:", productData);
                
                apiRequest("PUT", `/api/stores/products/${selectedProduct.id}`, productData)
                  .then(res => {
                    if (!res.ok) {
                      // Try to get error message from response
                      return res.json().then(data => {
                        throw new Error(data.error || "Failed to update product");
                      });
                    }
                    return res.json();
                  })
                  .then(() => {
                    setIsEditProductDialogOpen(false);
                    setSelectedProduct(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/stores/products"] });
                    toast({
                      title: "Product updated",
                      description: "Your product has been updated successfully."
                    });
                  })
                  .catch(error => {
                    console.error("Product update error:", error);
                    toast({
                      title: "Error updating product",
                      description: error.message,
                      variant: "destructive"
                    });
                  });
              }}
              defaultValues={{
                name: selectedProduct.name,
                sku: selectedProduct.sku,
                basePrice: selectedProduct.basePrice,
                currentStock: selectedProduct.currentStock || 0,
                description: selectedProduct.description,
                category: selectedProduct.category,
                imageUrl: selectedProduct.imageUrl || selectedProduct.image_url
              }}
              mode="edit"
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* QR Code Dialog (Store or Product) */}
      <Dialog open={isQRDialogOpen} onOpenChange={() => {
        setIsQRDialogOpen(false);
        if (selectedProduct) setSelectedProduct(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? 'Product QR Code' : 'Store Directory QR Code'}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct 
                ? `Scan this QR code to view ${selectedProduct.name} product details`
                : 'Scan this QR code to access your store\'s product catalog'
              }
            </DialogDescription>
          </DialogHeader>
          
          {storeProfile && (
            <div className="flex flex-col items-center space-y-2">
              <div className="bg-white p-4 rounded-md">
                <QRCodeSVG 
                  value={selectedProduct 
                    ? `${window.location.origin}/store/${storeProfile.slug}/product/${selectedProduct.id}` 
                    : `${window.location.origin}/store/${storeProfile.slug}`
                  }
                  size={180}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div className="text-sm text-muted-foreground text-center mb-2">
                {selectedProduct ? 'Product QR Code' : 'Store Directory QR Code'}
              </div>
              <div className="font-bold text-lg text-center mb-2">
                {selectedProduct ? selectedProduct.name : storeProfile.name}
              </div>
              
              <div className="flex items-center gap-1 text-sm text-primary-600 mb-2">
                <div className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Info className="h-3 w-3 text-primary" />
                </div>
                <span>QR code API endpoint verified</span>
              </div>
              
              <div className="bg-muted/50 p-3 rounded-md w-full text-xs text-muted-foreground mb-1">
                <div>Format: Indented JSON with {selectedProduct ? 'product details' : 'store information'}</div>
                <pre className="mt-2 font-mono">
{selectedProduct ? 
`product: {
  id: ${selectedProduct.id}
  name: "${selectedProduct.name}"
  price: $${selectedProduct.basePrice ? parseFloat(selectedProduct.basePrice).toFixed(2) : "0.00"}
  sku: "${selectedProduct.sku || 'N/A'}"
  category: "${selectedProduct.category || 'Uncategorized'}"
}` :
`storeName: "${storeProfile.name}"
storeId: ${storeProfile.id}
description: "${storeProfile.description || 'No description'}"
status: "${storeProfile.status}"
totalProducts: ${storeProducts?.length || 0}`}
                </pre>
              </div>
              
              <div className="flex gap-2 w-full justify-center mt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => {
                    const url = selectedProduct 
                      ? `${window.location.origin}/store/${storeProfile.slug}/product/${selectedProduct.id}`
                      : `${window.location.origin}/store/${storeProfile.slug}`;
                    navigator.clipboard.writeText(url);
                    toast({
                      title: "Link copied",
                      description: selectedProduct ? "Product URL copied to clipboard" : "Store URL copied to clipboard"
                    });
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" /> Copy Link
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => {
                    const canvas = document.querySelector('.QRCodeSVG canvas') as HTMLCanvasElement;
                    if (canvas) {
                      const link = document.createElement('a');
                      // Use product name for product QR code, store name for store QR code
                      const fileName = selectedProduct && selectedProduct.name
                        ? `${selectedProduct.name.replace(/\s+/g, '-')}-product-qrcode.png`
                        : `${storeProfile?.name ? storeProfile.name.replace(/\s+/g, '-') : 'store'}-store-qrcode.png`;
                      link.download = fileName;
                      link.href = canvas.toDataURL('image/png');
                      link.click();
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-1" /> Save Image
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Add Promotion Dialog */}
      <Dialog open={isAddPromotionDialogOpen} onOpenChange={setIsAddPromotionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Promotion</DialogTitle>
            <DialogDescription>
              Create a new promotional offer for your store
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = {
              name: e.currentTarget.promotionName.value,
              type: e.currentTarget.promotionType.value,
              value: parseFloat(e.currentTarget.promotionValue.value),
              startDate: new Date(e.currentTarget.startDate.value),
              endDate: new Date(e.currentTarget.endDate.value),
              description: e.currentTarget.description.value,
              termsAndConditions: e.currentTarget.termsAndConditions.value
            };
            
            addPromotionMutation.mutate(formData);
          }} className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="promotionName">Promotion Name</Label>
                <Input id="promotionName" name="promotionName" placeholder="Summer Sale" required />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="promotionType">Promotion Type</Label>
                <Select name="promotionType" defaultValue="percent_off">
                  <SelectTrigger>
                    <SelectValue placeholder="Select promotion type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent_off">Percentage Off</SelectItem>
                    <SelectItem value="amount_off">Fixed Amount Off</SelectItem>
                    <SelectItem value="buy_one_get_one">Buy One Get One</SelectItem>
                    <SelectItem value="free_shipping">Free Shipping</SelectItem>
                    <SelectItem value="gift_with_purchase">Gift with Purchase</SelectItem>
                    <SelectItem value="bundle">Bundle Deal</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="promotionValue">Value</Label>
                <Input 
                  id="promotionValue" 
                  name="promotionValue" 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  placeholder="20" 
                  required 
                />
                <p className="text-sm text-muted-foreground">
                  Enter percentage or amount depending on the promotion type
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input 
                    id="startDate" 
                    name="startDate" 
                    type="date" 
                    defaultValue={new Date().toISOString().split('T')[0]}
                    required 
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input 
                    id="endDate" 
                    name="endDate" 
                    type="date" 
                    defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    required 
                  />
                </div>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  name="description" 
                  placeholder="Describe the promotion details..."
                  className="min-h-[80px]"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
                <Textarea 
                  id="termsAndConditions" 
                  name="termsAndConditions" 
                  placeholder="Any specific terms or limitations for this promotion..."
                  className="min-h-[80px]"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddPromotionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addPromotionMutation.isPending}>
                {addPromotionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Promotion
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Promotion Dialog */}
      <Dialog open={isEditPromotionDialogOpen} onOpenChange={setIsEditPromotionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Promotion</DialogTitle>
            <DialogDescription>
              Update your promotional offer
            </DialogDescription>
          </DialogHeader>
          
          {selectedPromotion && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = {
                id: selectedPromotion.id,
                name: e.currentTarget.promotionName.value,
                type: e.currentTarget.promotionType.value,
                value: parseFloat(e.currentTarget.promotionValue.value),
                startDate: new Date(e.currentTarget.startDate.value),
                endDate: new Date(e.currentTarget.endDate.value),
                description: e.currentTarget.description.value,
                termsAndConditions: e.currentTarget.termsAndConditions.value
              };
              
              updatePromotionMutation.mutate(formData);
            }} className="space-y-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="promotionName">Promotion Name</Label>
                  <Input 
                    id="promotionName" 
                    name="promotionName" 
                    defaultValue={selectedPromotion.name}
                    placeholder="Summer Sale" 
                    required 
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="promotionType">Promotion Type</Label>
                  <Select name="promotionType" defaultValue={selectedPromotion.type}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select promotion type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent_off">Percentage Off</SelectItem>
                      <SelectItem value="amount_off">Fixed Amount Off</SelectItem>
                      <SelectItem value="buy_one_get_one">Buy One Get One</SelectItem>
                      <SelectItem value="free_shipping">Free Shipping</SelectItem>
                      <SelectItem value="gift_with_purchase">Gift with Purchase</SelectItem>
                      <SelectItem value="bundle">Bundle Deal</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="promotionValue">Value</Label>
                  <Input 
                    id="promotionValue" 
                    name="promotionValue" 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    defaultValue={selectedPromotion.value}
                    placeholder="20" 
                    required 
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter percentage or amount depending on the promotion type
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input 
                      id="startDate" 
                      name="startDate" 
                      type="date" 
                      defaultValue={new Date(selectedPromotion.startDate).toISOString().split('T')[0]}
                      required 
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input 
                      id="endDate" 
                      name="endDate" 
                      type="date" 
                      defaultValue={new Date(selectedPromotion.endDate).toISOString().split('T')[0]}
                      required 
                    />
                  </div>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    name="description" 
                    defaultValue={selectedPromotion.description || ""}
                    placeholder="Describe the promotion details..."
                    className="min-h-[80px]"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
                  <Textarea 
                    id="termsAndConditions" 
                    name="termsAndConditions" 
                    defaultValue={selectedPromotion.termsAndConditions || ""}
                    placeholder="Any specific terms or limitations for this promotion..."
                    className="min-h-[80px]"
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setIsEditPromotionDialogOpen(false);
                  setSelectedPromotion(null);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePromotionMutation.isPending}>
                  {updatePromotionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Promotion
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
