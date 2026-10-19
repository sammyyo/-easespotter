import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ShoppingBag, Store, Globe, Phone, PlusCircle, Pencil, Trash2, Check, X, MessageCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/use-currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

// Channel type icons
const channelTypeIcons: Record<string, React.ReactNode> = {
  web: <Globe className="h-5 w-5 text-blue-500" />,
  mobile: <Phone className="h-5 w-5 text-green-500" />,
  store: <Store className="h-5 w-5 text-orange-500" />,
  marketplace: <ShoppingBag className="h-5 w-5 text-purple-500" />,
  social: <MessageCircle className="h-5 w-5 text-pink-500" />,
  other: <ShoppingBag className="h-5 w-5 text-gray-500" />,
};

// Types for the channel management
interface SalesChannel {
  id: number;
  vendorId: number;
  name: string;
  type: 'web' | 'mobile' | 'store' | 'marketplace' | 'social' | 'other';
  url?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductChannelPrice {
  id: number;
  productId: number;
  channelId: number;
  productName: string;
  channelName: string;
  basePrice: number;
  discountedPrice: number | null;
  minimumPrice: number;
  maximumPrice: number;
  lastUpdated: string;
}

interface ChannelPerformance {
  id: number;
  channelId: number;
  channelName: string;
  revenue: number;
  orders: number;
  conversionRate: number;
  averageOrderValue: number;
  period: string;
}

interface PriceRule {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
}

interface ChannelPriceRule {
  id: number;
  channelId: number;
  ruleId: number;
  ruleName: string;
  channelName: string;
  isActive: boolean;
}

// Create channel form schema
const createChannelSchema = z.object({
  name: z.string().min(3, "Channel name must be at least 3 characters"),
  type: z.enum(["web", "mobile", "store", "marketplace", "social", "other"]),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CreateChannelFormValues = z.infer<typeof createChannelSchema>;

// Create channel price form schema
const channelPriceSchema = z.object({
  channelId: z.number().or(z.string().transform(val => parseInt(val))),
  productId: z.number().or(z.string().transform(val => parseInt(val))),
  basePrice: z.number().min(0, "Price must be positive").or(z.string().transform(val => parseFloat(val))),
  discountedPrice: z.union([
    z.number().nullable().optional(),
    z.string().transform(val => val === "" ? null : parseFloat(val))
  ]).optional(),
  minimumPrice: z.number().min(0, "Minimum price must be positive").or(z.string().transform(val => parseFloat(val))),
  maximumPrice: z.number().min(0, "Maximum price must be positive").or(z.string().transform(val => parseFloat(val))),
});

type ChannelPriceFormValues = z.infer<typeof channelPriceSchema>;

// Create channel rule association form schema
const channelRuleSchema = z.object({
  channelId: z.number().or(z.string().transform(val => parseInt(val))),
  ruleId: z.number().or(z.string().transform(val => parseInt(val))),
  isActive: z.boolean().default(true),
});

type ChannelRuleFormValues = z.infer<typeof channelRuleSchema>;

// Channel Management component
export default function ChannelManagement() {
  const [activeTab, setActiveTab] = useState<string>("channels");
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isEditChannelOpen, setIsEditChannelOpen] = useState(false);
  const [isCreatePriceOpen, setIsCreatePriceOpen] = useState(false);
  const [isEditPriceOpen, setIsEditPriceOpen] = useState(false);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<SalesChannel | null>(null);
  const [selectedChannelPrice, setSelectedChannelPrice] = useState<ProductChannelPrice | null>(null);
  const [deleteChannelId, setDeleteChannelId] = useState<number | null>(null);
  const [deleteChannelPriceId, setDeleteChannelPriceId] = useState<number | null>(null);
  const [deleteChannelRuleId, setDeleteChannelRuleId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Fetch Sales Channels
  const { data: channels = [], isLoading: isLoadingChannels, error: channelsError } = useQuery({
    queryKey: ["/api/channels"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/channels");
        return await res.json() as SalesChannel[];
      } catch (error) {
        console.error("Error fetching channels:", error);
        return [];
      }
    },
  });

  // Fetch Price Rules
  const { data: priceRules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ["/api/price-rules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/price-rules");
      return res.json() as Promise<PriceRule[]>;
    },
  });

  // Fetch Channel Price Rules
  const { data: channelRules = [], isLoading: isLoadingChannelRules } = useQuery({
    queryKey: ["/api/channel-rules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/channel-rules");
      return res.json() as Promise<ChannelPriceRule[]>;
    },
  });

  // Fetch Channel Prices
  const { data: channelPrices = [], isLoading: isLoadingPrices } = useQuery({
    queryKey: ["/api/channel-prices"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/channel-prices");
      return res.json() as Promise<ProductChannelPrice[]>;
    },
  });

  // Fetch Channel Performance Metrics
  const { data: channelPerformance = [], isLoading: isLoadingPerformance } = useQuery({
    queryKey: ["/api/channel-performance"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/channel-performance");
      return res.json() as Promise<ChannelPerformance[]>;
    },
  });

  // Fetch Products
  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/products");
      return res.json();
    },
  });

  // Create Channel Mutation
  const createChannelMutation = useMutation({
    mutationFn: async (data: CreateChannelFormValues) => {
      const response = await apiRequest("POST", "/api/channels", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create channel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setIsCreateChannelOpen(false);
      toast({
        title: "Channel created",
        description: "The sales channel has been successfully created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create channel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CreateChannelFormValues }) => {
      const response = await apiRequest("PATCH", `/api/channels/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update channel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setIsEditChannelOpen(false);
      setSelectedChannel(null);
      toast({
        title: "Channel updated",
        description: "The sales channel has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update channel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create Channel Price Mutation
  const createChannelPriceMutation = useMutation({
    mutationFn: async (data: ChannelPriceFormValues) => {
      const response = await apiRequest("POST", "/api/channel-prices", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create channel price");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-prices"] });
      setIsCreatePriceOpen(false);
      toast({
        title: "Channel price created",
        description: "The product channel price has been successfully created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create channel price",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateChannelPriceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ChannelPriceFormValues }) => {
      const response = await apiRequest("PATCH", `/api/channel-prices/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update channel price");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-prices"] });
      setIsEditPriceOpen(false);
      setSelectedChannelPrice(null);
      toast({
        title: "Channel price updated",
        description: "The product channel price has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update channel price",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteChannelPriceMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/channel-prices/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete channel price");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-prices"] });
      setDeleteChannelPriceId(null);
      toast({
        title: "Channel price deleted",
        description: "The product channel price has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete channel price",
        description: error.message,
        variant: "destructive",
      });
      setDeleteChannelPriceId(null);
    },
  });

  // Create Channel Rule Mutation
  const createChannelRuleMutation = useMutation({
    mutationFn: async (data: ChannelRuleFormValues) => {
      const response = await apiRequest("POST", "/api/channel-rules", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to assign rule to channel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-rules"] });
      setIsCreateRuleOpen(false);
      toast({
        title: "Rule assigned",
        description: "The price rule has been successfully assigned to the channel.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to assign rule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleChannelRuleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/channel-rules/${id}`, { isActive });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update rule assignment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-rules"] });
      toast({
        title: "Assignment updated",
        description: "The channel rule assignment has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update assignment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteChannelRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/channel-rules/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to remove assignment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-rules"] });
      setDeleteChannelRuleId(null);
      toast({
        title: "Assignment removed",
        description: "The rule has been unassigned from the channel.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove assignment",
        description: error.message,
        variant: "destructive",
      });
      setDeleteChannelRuleId(null);
    },
  });

  // Toggle Channel Status Mutation
  const toggleChannelStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/channels/${id}`, { isActive });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update channel status");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({
        title: "Channel updated",
        description: "The channel status has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update channel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete Channel Mutation
  const deleteChannelMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/channels/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete channel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({
        title: "Channel deleted",
        description: "The sales channel has been successfully deleted.",
      });
      setDeleteChannelId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete channel",
        description: error.message,
        variant: "destructive",
      });
      setDeleteChannelId(null);
    },
  });

  // Create Channel Form
  const createChannelForm = useForm<CreateChannelFormValues>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: {
      name: "",
      type: "web",
      url: "",
      description: "",
      isActive: true,
    },
  });

  // Create Channel Price Form
  const createChannelPriceForm = useForm<ChannelPriceFormValues>({
    resolver: zodResolver(channelPriceSchema),
    defaultValues: {
      channelId: 0,
      productId: 0,
      basePrice: 0,
      discountedPrice: null,
      minimumPrice: 0,
      maximumPrice: 0,
    },
  });

  const editChannelForm = useForm<CreateChannelFormValues>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: {
      name: "",
      type: "web",
      url: "",
      description: "",
      isActive: true,
    },
  });

  const editChannelPriceForm = useForm<ChannelPriceFormValues>({
    resolver: zodResolver(channelPriceSchema),
    defaultValues: {
      channelId: 0,
      productId: 0,
      basePrice: 0,
      discountedPrice: null,
      minimumPrice: 0,
      maximumPrice: 0,
    },
  });

  // Create Channel Rule Form
  const createChannelRuleForm = useForm<ChannelRuleFormValues>({
    resolver: zodResolver(channelRuleSchema),
    defaultValues: {
      channelId: 0,
      ruleId: 0,
      isActive: true,
    },
  });

  const onCreateChannelSubmit = (data: CreateChannelFormValues) => {
    createChannelMutation.mutate(data);
  };

  const onEditChannelSubmit = (data: CreateChannelFormValues) => {
    if (!selectedChannel) return;
    updateChannelMutation.mutate({ id: selectedChannel.id, data });
  };

  const onCreateChannelPriceSubmit = (data: ChannelPriceFormValues) => {
    createChannelPriceMutation.mutate(data);
  };

  const onEditChannelPriceSubmit = (data: ChannelPriceFormValues) => {
    if (!selectedChannelPrice) return;
    updateChannelPriceMutation.mutate({ id: selectedChannelPrice.id, data });
  };

  const onCreateChannelRuleSubmit = (data: ChannelRuleFormValues) => {
    createChannelRuleMutation.mutate(data);
  };

  const handleToggleChannelStatus = (id: number, currentStatus: boolean) => {
    toggleChannelStatusMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleDeleteChannel = (id: number) => {
    setDeleteChannelId(id);
  };

  const handleEditChannel = (channel: SalesChannel) => {
    setSelectedChannel(channel);
    editChannelForm.reset({
      name: channel.name,
      type: channel.type,
      url: channel.url || "",
      description: channel.description || "",
      isActive: channel.isActive,
    });
    setIsEditChannelOpen(true);
  };

  const handleEditChannelPrice = (price: ProductChannelPrice) => {
    setSelectedChannelPrice(price);
    editChannelPriceForm.reset({
      channelId: price.channelId,
      productId: price.productId,
      basePrice: Number(price.basePrice),
      discountedPrice: price.discountedPrice ? Number(price.discountedPrice) : null,
      minimumPrice: Number(price.minimumPrice),
      maximumPrice: Number(price.maximumPrice),
    });
    setIsEditPriceOpen(true);
  };

  const confirmDeleteChannel = () => {
    if (deleteChannelId) {
      deleteChannelMutation.mutate(deleteChannelId);
    }
  };

  const { currency } = useCurrency();
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isLoading = isLoadingChannels || isLoadingRules || isLoadingChannelRules || 
                   isLoadingPrices || isLoadingPerformance || isLoadingProducts;

  return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Channel Management</h1>
          <Button onClick={() => setIsCreateChannelOpen(true)} className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            Add Channel
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto mb-8">
              <TabsTrigger value="channels">Channels</TabsTrigger>
              <TabsTrigger value="pricing">Channel Pricing</TabsTrigger>
              <TabsTrigger value="rules">Price Rules</TabsTrigger>
            </TabsList>

            {/* Channels Tab */}
            <TabsContent value="channels" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {channels && channels.length > 0 ? (
                  channels.map((channel) => (
                    <Card key={channel.id} className={`overflow-hidden ${!channel.isActive ? 'opacity-60' : ''}`}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            {channelTypeIcons[channel.type] || channelTypeIcons.other}
                            <CardTitle>{channel.name}</CardTitle>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditChannel(channel)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleToggleChannelStatus(channel.id, channel.isActive)}
                              title={channel.isActive ? "Deactivate" : "Activate"}
                            >
                              {channel.isActive ? 
                                <Check className="h-4 w-4 text-green-500" /> : 
                                <X className="h-4 w-4 text-red-500" />
                              }
                            </Button>
                            <AlertDialog open={deleteChannelId === channel.id} onOpenChange={(open) => !open && setDeleteChannelId(null)}>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteChannel(channel.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Channel</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this sales channel? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={confirmDeleteChannel} className="bg-destructive text-destructive-foreground">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <CardDescription>
                          {channel.type ? `${channel.type.charAt(0).toUpperCase() + channel.type.slice(1)} Channel` : 'Channel'}
                          <Badge 
                            variant={channel.isActive ? "default" : "outline"} 
                            className="ml-2"
                          >
                            {channel.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {channel.url && (
                          <p className="text-sm mb-2 truncate">
                            <a href={channel.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              {channel.url}
                            </a>
                          </p>
                        )}
                        {channel.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{channel.description}</p>
                        )}
                        <div className="mt-4 text-xs text-muted-foreground">
                          Created {channel.createdAt ? formatDate(channel.createdAt) : 'N/A'}
                        </div>
                        {channelPerformance && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Revenue</p>
                                <p className="font-medium">
                                  {channelPerformance.find(cp => cp.channelId === channel.id)
                                    ? formatCurrency(channelPerformance.find(cp => cp.channelId === channel.id)!.revenue)
                                    : "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Orders</p>
                                <p className="font-medium">
                                  {channelPerformance.find(cp => cp.channelId === channel.id)
                                    ? channelPerformance.find(cp => cp.channelId === channel.id)!.orders
                                    : "N/A"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full">
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center h-40">
                        <p className="text-muted-foreground mb-4">No sales channels found</p>
                        <Button onClick={() => setIsCreateChannelOpen(true)}>Add your first channel</Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Channel Pricing Tab */}
            <TabsContent value="pricing" className="space-y-3">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Product Channel Pricing</h2>
                <Button onClick={() => setIsCreatePriceOpen(true)} className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Add Channel Price
                </Button>
              </div>

              {channelPrices && channelPrices.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead>Base Price</TableHead>
                          <TableHead>Discounted</TableHead>
                          <TableHead>Min Price</TableHead>
                          <TableHead>Max Price</TableHead>
                          <TableHead>Last Updated</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {channelPrices.map((price) => (
                          <TableRow key={price.id}>
                            <TableCell className="font-medium">{price.productName}</TableCell>
                            <TableCell>{price.channelName}</TableCell>
                            <TableCell>{formatCurrency(price.basePrice)}</TableCell>
                            <TableCell>
                              {price.discountedPrice ? formatCurrency(price.discountedPrice) : "—"}
                            </TableCell>
                            <TableCell>{formatCurrency(price.minimumPrice)}</TableCell>
                            <TableCell>{formatCurrency(price.maximumPrice)}</TableCell>
                            <TableCell>{price.lastUpdated ? formatDate(price.lastUpdated) : 'N/A'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditChannelPrice(price)}
                                  title="Edit Price"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog open={deleteChannelPriceId === price.id} onOpenChange={(open) => !open && setDeleteChannelPriceId(null)}>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setDeleteChannelPriceId(price.id)}
                                      title="Delete Price"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Channel Price</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will remove the selected product pricing override for the channel.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteChannelPriceId && deleteChannelPriceMutation.mutate(deleteChannelPriceId)}
                                        className="bg-destructive text-destructive-foreground"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center h-40">
                    <p className="text-muted-foreground mb-4">No channel pricing found</p>
                    <Button onClick={() => setIsCreatePriceOpen(true)}>Add your first price</Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Channel Price Rules Tab */}
            <TabsContent value="rules" className="space-y-3">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Channel Price Rules</h2>
                <Button onClick={() => setIsCreateRuleOpen(true)} className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Assign Rule to Channel
                </Button>
              </div>

              {channelRules && channelRules.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Channel</TableHead>
                          <TableHead>Rule</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {channelRules.map((rule) => (
                          <TableRow key={rule.id}>
                            <TableCell className="font-medium">{rule.channelName}</TableCell>
                            <TableCell>{rule.ruleName}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={rule.isActive ? "default" : "outline"} 
                                className="ml-2"
                              >
                                {rule.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleChannelRuleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                                  title={rule.isActive ? "Disable Assignment" : "Enable Assignment"}
                                >
                                  {rule.isActive ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <X className="h-4 w-4 text-red-500" />
                                  )}
                                </Button>
                                <AlertDialog open={deleteChannelRuleId === rule.id} onOpenChange={(open) => !open && setDeleteChannelRuleId(null)}>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setDeleteChannelRuleId(rule.id)}
                                      title="Unassign Rule"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove Rule Assignment</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will unassign the selected pricing rule from the channel.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteChannelRuleId && deleteChannelRuleMutation.mutate(deleteChannelRuleId)}
                                        className="bg-destructive text-destructive-foreground"
                                      >
                                        Remove
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center h-40">
                    <p className="text-muted-foreground mb-4">No channel rule assignments found</p>
                    <Button onClick={() => setIsCreateRuleOpen(true)}>Assign your first rule</Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Create Channel Dialog */}
        <Dialog open={isCreateChannelOpen} onOpenChange={setIsCreateChannelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Sales Channel</DialogTitle>
              <DialogDescription>
                Add a new sales channel to manage prices across different platforms.
              </DialogDescription>
            </DialogHeader>

            <Form {...createChannelForm}>
              <form onSubmit={createChannelForm.handleSubmit(onCreateChannelSubmit)} className="space-y-4">
                <FormField
                  control={createChannelForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel Name</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g., Website, Amazon Store" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select channel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="web">Web</SelectItem>
                          <SelectItem value="mobile">Mobile</SelectItem>
                          <SelectItem value="store">Physical Store</SelectItem>
                          <SelectItem value="marketplace">Marketplace</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the type of sales channel
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormDescription>
                        The URL where this channel can be accessed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter a description for this sales channel"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active</FormLabel>
                        <FormDescription>
                          Mark this channel as active to apply pricing rules
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createChannelMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {createChannelMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Channel
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditChannelOpen} onOpenChange={setIsEditChannelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Sales Channel</DialogTitle>
              <DialogDescription>
                Update the selected sales channel configuration.
              </DialogDescription>
            </DialogHeader>

            <Form {...editChannelForm}>
              <form onSubmit={editChannelForm.handleSubmit(onEditChannelSubmit)} className="space-y-4">
                <FormField
                  control={editChannelForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel Name</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g., Website, Amazon Store" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select channel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="web">Web</SelectItem>
                          <SelectItem value="mobile">Mobile</SelectItem>
                          <SelectItem value="store">Physical Store</SelectItem>
                          <SelectItem value="marketplace">Marketplace</SelectItem>
                          <SelectItem value="social">Social</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter a description for this sales channel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active</FormLabel>
                        <FormDescription>
                          Mark this channel as active to apply pricing rules
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={updateChannelMutation.isPending} className="w-full sm:w-auto">
                    {updateChannelMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Update Channel
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Create Channel Price Dialog */}
        <Dialog open={isCreatePriceOpen} onOpenChange={setIsCreatePriceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Channel Price</DialogTitle>
              <DialogDescription>
                Set specific pricing for a product on a sales channel.
              </DialogDescription>
            </DialogHeader>

            <Form {...createChannelPriceForm}>
              <form onSubmit={createChannelPriceForm.handleSubmit(onCreateChannelPriceSubmit)} className="space-y-4">
                <FormField
                  control={createChannelPriceForm.control}
                  name="channelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sales Channel</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a sales channel" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(channels) && channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id.toString()}>
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelPriceForm.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a product" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products?.map((product: any) => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelPriceForm.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0" 
                          placeholder="0.00" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createChannelPriceForm.control}
                    name="minimumPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Price</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            placeholder="0.00" 
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Lowest allowed price
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createChannelPriceForm.control}
                    name="maximumPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maximum Price</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            placeholder="0.00" 
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Highest allowed price
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createChannelPriceMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {createChannelPriceMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Channel Price
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditPriceOpen} onOpenChange={setIsEditPriceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Channel Price</DialogTitle>
              <DialogDescription>
                Update pricing boundaries for the selected product and channel.
              </DialogDescription>
            </DialogHeader>

            <Form {...editChannelPriceForm}>
              <form onSubmit={editChannelPriceForm.handleSubmit(onEditChannelPriceSubmit)} className="space-y-4">
                <FormField
                  control={editChannelPriceForm.control}
                  name="channelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sales Channel</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a sales channel" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(channels) && channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id.toString()}>
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelPriceForm.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a product" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products?.map((product: any) => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelPriceForm.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editChannelPriceForm.control}
                  name="discountedPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discounted Price (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editChannelPriceForm.control}
                    name="minimumPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Price</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editChannelPriceForm.control}
                    name="maximumPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maximum Price</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={updateChannelPriceMutation.isPending} className="w-full sm:w-auto">
                    {updateChannelPriceMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Update Channel Price
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Create Channel Rule Dialog */}
        <Dialog open={isCreateRuleOpen} onOpenChange={setIsCreateRuleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Price Rule to Channel</DialogTitle>
              <DialogDescription>
                Assign an existing price rule to a sales channel.
              </DialogDescription>
            </DialogHeader>

            <Form {...createChannelRuleForm}>
              <form onSubmit={createChannelRuleForm.handleSubmit(onCreateChannelRuleSubmit)} className="space-y-4">
                <FormField
                  control={createChannelRuleForm.control}
                  name="channelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sales Channel</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a sales channel" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(channels) && channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id.toString()}>
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelRuleForm.control}
                  name="ruleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price Rule</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a price rule" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {priceRules?.map((rule) => (
                            <SelectItem key={rule.id} value={rule.id.toString()}>
                              {rule.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createChannelRuleForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active</FormLabel>
                        <FormDescription>
                          Enable this rule on the selected channel
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createChannelRuleMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {createChannelRuleMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Assign Rule
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
  );
}
