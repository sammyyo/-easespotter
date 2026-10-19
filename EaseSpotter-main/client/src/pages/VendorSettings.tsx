import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, Settings2, MapPin, Clock, CreditCard, Star, Trash2, AlertTriangle, RefreshCw, UserX, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrencySymbol, currencySymbols } from "@/lib/currency-utils";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { optimizeImage, validateImageSize } from "@/lib/image-utils";

interface VendorFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  businessHours: string;
  paymentTerms: string;
  currencyCode: string;
  notes: string;
}

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

export default function VendorSettings() {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteAccountDialogOpen, setIsDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [locationLabelsForm, setLocationLabelsForm] = useState({
    primary: "Aisle",
    secondary: "Shelf",
  });
    const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Form field refs to capture edited values
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const businessHoursRef = useRef<HTMLInputElement>(null);
  const paymentTermsRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Use auth to get user's vendorId
  const { user, deleteAccountMutation } = useAuth();
  const { setCurrency } = useCurrency();
  const currencyOptions = Object.keys(currencySymbols);

  const { data: storeProfile } = useQuery<any>({
    queryKey: ["/api/stores/profile"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/stores/profile");
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error("Failed to load store profile");
      }
      return response.json();
    },
    retry: false,
  });
  
  // Fetch the vendor data
  const { data: vendor, isLoading, isError } = useQuery<VendorFormData & { id: number }>({
    queryKey: [`/api/vendors/${user?.vendorId}`],
    retry: 1,
    enabled: !!user?.vendorId // Only run query if vendor ID is available
  });

  // Create a local state for selected vendor, initialized with a loading state
  const [selectedVendor, setSelectedVendor] = useState<VendorFormData>({
    name: "",
    email: "",
    phone: "",
    address: "",
    businessHours: "",
    paymentTerms: "",
    currencyCode: "USD",
    notes: "",
  });

  // Update selected vendor when data is loaded
  useEffect(() => {
    if (vendor) {
      setSelectedVendor({
        name: vendor.name,
        email: vendor.email || "",
        phone: vendor.phone || "",
        address: vendor.address || "",
        businessHours: vendor.businessHours || "",
        paymentTerms: vendor.paymentTerms || "",
        currencyCode: vendor.currencyCode || "USD",
        notes: vendor.notes || "",
      });
      if (vendor.currencyCode) {
        setCurrency(vendor.currencyCode);
      }
    }
  }, [vendor]);

  useEffect(() => {
    const locationLabels = getStoreLocationLabels(storeProfile);
    setLocationLabelsForm(locationLabels);
  }, [storeProfile]);

  // Check database connection status
  const { data: dbStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/status/database'],
    refetchInterval: 5000, // Retry every 5 seconds
    initialData: { connected: true } // Default to true to allow editing
  });

  // Track form data for editing
  const [editFormData, setEditFormData] = useState<VendorFormData>(selectedVendor);
  
  // Update form data when dialog opens
  useEffect(() => {
    if (isEditOpen) {
      setEditFormData(selectedVendor);
    }
  }, [isEditOpen, selectedVendor]);

  // Handle form field changes
const handleFormChange = (field: keyof VendorFormData, value: string) => {
  setEditFormData(prev => ({
    ...prev,
    [field]: value
  }));
  if (field === 'currencyCode') {
    setCurrency(value);
  }
};

  // Mutation for updating vendor
  const updateVendorMutation = useMutation({
    mutationFn: async (updatedVendor: VendorFormData) => {
      const response = await apiRequest("PATCH", `/api/vendors/${user?.vendorId}`, updatedVendor);
      
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || 'Failed to update vendor information');
      }
      
      return await response.json();
    },
    onSuccess: (updatedVendor) => {
      // Invalidate and refetch the vendor data
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${user?.vendorId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] });
      queryClient.setQueryData(["/api/user"], (currentUser: any) => (
        currentUser ? { ...currentUser, vendorName: updatedVendor.name } : currentUser
      ));
      
      // Show success toast
      toast({
        title: "Vendor updated",
        description: "Vendor information has been successfully updated in the database.",
      });
      
      // Close the dialog
      setIsEditOpen(false);
    },
    onError: (error) => {
      console.error('Failed to update vendor:', error);
      
      // Show error toast
      toast({
        title: "Update failed",
        description: "Failed to update vendor information. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateLocationLabelsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/profile", {
        name: storeProfile?.name || selectedVendor.name || "Store",
        description: storeProfile?.description || "",
        website: storeProfile?.website || "",
        contactEmail: storeProfile?.contactEmail || selectedVendor.email || "",
        themeColor: storeProfile?.themeColor || "#FFFFFF",
        integrationType: storeProfile?.integrationType || "manual",
        locationLabelPrimary: locationLabelsForm.primary,
        locationLabelSecondary: locationLabelsForm.secondary,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update product location labels");
      }

      return response.json();
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["/api/stores/profile"], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      toast({
        title: "Location labels updated",
        description: "Product location labels have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStoreLogoMutation = useMutation({
    mutationFn: async (logoDataUrl: string) => {
      const response = await apiRequest("POST", "/api/stores/profile", {
        name: storeProfile?.name || selectedVendor.name || "Store",
        description: storeProfile?.description || "",
        website: storeProfile?.website || "",
        contactEmail: storeProfile?.contactEmail || selectedVendor.email || "",
        themeColor: storeProfile?.themeColor || "#FFFFFF",
        integrationType: storeProfile?.integrationType || "manual",
        bannerUrl: storeProfile?.bannerUrl || "",
        brandImageUrl: logoDataUrl,
        locationLabelPrimary: locationLabelsForm.primary,
        locationLabelSecondary: locationLabelsForm.secondary,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update store logo");
      }

      return response.json();
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["/api/stores/profile"], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] });

      toast({
        title: "Logo updated",
        description: "Your store logo has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStoreLogoUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) return;

      if (!validateImageSize(file, 500)) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 500KB.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Processing image",
        description: "Optimizing and uploading your logo...",
      });

      optimizeImage(file, 200, 200, 0.85, "webp")
        .then((optimizedFile) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            updateStoreLogoMutation.mutate(reader.result as string);
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
    };
    input.click();
  };
  
  // Mutation for deleting vendor
  const deleteVendorMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/vendors/${user?.vendorId}`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || error?.error || 'Failed to delete store');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      // Show success toast
      toast({
        title: "Store deleted",
        description: "Your store has been successfully deleted.",
      });
      
      // Redirect to the root page
      navigate('/', { replace: true });
    },
    onError: (error) => {
      console.error('Failed to delete store:', error);
      
      // Show error toast
      toast({
        title: "Deletion failed",
        description: "Failed to delete your store. Please try again.",
        variant: "destructive",
      });
      
      // Close the dialog
      setIsDeleteDialogOpen(false);
    },
  });

  const handleEditVendor = () => {
    // Use the controlled form data instead of refs
    const updatedVendor = {
      name: editFormData.name,
      email: editFormData.email,
      phone: editFormData.phone,
      address: editFormData.address,
      businessHours: editFormData.businessHours,
      paymentTerms: editFormData.paymentTerms,
      currencyCode: editFormData.currencyCode,
      notes: editFormData.notes,
    };

    // Update local state right away for better UX
    setSelectedVendor(updatedVendor);
    setCurrency(updatedVendor.currencyCode);

    // Submit mutation to update in database
    updateVendorMutation.mutate(updatedVendor);
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAccountMutation.mutateAsync();
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
      });
      navigate("/", { replace: true });
    } catch (error) {
      toast({
        title: "Deletion failed",
        description: "Failed to delete your account. Please try again.",
        variant: "destructive",
      });
    }
  };


  const renderStoreLogoCard = () => {
    const storeLogoUrl = typeof storeProfile?.logoUrl === "string" &&
      !storeProfile.logoUrl.includes("/src/assets/") &&
      !storeProfile.logoUrl.includes("client/src/assets/")
      ? storeProfile.logoUrl
      : "";

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Store Logo
          </CardTitle>
          <CardDescription>
            Upload the logo used in your store profile, QR codes, and dashboard header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-md border p-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {storeLogoUrl ? (
                  <img
                    src={storeLogoUrl}
                    alt={`${storeProfile?.name || selectedVendor.name || "Store"} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Store className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {storeProfile?.name || selectedVendor.name || "Store"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Recommended: square image under 500KB.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleStoreLogoUpload}
              disabled={updateStoreLogoMutation.isPending || !dbStatus?.connected}
            >
              {updateStoreLogoMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {updateStoreLogoMutation.isPending ? "Uploading..." : "Upload Logo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderProductLocationLabelsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Product Location Labels
        </CardTitle>
        <CardDescription>
          Rename the two location fields vendors use when adding products.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="primary-location-label">Primary location label</Label>
            <Select
              value={getLocationLabelSelectValue(locationLabelsForm.primary, primaryLocationLabelOptions)}
              onValueChange={(value) => {
                setLocationLabelsForm((current) => ({
                  ...current,
                  primary: value === "other" ? "" : value,
                }));
              }}
            >
              <SelectTrigger id="primary-location-label">
                <SelectValue placeholder="Choose label" />
              </SelectTrigger>
              <SelectContent>
                {primaryLocationLabelOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {getLocationLabelSelectValue(locationLabelsForm.primary, primaryLocationLabelOptions) === "other" && (
              <Input
                value={locationLabelsForm.primary}
                placeholder="Enter your label"
                onChange={(event) => {
                  setLocationLabelsForm((current) => ({
                    ...current,
                    primary: event.target.value,
                  }));
                }}
              />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="secondary-location-label">Secondary location label</Label>
            <Select
              value={getLocationLabelSelectValue(locationLabelsForm.secondary, secondaryLocationLabelOptions)}
              onValueChange={(value) => {
                setLocationLabelsForm((current) => ({
                  ...current,
                  secondary: value === "other" ? "" : value,
                }));
              }}
            >
              <SelectTrigger id="secondary-location-label">
                <SelectValue placeholder="Choose label" />
              </SelectTrigger>
              <SelectContent>
                {secondaryLocationLabelOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {getLocationLabelSelectValue(locationLabelsForm.secondary, secondaryLocationLabelOptions) === "other" && (
              <Input
                value={locationLabelsForm.secondary}
                placeholder="Enter your label"
                onChange={(event) => {
                  setLocationLabelsForm((current) => ({
                    ...current,
                    secondary: event.target.value,
                  }));
                }}
              />
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => updateLocationLabelsMutation.mutate()}
            disabled={
              updateLocationLabelsMutation.isPending ||
              !locationLabelsForm.primary.trim() ||
              !locationLabelsForm.secondary.trim()
            }
          >
            {updateLocationLabelsMutation.isPending ? "Saving..." : "Save Location Labels"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Function to render loading state
  const renderLoadingState = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              <Skeleton className="h-6 w-40" />
            </div>
            <Skeleton className="h-6 w-16" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <div className="pt-2">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            <Skeleton className="h-6 w-44" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );

  // Function to render error state
  const renderErrorState = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Vendor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">Failed to load vendor information from the server.</p>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            className="w-full"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // Function to render vendor card
  const renderVendorCard = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              <span>{selectedVendor.name}</span>
            </div>
            <Badge variant="secondary">Active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Address:</span>
                <span>{selectedVendor.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Hours:</span>
                <span>{selectedVendor.businessHours}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Payment Terms:</span>
                <span>{selectedVendor.paymentTerms}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Currency:</span>
                <span>{selectedVendor.currencyCode}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-muted-foreground">Rating:</span>
                <span>4.8/5.0</span>
              </div>
              <div className="pt-2">
                <Label className="text-sm text-muted-foreground">Contact Info:</Label>
                <div className="grid gap-1 mt-1">
                  <span className="text-sm">{selectedVendor.email}</span>
                  <span className="text-sm">{selectedVendor.phone}</span>
                </div>
              </div>
            </div>



            <div className="space-y-4">
              <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Edit Vendor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Edit Vendor Information</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Vendor Name</Label>
                      <Input
                        id="name"
                        ref={nameRef}
                        value={editFormData.name}
                        placeholder="Enter vendor name"
                        onChange={(e) => handleFormChange('name', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="email">Contact Email</Label>
                        <Input
                          id="email"
                          ref={emailRef}
                          type="email"
                          value={editFormData.email}
                          placeholder="vendor@example.com"
                          onChange={(e) => handleFormChange('email', e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">Contact Phone</Label>
                        <Input
                          id="phone"
                          ref={phoneRef}
                          value={editFormData.phone}
                          placeholder="+1 (555) 000-0000"
                          onChange={(e) => handleFormChange('phone', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="address">Store Address</Label>
                      <Textarea
                        id="address"
                        ref={addressRef}
                        value={editFormData.address}
                        placeholder="Enter complete store address"
                        className="min-h-[80px]"
                        onChange={(e) => handleFormChange('address', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="businessHours">Business Hours</Label>
                        <Input
                          id="businessHours"
                          ref={businessHoursRef}
                          value={editFormData.businessHours}
                          placeholder="Mon-Fri: 9AM-5PM"
                          onChange={(e) => handleFormChange('businessHours', e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="paymentTerms">Payment Terms</Label>
                        <Input
                          id="paymentTerms"
                          ref={paymentTermsRef}
                          value={editFormData.paymentTerms}
                          placeholder="Net 30"
                          onChange={(e) => handleFormChange('paymentTerms', e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="currency">Currency</Label>
                        <Select
                          value={editFormData.currencyCode}
                          onValueChange={(value) => handleFormChange('currencyCode', value)}
                        >
                          <SelectTrigger id="currency" ref={currencyRef}>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {currencyOptions.map(code => (
                              <SelectItem key={code} value={code}>
                                {code} ({getCurrencySymbol(code)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Additional Notes</Label>
                      <Textarea
                        id="notes"
                        ref={notesRef}
                        value={editFormData.notes}
                        placeholder="Enter any additional information about the vendor"
                        className="min-h-[80px]"
                        onChange={(e) => handleFormChange('notes', e.target.value)}
                      />
                    </div>
                    {!dbStatus?.connected && (
                      <div className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                        Database connection is currently unavailable. Changes cannot be saved at this moment.
                      </div>
                    )}
                    <Button
                      onClick={handleEditVendor}
                      className="w-full"
                      disabled={!dbStatus?.connected || updateVendorMutation.isPending}
                    >
                      {updateVendorMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Store
              </Button>
              
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your store
                      and all its data including products, prices, rules, and analytics information.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="confirm" className="text-destructive font-semibold">
                        Type "{selectedVendor.name}" to confirm deletion
                      </Label>
                      <Input
                        id="confirm"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder={`Type ${selectedVendor.name} to confirm`}
                        className={
                          deleteConfirmText !== selectedVendor.name
                            ? "border-destructive"
                            : ""
                        }
                      />
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={() => deleteVendorMutation.mutate()}
                      disabled={
                        deleteConfirmText !== selectedVendor.name ||
                        deleteVendorMutation.isPending ||
                        !dbStatus?.connected
                      }
                    >
                      {deleteVendorMutation.isPending ? "Deleting..." : "Delete Store"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={isDeleteAccountDialogOpen} onOpenChange={setIsDeleteAccountDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10">
                    <UserX className="h-4 w-4 mr-2" />
                    Delete Account Permanently
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-destructive">Permanently Delete Your Account</DialogTitle>
                    <DialogDescription>
                      This deletes your user account, not just your store.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Warning: This action cannot be undone</AlertTitle>
                      <AlertDescription>
                        Deleting your account will remove your login and personal account data from the system.
                      </AlertDescription>
                    </Alert>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteAccountDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={deleteAccountMutation.isPending}
                    >
                      {deleteAccountMutation.isPending && (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Permanently Delete My Account
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>
      {renderProductLocationLabelsCard()}
      {renderStoreLogoCard()}
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Vendor Settings</h1>

      {/* Vendor Cards */}
      {isLoading ? renderLoadingState() : 
       isError ? renderErrorState() : 
       renderVendorCard()}
    </div>
  );
}
