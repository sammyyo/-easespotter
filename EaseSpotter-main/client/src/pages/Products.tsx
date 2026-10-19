import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ProductTable from "@/components/products/ProductTable";
import { Button } from "@/components/ui/button";
import { Plus, FileDown, Tag, Percent, Edit, Trash2, QrCode, Store, Printer, Copy, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PriceHistoryChart from "@/components/products/PriceHistoryChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Keyboard } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { CompetitorAnalysis } from "@/components/analytics/CompetitorAnalysis";
import { PromotionForm } from "@/components/products/PromotionForm";
import { RestockSuggestions } from "@/components/products/RestockSuggestions";
import { useCurrency } from "@/hooks/use-currency";
import type { ExportableProduct } from "@/lib/export";
import { exportToCSV, exportToPDF } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { ProductForm } from "@/components/products/ProductForm";
import { StoreProductForm } from "@/components/products/StoreProductForm";
import { StoreDirectoryQRCode } from "@/components/products/StoreDirectoryQRCode";
import { createLogoDataUrl } from "@/lib/qr-logo";
import { apiRequest } from "@/lib/queryClient";

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

// Update Product interface to include currentStock
interface Product {
  id: number;
  name: string;
  brand?: string | null;
  sku: string;
  barcode?: string | null;
  basePrice: string;
  currentPrice: string;
  currentStock: number;
  description?: string;
  category: string;
  aisle: string;
  shelf: string;
  updatedAt: string;
  image?: string;
}

interface Promotion {
  id: number;
  name: string;
  discountPercent: number;
  startDate: string;
  endDate: string;
  appliedProducts: number[];
  products?: Array<{
    id: number;
    name: string;
    imageUrl?: string | null;
    image?: string | null;
    productImageUrl?: string | null;
    originalPrice?: number;
    salePrice?: number;
    stock?: number;
    currentStock?: number;
    inStock?: boolean;
  }>;
  imageUrl?: string | null;
  status: 'active' | 'scheduled' | 'expired';
}

export default function Products() {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreatePromotionDialogOpen, setIsCreatePromotionDialogOpen] = useState(false);
  const [isEditPromotionDialogOpen, setIsEditPromotionDialogOpen] = useState(false);
  const [productsSectionView, setProductsSectionView] = useState<"catalog" | "promotions">("catalog");
  const [selectedProductForAnalysis, setSelectedProductForAnalysis] = useState<number | null>(null);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [qrCodeType, setQRCodeType] = useState<'product' | 'store'>('product');
  const [storeId, setStoreId] = useState<number | null>(null);
  const [storeType, setStoreType] = useState<string>('physical'); // Default to physical store
  const { currency } = useCurrency();
  
  // Define StoreDirectoryData interface
  interface StoreDirectoryData {
    vendorId: number;
    vendorName: string;
    totalProducts: number;
    timestamp: string;
    productsByCategory: Record<string, Array<Product>>;
    productsByAisle: Record<string, Array<Product>>;
    logoUrl?: string | null;
  }
  
  const [storeDirectoryData, setStoreDirectoryData] = useState<StoreDirectoryData | null>(null);
  const [storeDirectoryLogo, setStoreDirectoryLogo] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [location, navigate] = useLocation();
  
  // Parse URL parameters for storeId and action
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeIdParam = params.get('storeId');
    const actionParam = params.get('action');
    
    console.log("URL Parameters:", { storeId: storeIdParam, action: actionParam });
    
    // Handle storeId parameter
    if (storeIdParam) {
      const parsedStoreId = parseInt(storeIdParam);
      console.log("Set storeId to:", parsedStoreId);
      setStoreId(parsedStoreId);
    }
    
    // Handle action parameter
    if (actionParam) {
      switch (actionParam) {
        case 'create':
          setIsCreateDialogOpen(true);
          break;
        case 'generateQR':
          setQRCodeType('store');
          setIsQRDialogOpen(true);
          // Remove action parameter from URL to prevent dialog from reopening on refresh
          if (storeIdParam) {
            navigate(`/products?storeId=${storeIdParam}`);
          } else {
            navigate('/products');
          }
          break;
        default:
          // Unknown action, do nothing
          break;
      }
    }
  }, []);

  // Update the query section within the Products component
  const { data: productsData = [], isLoading, error } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/products");
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const fallbackResponse = await apiRequest("GET", "/api/pos/products?limit=100");
        const fallbackData = await fallbackResponse.json().catch(() => null);

        if (fallbackResponse.ok && Array.isArray(fallbackData?.products)) {
          return fallbackData.products;
        }

        throw new Error(data?.message || data?.error || "Failed to fetch products");
      }

      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000, // 1 minute - longer stale time improves perceived performance
    refetchInterval: 30000, // Add periodic refetch
    retry: 2,
    refetchOnMount: "always", // Always refetch data when component mounts
    initialData: [], // Start with empty array to avoid undefined
    placeholderData: [], // Use empty array as placeholder while loading
  });
  const products = Array.isArray(productsData) ? productsData : [];
  
  // Query for store profile data to get store type
  const { data: storeProfile } = useQuery<any>({
    queryKey: ["/api/stores/profile"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/stores/profile");
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
    retry: false,
  });
  const storeLocationLabels = getStoreLocationLabels(storeProfile);
  const locationLabelPrimary = storeLocationLabels.primary;
  const locationLabelSecondary = storeLocationLabels.secondary;
  
  // Debug store profile data
  useEffect(() => {
    console.log("Store profile data:", storeProfile);
  }, [storeProfile]);

  // Update storeType when storeProfile changes
  useEffect(() => {
    if (storeProfile && storeProfile.storeType) {
      // Store type can be 'physical', 'website', 'marketplace', etc.
      const type = storeProfile.storeType.toLowerCase();
      console.log("Original store type from profile:", storeProfile.storeType);
      
      // Map store type to our expected value
      if (type === 'website' || type === 'online' || type === 'web') {
        setStoreType('website');
        console.log("Set store type to website");
      } else {
        setStoreType('physical');
        console.log("Set store type to physical");
      }
    }
  }, [storeProfile]);

  console.log('Products data:', products); // Add logging to debug

  const createProductMutation = useMutation({
    mutationFn: async (formData: any) => {
      const response = await apiRequest("POST", "/api/products", {
        ...formData,
        image: formData.image ?? formData.imageUrl,
        currentPrice: formData.basePrice,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create product");
      }
      return response.json();
    },
    onSuccess: (createdProduct, submittedProduct) => {
      const normalizedProduct = {
        ...createdProduct,
        brand: createdProduct.brand ?? submittedProduct.brand ?? null,
        image: createdProduct.imageUrl || createdProduct.image || null,
      };

      queryClient.setQueryData(["/api/products"], (oldData: Product[] | undefined) => {
        const existingProducts = Array.isArray(oldData) ? oldData : [];
        const alreadyExists = existingProducts.some((product) => product.id === normalizedProduct.id);

        return alreadyExists
          ? existingProducts.map((product) => product.id === normalizedProduct.id ? normalizedProduct : product)
          : [normalizedProduct, ...existingProducts];
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.refetchQueries({ queryKey: ["/api/products"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Product created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...formData }: { id: number } & Partial<Product>) => {
      const response = await apiRequest("PATCH", `/api/products/${id}`, formData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update product");
      }
      return response.json();
    },
    onSuccess: (updatedProduct, submittedProduct) => {
      // Map imageUrl to image property for consistency with the frontend model
      const normalizedProduct = {
        ...updatedProduct,
        brand: updatedProduct.brand ?? submittedProduct.brand ?? null,
        image: updatedProduct.imageUrl || updatedProduct.image
      };
      
      queryClient.setQueryData(["/api/products"], (oldData: Product[] | undefined) => {
        if (!oldData) return [normalizedProduct];
        return oldData.map(product =>
          product.id === normalizedProduct.id ? normalizedProduct : product
        );
      });

      // Explicitly invalidate the query to force a refetch
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.refetchQueries({ queryKey: ["/api/products"] });
      
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update product",
        variant: "destructive",
      });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      const response = await apiRequest("DELETE", `/api/products/${productId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "Failed to delete product");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      toast({
        title: "Success",
        description: "Product deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  const handlePriceHistory = (productId: number) => {
    setSelectedProductId(productId);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsEditDialogOpen(true);
  };

  const handleNewProduct = (formData: any) => {
    // Check if formData.image is already a base64 string
    if (typeof formData.image === 'string') {
      createProductMutation.mutate({
        ...formData,
        image: formData.image,
      });
    } 
    // Check if it's a FileList with files
    else if (formData.image instanceof FileList && formData.image.length > 0) {
      const reader = new FileReader();
      reader.readAsDataURL(formData.image[0]);
      reader.onloadend = () => {
        const base64Data = reader.result as string;
        createProductMutation.mutate({
          ...formData,
          image: base64Data,
        });
      };
    } 
    // No image, just submit the data as is
    else {
      createProductMutation.mutate(formData);
    }
  };

  const handleUpdateProduct = (formData: any) => {
    if (!editingProduct) return;

    console.log("Updating product with form data:", formData);
    console.log("Form data image type:", typeof formData.image);
    console.log("currentStock value:", formData.currentStock);
    
    // Ensure currentStock is properly included in the update
    // If it's not defined in the form, use the existing value
    const currentStock = formData.currentStock !== undefined 
      ? formData.currentStock 
      : editingProduct.currentStock;
      
    const updateData = { 
      ...formData,
      brand: typeof formData.brand === "string" ? formData.brand.trim() : formData.brand ?? null,
      currentStock,
      id: editingProduct.id 
    };
    
    // If form data contains a string (base64 image from our custom form handler)
    if (typeof formData.image === 'string') {
      console.log("Using base64 image string from form");
      updateProductMutation.mutate(updateData);
    } 
    // If a new file is uploaded
    else if (formData.image?.[0]) {
      console.log("Converting new file to base64");
      try {
        const file = formData.image[0];
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          updateProductMutation.mutate({
            ...updateData,
            image: base64Data,
          });
        };
      } catch (error) {
        console.error("Error reading file for update:", error);
        // If there's an error, try to continue with existing image if available
        if (editingProduct.image) {
          updateProductMutation.mutate({
            ...updateData,
            image: editingProduct.image
          });
        } else {
          updateProductMutation.mutate(updateData);
        }
      }
    } 
    // No new file but using existing image
    else if (formData.image === undefined && editingProduct.image) {
      console.log("Using existing image from editingProduct");
      updateProductMutation.mutate({
        ...updateData,
        image: editingProduct.image
      });
    } 
    // No image at all
    else {
      console.log("No image data found");
      updateProductMutation.mutate(updateData);
    }
  };

  const handleDeleteProduct = (productId: number) => {
    deleteProductMutation.mutate(productId);
  };

  const handleExport = (format: 'csv' | 'pdf') => {
    if (!products.length) {
      toast({
        title: "No data to export",
        description: "Add some products first before exporting.",
        variant: "destructive",
      });
      return;
    }

    const exportData: ExportableProduct[] = products.map(product => ({
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      barcode: product.barcode,
      basePrice: product.basePrice,
      currentPrice: product.currentPrice,
      category: product.category,
      aisle: product.aisle,
      shelf: product.shelf,
    }));

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `products-${timestamp}`;

    try {
      if (format === 'csv') {
        exportToCSV(exportData, filename);
      } else {
        exportToPDF(exportData, filename);
      }
      toast({
        title: "Export successful",
        description: `Products exported as ${format.toUpperCase()} successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export products. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Query for promotions from the server
  const { data: promotions = [], isLoading: isLoadingPromotions } = useQuery<Promotion[]>({
    queryKey: ["/api/promotions"],
    staleTime: 30000,
    refetchInterval: 30000,
    retry: 2,
  });
  
  // Set the active promotions state based on the query data
  const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
  
  // Update local state when promotions data changes
  useEffect(() => {
    setActivePromotions(promotions);
  }, [promotions]);
  
  // Process URL parameters (storeId, action) when location changes
  useEffect(() => {
    // Parse URL search parameters
    const searchParams = new URLSearchParams(window.location.search);
    const storeIdParam = searchParams.get('storeId');
    const actionParam = searchParams.get('action');
    
    console.log("URL Parameters:", { storeId: storeIdParam, action: actionParam });
    
    // Handle storeId parameter
    if (storeIdParam) {
      const parsedStoreId = parseInt(storeIdParam, 10);
      if (!isNaN(parsedStoreId)) {
        setStoreId(parsedStoreId);
        console.log("Set storeId to:", parsedStoreId);
      }
    }
    
    // Handle action parameter
    if (actionParam) {
      switch(actionParam) {
        case 'addProduct':
          setIsCreateDialogOpen(true);
          break;
        case 'create': // For backwards compatibility
          setIsCreateDialogOpen(true);
          break;
        case 'generateQR':
          setIsQRDialogOpen(true);
          setQRCodeType('store');
          // Remove action parameter from URL to prevent dialog from reopening on refresh
          if (storeIdParam) {
            navigate(`/products?storeId=${storeIdParam}`);
          } else {
            navigate('/products');
          }
          break;
        case 'managePromotions':
          setIsCreatePromotionDialogOpen(true);
          break;
        default:
          // Unknown action, do nothing
          break;
      }
    }
  }, [location]);

  useKeyboardShortcuts({
    'ctrl+n': (e) => {
      e.preventDefault();
      setIsCreateDialogOpen(true);
    },
    'ctrl+f': (e) => {
      e.preventDefault();
      searchInputRef.current?.focus();
    },
    'ctrl+r': (e) => {
      e.preventDefault();
    },
    'ctrl+e': (e) => {
      e.preventDefault();
      if (products.length > 0) {
        handleExport('csv');
      }
    },
  });

  const shortcuts = [
    { key: '⌘/Ctrl + N', action: 'New Product' },
    { key: '⌘/Ctrl + F', action: 'Focus Search' },
    { key: '⌘/Ctrl + R', action: 'Reset Filters' },
    { key: '⌘/Ctrl + E', action: 'Export (CSV)' },
  ];


  // Add mutation for creating promotions
  const createPromotionMutation = useMutation({
    mutationFn: async (formData: any) => {
      console.log("Sending promotion creation request with data:", formData);
      
      try {
        const response = await fetch("/api/promotions", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        console.log("Promotion creation response status:", response.status);
        
        if (!response.ok) {
          // Try to get more error details
          const errorText = await response.text();
          console.error("Server error response:", errorText);
          throw new Error(`Failed to create promotion: ${errorText}`);
        }
        
        const data = await response.json();
        console.log("Promotion created successfully:", data);
        return data;
      } catch (error) {
        console.error("Error creating promotion:", error);
        throw error;
      }
    },
    onSuccess: (newPromotion) => {
      console.log("Successfully created promotion:", newPromotion);
      // Update both local state and query cache
      setActivePromotions(prev => [...prev, newPromotion]);
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      setIsCreatePromotionDialogOpen(false);
      toast({
        title: "Success",
        description: "Promotion created successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Promotion creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create promotion",
        variant: "destructive",
      });
    },
  });
  
  // Add mutation for updating promotions
  const updatePromotionMutation = useMutation({
    mutationFn: async (formData: any) => {
      console.log("Sending promotion update request with data:", formData);
      const promotionId = editingPromotion?.id;
      
      if (!promotionId) {
        throw new Error("Missing promotion ID");
      }
      
      try {
        const response = await fetch(`/api/promotions/${promotionId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });
        
        console.log("Promotion update response status:", response.status);
        
        if (!response.ok) {
          // Try to get more error details
          const errorText = await response.text();
          console.error("Server error response:", errorText);
          throw new Error(`Failed to update promotion: ${errorText}`);
        }
        
        const data = await response.json();
        console.log("Promotion updated successfully:", data);
        return data;
      } catch (error) {
        console.error("Error updating promotion:", error);
        throw error;
      }
    },
    onSuccess: (updatedPromotion) => {
      console.log("Successfully updated promotion:", updatedPromotion);
      // Update both local state and query cache
      setActivePromotions(prev => 
        prev.map(p => p.id === updatedPromotion.id ? updatedPromotion : p)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      setIsEditPromotionDialogOpen(false);
      setEditingPromotion(null);
      toast({
        title: "Success",
        description: "Promotion updated successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Promotion update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update promotion",
        variant: "destructive",
      });
    },
  });
  
  // Add mutation for deleting promotions
  const deletePromotionMutation = useMutation({
    mutationFn: async (promotionId: number) => {
      console.log("Sending promotion delete request for ID:", promotionId);
      
      try {
        const response = await fetch(`/api/promotions/${promotionId}`, {
          method: "DELETE",
          credentials: "include",
        });
        
        console.log("Promotion delete response status:", response.status);
        
        if (!response.ok) {
          // Try to get more error details
          const errorText = await response.text();
          console.error("Server error response:", errorText);
          throw new Error(`Failed to delete promotion: ${errorText}`);
        }
        
        const data = await response.json();
        console.log("Promotion deleted successfully:", data);
        return data;
      } catch (error) {
        console.error("Error deleting promotion:", error);
        throw error;
      }
    },
    onSuccess: (deletedPromotion) => {
      console.log("Successfully deleted promotion:", deletedPromotion);
      // Update local state
      setActivePromotions(prev => 
        prev.filter(p => p.id !== deletedPromotion.id)
      );
      // Update query cache
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      setIsEditPromotionDialogOpen(false);
      setEditingPromotion(null);
      toast({
        title: "Success",
        description: "Promotion deleted successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Promotion deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete promotion",
        variant: "destructive",
      });
    },
  });

  // Add handler for promotion creation
  const handleCreatePromotion = (formData: any) => {
    console.log("Creating promotion with form data:", formData);
    
    // Convert string dates to proper Date objects for the server
    // and add status field to match database expectation
    const startDate = new Date(formData.startDate + "T00:00:00Z");
    const endDate = new Date(formData.endDate + "T23:59:59Z");
    const now = new Date();
    
    const updatedFormData = {
      ...formData,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      discountPercent: parseFloat(formData.discountPercent.toString()), // Ensure it's a number
      status: startDate > now ? 'scheduled' : 'active',
    };
    
    console.log("Submitting promotion data:", updatedFormData);
    createPromotionMutation.mutate(updatedFormData);
  };
  
  // Add handler for promotion updates
  const handleUpdatePromotion = (formData: any) => {
    console.log("Updating promotion with form data:", formData);
    
    if (!editingPromotion) {
      toast({
        title: "Error",
        description: "No promotion selected for update",
        variant: "destructive",
      });
      return;
    }
    
    // Convert string dates to proper Date objects for the server
    // and update status field based on current date
    const startDate = new Date(formData.startDate + "T00:00:00Z");
    const endDate = new Date(formData.endDate + "T23:59:59Z");
    const now = new Date();
    
    let status: 'active' | 'scheduled' | 'expired' = 'active';
    if (startDate > now) {
      status = 'scheduled';
    } else if (endDate < now) {
      status = 'expired';
    }
    
    const updatedFormData = {
      ...formData,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      discountPercent: parseFloat(formData.discountPercent.toString()), // Ensure it's a number
      status,
    };
    
    console.log("Submitting updated promotion data:", updatedFormData);
    updatePromotionMutation.mutate(updatedFormData);
  };

  const parsePromotionProductIds = (value: unknown): number[] => {
    if (Array.isArray(value)) {
      return value.map(Number).filter(Number.isFinite);
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
      } catch {
        return [];
      }
    }

    return [];
  };

  const getPromotionProducts = (promo: Promotion) => {
    if (Array.isArray(promo.products) && promo.products.length > 0) {
      return promo.products.map((product) => ({
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl || product.image || product.productImageUrl || null,
        originalPrice: product.originalPrice,
        salePrice: product.salePrice,
      }));
    }

    return parsePromotionProductIds(promo.appliedProducts)
      .map((id) => {
        const product = products.find((item) => Number(item.id) === Number(id));
        const originalPrice = product ? Number(product.currentPrice || product.basePrice) : 0;
        const discount = Number(promo.discountPercent) || 0;
        return {
          id,
          name: product?.name || `Product #${id}`,
          imageUrl: product?.imageUrl || null,
          originalPrice: product ? originalPrice : undefined,
          salePrice: product ? Math.round(originalPrice * (1 - discount / 100) * 100) / 100 : undefined,
        };
      })
      .filter(Boolean) as Array<{
        id: number;
        name: string;
        imageUrl?: string | null;
        originalPrice?: number;
        salePrice?: number;
      }>;
  };

  const promotedProductRows = activePromotions
    .filter((promo) => {
      const status = String(promo.status || "").toLowerCase();
      return status !== "expired" && status !== "inactive" && status !== "cancelled";
    })
    .flatMap((promo) => getPromotionProducts(promo).map((product) => ({
      ...product,
      promotionId: promo.id,
      promotionName: promo.name,
      discountPercent: promo.discountPercent,
      status: promo.status,
      endDate: promo.endDate,
      promotion: promo,
    })));
  const activePromotionPreview = activePromotions
    .filter((promo) => promo.status === "active")
    .slice(0, 1);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Products</h1>
        
        {/* Store QR Code Dialog */}
        <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => {
                setQRCodeType('store');
                setIsQRDialogOpen(true);
                
                // Fetch the store directory data when opening the dialog - always include storeId
                const currentUser = queryClient.getQueryData<any>(['/api/user']);
                const userVendorId = currentUser?.vendorId;
                // Use storeId from URL param first, then user's vendorId as fallback
                const vendorIdToUse = storeId || userVendorId;
                
                if (!vendorIdToUse) {
                  toast({
                    title: 'Error',
                    description: 'No store ID available. Please set up a store first.',
                    variant: 'destructive',
                  });
                  return;
                }

                setStoreDirectoryLogo("");
                (async () => {
                  try {
                    const response = await fetch(`/api/qr/store-directory?storeId=${vendorIdToUse}`, {
                      credentials: "include",
                    });
                    if (!response.ok) {
                      throw new Error("Failed to fetch store directory data");
                    }
                    const data = await response.json();
                    const directoryData = data.data || data;
                    setStoreDirectoryData(directoryData);
                    const logo = await createLogoDataUrl({
                      logoUrl: directoryData.logoUrl,
                      vendorName: directoryData.vendorName || "EaseSpotter",
                    });
                    setStoreDirectoryLogo(logo);
                  } catch (error) {
                    console.error("Error fetching store directory data:", error);
                    toast({
                      title: "Error",
                      description: "Failed to load store directory data",
                      variant: "destructive",
                    });
                  }
                })();
              }} 
              className="gap-2" 
              variant="default"
            >
              <Store className="h-4 w-4" />
              Store Directory QR Code
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md md:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Store Directory QR Code</DialogTitle>
              <DialogDescription>
                Generate a QR code for the complete store product directory with locations.
              </DialogDescription>
            </DialogHeader>
            
            <div className="mt-6 flex flex-col space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Store Directory QR Code</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <div id="store-directory-print-container" className="bg-white p-4 rounded-md">
                      <QRCodeSVG
                        id="store-directory-qr-code"
                        value={`${window.location.origin}/api/qr/store-directory?storeId=${storeId || queryClient.getQueryData<any>(['/api/user'])?.vendorId || ''}`}
                        size={200}
                        level="H"
                        includeMargin={true}
                        className="border border-border rounded-md"
                        imageSettings={storeDirectoryLogo ? {
                          src: storeDirectoryLogo,
                          x: undefined,
                          y: undefined,
                          height: 52,
                          width: 52,
                          excavate: true,
                        } : undefined}
                      />
                    </div>
                    
                    <div className="mt-4 text-center">
                      <p className="text-sm text-muted-foreground">Store Directory QR Code</p>
                      <p className="text-xl font-bold mt-1">
                        {storeDirectoryData?.vendorName || "EaseSpotter"}
                      </p>
                    </div>
                    
                    <div className="mt-4 w-full text-sm">
                      <div className="bg-muted/50 p-3 rounded-md w-full text-xs text-muted-foreground mb-1">
                        {storeDirectoryData ? (
                          <div className="grid grid-cols-2 gap-2 text-center">
                            <div>
                              <div className="font-semibold text-foreground">{storeDirectoryData.totalProducts}</div>
                              <div>Products</div>
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{Object.keys(storeDirectoryData.productsByCategory).length}</div>
                              <div>Categories</div>
                            </div>
                          </div>
                        ) : (
                          <div>Loading store directory data...</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="p-4">
                    <div className="grid w-full grid-cols-2 gap-2">
                      <Button variant="outline" className="text-xs px-2 w-full min-w-0 flex items-center justify-center" onClick={() => {
                        // Use the same vendorIdToUse logic for consistency
                        const currentUser = queryClient.getQueryData<any>(['/api/user']);
                        const userVendorId = currentUser?.vendorId;
                        const vendorIdToUse = storeId || userVendorId || '';
                        
                        navigator.clipboard.writeText(`${window.location.origin}/api/qr/store-directory?storeId=${vendorIdToUse}`);
                        toast({
                          title: "Success",
                          description: "QR code URL copied to clipboard",
                        });
                      }}>
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      <Button variant="default" className="text-xs px-2 w-full min-w-0 flex items-center justify-center" onClick={() => {
                        try {
                          // Get the QR code container
                          const qrCodeContainer = document.getElementById("store-directory-print-container");
                          if (!qrCodeContainer) return;
                          
                          // Create a new window for printing
                          const printWindow = window.open("", "_blank");
                          if (!printWindow) {
                            toast({
                              title: "Error",
                              description: "Failed to open print window. Please check your popup settings.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Prepare print content
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>EaseSpotter Store Directory</title>
                                <style>
                                  body {
                                    font-family: Arial, sans-serif;
                                    margin: 0;
                                    padding: 20px;
                                    text-align: center;
                                  }
                                  .qr-container {
                                    display: inline-block;
                                    padding: 20px;
                                    border: 1px solid #ddd;
                                    border-radius: 8px;
                                    background: white;
                                    margin-bottom: 20px;
                                  }
                                  .store-info {
                                    margin-top: 10px;
                                    text-align: center;
                                    font-size: 14px;
                                  }
                                  .store-name {
                                    font-weight: bold;
                                    font-size: 18px;
                                    margin-bottom: 5px;
                                  }
                                  .store-description {
                                    color: #666;
                                    margin-bottom: 5px;
                                  }
                                  .qr-instructions {
                                    font-size: 11px;
                                    color: #666;
                                    margin-top: 10px;
                                  }
                                  @media print {
                                    body {
                                      margin: 0;
                                      padding: 10px;
                                    }
                                  }
                                </style>
                              </head>
                              <body>
                                <div class="qr-container">
                                  ${qrCodeContainer.innerHTML}
                                  <div class="store-info">
                                    <div class="store-name">${storeDirectoryData?.vendorName || "EaseSpotter"} Store Directory</div>
                                    <div class="store-description">Scan to view complete product catalog and locations</div>
                                    <div class="qr-instructions">Place this QR code at the store entrance for easy navigation</div>
                                  </div>
                                </div>
                              </body>
                            </html>
                          `);
                          
                          // Trigger print dialog
                          printWindow.document.close();
                          printWindow.focus();
                          
                          // Add a slight delay to ensure content is loaded
                          setTimeout(() => {
                            printWindow.print();
                            printWindow.close();
                          }, 250);
                          
                          toast({
                            title: "Print ready",
                            description: "QR code print dialog opened",
                          });
                        } catch (error) {
                          console.error("Error printing QR code:", error);
                          toast({
                            title: "Error",
                            description: "Failed to print QR code",
                            variant: "destructive",
                          });
                        }
                      }}>
                        <Printer className="h-3 w-3 mr-1" />
                        Print
                      </Button>
                      <Button variant="outline" className="text-xs px-2 w-full min-w-0 flex items-center justify-center col-span-2" onClick={() => {
                        try {
                          // Get the SVG element
                          const svgElement = document.getElementById("store-directory-qr-code");
                          if (!svgElement) return;
                      
                          // Create a canvas element
                          const canvas = document.createElement("canvas");
                          const ctx = canvas.getContext("2d");
                          if (!ctx) return;
                      
                          // Set canvas size to be larger for better quality
                          canvas.width = 512;
                          canvas.height = 512;
                      
                          // Create an image from the SVG
                          const img = new Image();
                          const svgData = new XMLSerializer().serializeToString(svgElement);
                          const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                          const url = URL.createObjectURL(svgBlob);
                      
                          img.onload = () => {
                            // Fill canvas with white background
                            ctx.fillStyle = "white";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            
                            // Draw SVG on canvas
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            
                            // Create download link
                            const link = document.createElement("a");
                            link.download = `easespotter-store-directory${storeId ? `-store-${storeId}` : ''}.png`;
                            link.href = canvas.toDataURL("image/png");
                            link.click();
                            
                            // Clean up
                            URL.revokeObjectURL(url);
                          };
                          
                          img.src = url;
                          
                          toast({
                            title: "Success",
                            description: "QR code downloaded successfully",
                          });
                        } catch (error) {
                          console.error("Error downloading QR code:", error);
                          toast({
                            title: "Error",
                            description: "Failed to download QR code",
                            variant: "destructive",
                          });
                        }
                      }}>
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Directory Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-auto max-h-[500px]">
                    <Tabs defaultValue="aisle" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="aisle">By Aisle</TabsTrigger>
                        <TabsTrigger value="category">By Category</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="aisle" className="space-y-4">
                        {storeDirectoryData && storeDirectoryData.productsByAisle ? (
                          Object.entries(storeDirectoryData.productsByAisle).map(([aisle, products]) => (
                            <div key={aisle} className="rounded-md border p-4">
                              <h3 className="text-lg font-bold mb-3">{locationLabelPrimary} {aisle}</h3>
                              
                              <div className="space-y-3">
                                {Array.isArray(products) && products.map((product: any) => (
                                  <div key={product.id} className="flex justify-between items-baseline">
                                    <div>
                                      <p className="font-medium">{product.name}</p>
                                      <p className="text-xs text-muted-foreground">{locationLabelSecondary}: {product.shelf}</p>
                                    </div>
                                    <p className="text-lg font-medium">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.price || '0'))}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-muted-foreground">
                            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                            <p>Loading directory data...</p>
                          </div>
                        )}
                      </TabsContent>
                      
                      <TabsContent value="category" className="space-y-4">
                        {storeDirectoryData && storeDirectoryData.productsByCategory ? (
                          Object.entries(storeDirectoryData.productsByCategory).map(([category, products]) => (
                            <div key={category} className="rounded-md border p-4">
                              <h3 className="text-lg font-bold mb-3">{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
                              
                              <div className="space-y-3">
                                {Array.isArray(products) && products.map((product: any) => (
                                  <div key={product.id} className="flex justify-between items-baseline">
                                    <div>
                                      <p className="font-medium">{product.name}</p>
                                      <p className="text-xs text-muted-foreground">{locationLabelPrimary} {product.location?.aisle}, {locationLabelSecondary} {product.location?.shelf}</p>
                                    </div>
                                    <p className="text-lg font-medium">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.price || '0'))}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-muted-foreground">
                            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                            <p>Loading directory data...</p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                    
                    <div className="mt-6 space-y-4">
                      <div>
                        <h3 className="text-lg font-medium mb-2">What this QR code does:</h3>
                        <ul className="space-y-2 list-disc pl-5">
                          <li>Provides a complete directory of all products in the store</li>
                          <li>Shows product organization by both category and aisle</li>
                          <li>Displays current pricing information</li>
                          <li>Helps customers locate products in-store</li>
                          <li>Updates automatically when prices or inventory change</li>
                        </ul>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-medium mb-2">Placement suggestions:</h3>
                        <ul className="space-y-2 list-disc pl-5">
                          <li>Store entrance or information kiosk</li>
                          <li>End of each aisle</li>
                          <li>Customer service desk</li>
                          <li>On printed store maps or brochures</li>
                          <li>Near checkout areas</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="text-sm text-muted-foreground mt-4">
                <p className="mb-2">
                  <strong>How it works:</strong>
                </p>
                <ol className="space-y-1 list-decimal pl-4">
                  <li>Print the QR code and place it at the store entrance or on flyers</li>
                  <li>Customers can scan the code with the EaseSpotter app</li>
                  <li>The app will display a complete store directory with product locations</li>
                  <li>Price updates will be instantly available when scanned</li>
                  <li>Customers can quickly find products and view current pricing</li>
                </ol>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <RestockSuggestions />
      {/* Promotions Section */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Promotions</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activePromotionPreview.map(promo => (
                <div key={promo.id} className="space-y-2 bg-background/60 p-2 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{promo.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Ends {new Date(promo.endDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        {promo.discountPercent}% OFF
                      </Badge>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingPromotion(promo);
                          setIsEditPromotionDialogOpen(true);
                        }}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive/80 hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${promo.name}" promotion?`)) {
                            deletePromotionMutation.mutate(promo.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {activePromotions.filter((promo) => promo.status === "active").length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Additional promoted products are listed in Promoted Products.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Promotions</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activePromotions.filter(promo => promo.status === 'scheduled').map(promo => (
                <div key={promo.id} className="space-y-2 bg-background/60 p-2 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{promo.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Starts {new Date(promo.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        {promo.discountPercent}% OFF
                      </Badge>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingPromotion(promo);
                          setIsEditPromotionDialogOpen(true);
                        }}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive/80 hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${promo.name}" promotion?`)) {
                            deletePromotionMutation.mutate(promo.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Update the Create Promotion card with dialog */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Create Promotion</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Dialog open={isCreatePromotionDialogOpen} onOpenChange={setIsCreatePromotionDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  Add New Promotion
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Promotion</DialogTitle>
                  <DialogDescription>
                    Create a new promotion or discount campaign for your products.
                  </DialogDescription>
                </DialogHeader>
                <PromotionForm
                  onSubmit={handleCreatePromotion}
                  isLoading={createPromotionMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Existing Products Section */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Products</h1>
        <div className="flex gap-2">
          <Button
            variant={productsSectionView === "promotions" ? "default" : "outline"}
            onClick={() => setProductsSectionView(productsSectionView === "promotions" ? "catalog" : "promotions")}
          >
            <Tag className="h-4 w-4 mr-2" />
            {productsSectionView === "promotions" ? "All Products" : "Promoted Products"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Keyboard className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-2">
                <h4 className="font-medium">Keyboard Shortcuts</h4>
                <div className="border rounded-lg divide-y">
                  {shortcuts.map(({ key, action }) => (
                    <div key={key} className="p-2 flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{action}</span>
                      <kbd className="bg-muted px-2 py-1 rounded">{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>
                  Enter the details for the new product you want to add to the catalog.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-4 -mr-4 ml-4">
                {storeType === 'website' ? (
                  <StoreProductForm
                    onSubmit={handleNewProduct}
                    isLoading={createProductMutation.isPending}
                    mode="create"
                  />
                ) : (
                  <ProductForm
                    onSubmit={handleNewProduct}
                    isLoading={createProductMutation.isPending}
                    mode="create"
                    storeType={storeType}
                    locationLabelPrimary={locationLabelPrimary}
                    locationLabelSecondary={locationLabelSecondary}
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {productsSectionView === "promotions" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Products on Promotions</CardTitle>
              <p className="text-sm text-muted-foreground">
                {promotedProductRows.length} promoted product{promotedProductRows.length === 1 ? "" : "s"} across active and upcoming promotions.
              </p>
            </div>
            <Button variant="outline" onClick={() => setProductsSectionView("catalog")}>
              All Products
            </Button>
          </CardHeader>
          <CardContent>
            {promotedProductRows.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {promotedProductRows.map((product) => (
                  <div
                    key={`${product.promotionId}-${product.id}`}
                    className="flex min-w-0 items-center gap-3 rounded-md border bg-muted/20 p-3"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Tag className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{product.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{product.promotionName}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingPromotion(product.promotion);
                              setIsEditPromotionDialogOpen(true);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive/80 hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${product.promotionName}" promotion?`)) {
                                deletePromotionMutation.mutate(product.promotionId);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={product.status === "active" ? "secondary" : "outline"} className="h-5">
                          {product.discountPercent}% off
                        </Badge>
                        {product.originalPrice !== undefined && product.salePrice !== undefined && (
                          <span className="text-muted-foreground">
                            <span className="line-through">
                              {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(product.originalPrice))}
                            </span>{" "}
                            <span className="font-medium text-foreground">
                              {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(product.salePrice))}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No products are currently attached to promotions.</p>
            )}
          </CardContent>
        </Card>
      ) : error ? (
        <div className="text-center py-8 space-y-3">
          <div className="space-y-2">
            <p className="text-lg font-semibold">No products are available yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              If this is a new store, click Add Product to create your first item. If you already added products, retry loading the product list.
            </p>
          </div>
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/products"] })}
            variant="outline"
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      ) : (
        <ProductTable
          products={products}
          isLoading={isLoading}
          isError={!!error}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/products"] })}
          onViewHistory={handlePriceHistory}
          onEditProduct={handleEditProduct}
          onViewAnalysis={(productId: number) => setSelectedProductForAnalysis(productId)}
          searchInputRef={searchInputRef}
          locationLabelPrimary={locationLabelPrimary}
          locationLabelSecondary={locationLabelSecondary}
        />
      )}

      <Dialog open={!!selectedProductId} onOpenChange={(open) => !open && setSelectedProductId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Price History for {products.find(p => p.id === selectedProductId)?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedProductId && <PriceHistoryChart productId={selectedProductId} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedProductForAnalysis} onOpenChange={(open) => !open && setSelectedProductForAnalysis(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Competitor Analysis for {products.find(p => p.id === selectedProductForAnalysis)?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedProductForAnalysis && <CompetitorAnalysis productId={selectedProductForAnalysis} />}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update the details for {editingProduct?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4 -mr-4">
            {editingProduct && (
              storeType === 'website' ? (
                <StoreProductForm
                  key={`store-product-${editingProduct.id}`}
                  product={editingProduct}
                  onSubmit={handleUpdateProduct}
                  isLoading={updateProductMutation.isPending}
                  mode="edit"
                  onDelete={() => handleDeleteProduct(editingProduct.id)}
                />
              ) : (
                <ProductForm
                  key={`product-${editingProduct.id}`}
                  product={editingProduct}
                  onSubmit={handleUpdateProduct}
                  isLoading={updateProductMutation.isPending}
                  mode="edit"
                  storeType={storeType}
                  locationLabelPrimary={locationLabelPrimary}
                  locationLabelSecondary={locationLabelSecondary}
                  onDelete={() => handleDeleteProduct(editingProduct.id)}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isEditPromotionDialogOpen} onOpenChange={setIsEditPromotionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Promotion</DialogTitle>
            <DialogDescription>
              Update the details for {editingPromotion?.name}.
            </DialogDescription>
          </DialogHeader>
          {editingPromotion && (
            <PromotionForm
              promotion={editingPromotion}
              onSubmit={handleUpdatePromotion}
              isLoading={updatePromotionMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
