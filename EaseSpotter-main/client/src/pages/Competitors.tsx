import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Edit, Plus, Globe, DollarSign } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { LineChart as RechartsLineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Define competitor form schema using zod
const competitorFormSchema = z.object({
  name: z.string().min(1, 'Competitor name is required'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  marketShare: z.coerce
    .number()
    .min(0, 'Market share must be greater than or equal to 0')
    .max(100, 'Market share must be less than or equal to 100')
    .optional(),
  priceIndex: z.coerce
    .number()
    .min(0, 'Price index must be greater than or equal to 0')
    .max(5, 'Price index must be less than or equal to 5')
    .optional(),
});

type CompetitorFormValues = z.infer<typeof competitorFormSchema>;

interface Competitor {
  id: number;
  vendorId: number;
  name: string;
  website?: string;
  isActive: boolean;
  marketShare?: number;
  priceIndex?: number;
  lastScanned?: string;
  createdAt: string;
}

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeCompetitor = (competitor: Competitor): Competitor => ({
  ...competitor,
  marketShare: toOptionalNumber(competitor.marketShare),
  priceIndex: toOptionalNumber(competitor.priceIndex),
});

const formatOptionalNumber = (value: unknown, digits = 1) => {
  const parsed = toOptionalNumber(value);
  return parsed === undefined ? '-' : parsed.toFixed(digits);
};

interface CompetitorProduct {
  id: number;
  competitorId: number;
  productId: number;
  competitorSku?: string;
  competitorUrl?: string;
  isMatched: boolean;
  matchConfidence?: number;
  createdAt: string;
  product?: {
    name: string;
    sku: string;
    currentPrice: string;
  };
}

interface CompetitorPriceEntry {
  id: number;
  competitorProductId: number;
  price: string;
  currency: string;
  isPromotion: boolean | null;
  promotionType?: string | null;
  timestamp: string;
  availability?: string | null;
}

interface PriceFormState {
  id?: number;
  price: string;
  currency: string;
  availability: string;
  timestamp: string;
  isPromotion: boolean;
  promotionType: string;
}

export default function Competitors() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openProductDialog, setOpenProductDialog] = useState(false);
  const [openPriceDialog, setOpenPriceDialog] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [selectedProductLink, setSelectedProductLink] = useState<CompetitorProduct | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('competitors');

  // Fetch competitors
  const { data: competitors = [], isPending: isLoadingCompetitors } = useQuery<Competitor[]>({
    queryKey: ['/api/competitors'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/competitors');
      const data = await response.json();
      return data.map((competitor: Competitor) => normalizeCompetitor(competitor));
    },
  });

  // Fetch products for the linked products section
  const { data: products = [], isPending: isLoadingProducts } = useQuery({
    queryKey: ['/api/products'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/products');
      return response.json();
    },
    enabled: selectedTab === 'products',
  });

  // Fetch competitor products when a competitor is selected
  const { data: competitorProducts = [], isPending: isLoadingCompetitorProducts } = useQuery({
    queryKey: ['/api/competitors', selectedCompetitor?.id, 'products'],
    queryFn: async () => {
      if (!selectedCompetitor) return [];
      const response = await apiRequest('GET', `/api/competitors/${selectedCompetitor.id}/products`);
      return response.json();
    },
    enabled: !!selectedCompetitor && selectedTab === 'products',
  });

  const { data: competitorPriceHistory = [], isPending: isLoadingPriceHistory } = useQuery({
    queryKey: ['/api/competitors', selectedCompetitor?.id, 'products', selectedProductLink?.id, 'prices'],
    queryFn: async () => {
      if (!selectedCompetitor || !selectedProductLink) return [];
      const response = await apiRequest(
        'GET',
        `/api/competitors/${selectedCompetitor.id}/products/${selectedProductLink.id}/prices`
      );
      return response.json();
    },
    enabled: !!selectedCompetitor && !!selectedProductLink && openPriceDialog,
  });

  // Add competitor mutation
  const addCompetitorMutation = useMutation({
    mutationFn: async (values: CompetitorFormValues) => {
      const response = await apiRequest('POST', '/api/competitors', values);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Competitor added successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      setOpenAddDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add competitor',
        variant: 'destructive',
      });
    },
  });

  // Update competitor mutation
  const updateCompetitorMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: CompetitorFormValues }) => {
      const response = await apiRequest('PUT', `/api/competitors/${id}`, values);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Competitor updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      setOpenEditDialog(false);
      setSelectedCompetitor(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update competitor',
        variant: 'destructive',
      });
    },
  });

  // Delete competitor mutation
  const deleteCompetitorMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/competitors/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Competitor deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete competitor',
        variant: 'destructive',
      });
    },
  });

  // Add competitor product mutation
  const linkProductMutation = useMutation({
    mutationFn: async ({
      competitorId,
      productId,
      competitorSku,
      competitorUrl,
    }: {
      competitorId: number;
      productId: number;
      competitorSku?: string;
      competitorUrl?: string;
    }) => {
      const response = await apiRequest('POST', `/api/competitors/${competitorId}/products`, {
        productId,
        competitorSku,
        competitorUrl,
        isMatched: true,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Product linked successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/competitors', selectedCompetitor?.id, 'products'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/competitor-trends'] });
      setOpenProductDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to link product',
        variant: 'destructive',
      });
    },
  });

  // Delete competitor product link mutation
  const unlinkProductMutation = useMutation({
    mutationFn: async ({
      competitorId,
      productLinkId,
    }: {
      competitorId: number;
      productLinkId: number;
    }) => {
      const response = await apiRequest(
        'DELETE',
        `/api/competitors/${competitorId}/products/${productLinkId}`
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Product unlinked successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/competitors', selectedCompetitor?.id, 'products'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/competitor-trends'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink product',
        variant: 'destructive',
      });
    },
  });

  const addPriceMutation = useMutation({
    mutationFn: async (values: PriceFormState) => {
      if (!selectedCompetitor || !selectedProductLink) {
        throw new Error('Select a linked product first');
      }

      const response = await apiRequest(
        'POST',
        `/api/competitors/${selectedCompetitor.id}/products/${selectedProductLink.id}/prices`,
        {
          price: Number(values.price),
          currency: values.currency || 'USD',
          availability: values.availability || 'in_stock',
          timestamp: values.timestamp ? new Date(values.timestamp).toISOString() : undefined,
          isPromotion: values.isPromotion,
          promotionType: values.isPromotion ? values.promotionType || undefined : undefined,
        }
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Competitor price recorded successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/competitors', selectedCompetitor?.id, 'products', selectedProductLink?.id, 'prices'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      setPriceFormState(getDefaultPriceFormState());
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record competitor price',
        variant: 'destructive',
      });
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: async (values: PriceFormState) => {
      if (!selectedCompetitor || !selectedProductLink || !values.id) {
        throw new Error('Select a price entry first');
      }

      const response = await apiRequest(
        'PATCH',
        `/api/competitors/${selectedCompetitor.id}/products/${selectedProductLink.id}/prices/${values.id}`,
        {
          price: Number(values.price),
          currency: values.currency || 'USD',
          availability: values.availability || 'in_stock',
          timestamp: values.timestamp ? new Date(values.timestamp).toISOString() : undefined,
          isPromotion: values.isPromotion,
          promotionType: values.isPromotion ? values.promotionType || undefined : undefined,
        }
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Competitor price updated successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/competitors', selectedCompetitor?.id, 'products', selectedProductLink?.id, 'prices'],
      });
      setPriceFormState(getDefaultPriceFormState());
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update competitor price',
        variant: 'destructive',
      });
    },
  });

  const deletePriceMutation = useMutation({
    mutationFn: async (priceId: number) => {
      if (!selectedCompetitor || !selectedProductLink) {
        throw new Error('Select a linked product first');
      }

      const response = await apiRequest(
        'DELETE',
        `/api/competitors/${selectedCompetitor.id}/products/${selectedProductLink.id}/prices/${priceId}`
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Competitor price deleted successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/competitors', selectedCompetitor?.id, 'products', selectedProductLink?.id, 'prices'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete competitor price',
        variant: 'destructive',
      });
    },
  });

  // Form setup for add competitor
  const addForm = useForm<CompetitorFormValues>({
    resolver: zodResolver(competitorFormSchema),
    defaultValues: {
      name: '',
      website: '',
      isActive: true,
      marketShare: 0,
      priceIndex: 1,
    },
  });

  // Form setup for edit competitor
  const editForm = useForm<CompetitorFormValues>({
    resolver: zodResolver(competitorFormSchema),
    defaultValues: {
      name: '',
      website: '',
      isActive: true,
      marketShare: 0,
      priceIndex: 1,
    },
  });

  // Form for linking products
  const [linkFormState, setLinkFormState] = useState({
    productId: '',
    competitorSku: '',
    competitorUrl: '',
  });

  const getDefaultPriceFormState = (): PriceFormState => ({
    id: undefined,
    price: '',
    currency: 'USD',
    availability: 'in_stock',
    timestamp: new Date().toISOString().slice(0, 16),
    isPromotion: false,
    promotionType: '',
  });

  const [priceFormState, setPriceFormState] = useState<PriceFormState>(getDefaultPriceFormState());

  // Update edit form when selected competitor changes
  useEffect(() => {
    if (selectedCompetitor) {
      editForm.reset({
        name: selectedCompetitor.name,
        website: selectedCompetitor.website || '',
        isActive: selectedCompetitor.isActive,
        marketShare: selectedCompetitor.marketShare || 0,
        priceIndex: selectedCompetitor.priceIndex || 1,
      });
    }
  }, [selectedCompetitor, editForm]);

  useEffect(() => {
    if (!openPriceDialog) {
      setSelectedProductLink(null);
    }
  }, [openPriceDialog]);

  // Function to handle adding a competitor
  const onAddSubmit = (values: CompetitorFormValues) => {
    addCompetitorMutation.mutate(values);
  };

  // Function to handle editing a competitor
  const onEditSubmit = (values: CompetitorFormValues) => {
    if (selectedCompetitor) {
      updateCompetitorMutation.mutate({ id: selectedCompetitor.id, values });
    }
  };

  // Function to handle linking a product
  const onLinkProduct = () => {
    if (selectedCompetitor && linkFormState.productId) {
      linkProductMutation.mutate({
        competitorId: selectedCompetitor.id,
        productId: parseInt(linkFormState.productId),
        competitorSku: linkFormState.competitorSku || undefined,
        competitorUrl: linkFormState.competitorUrl || undefined,
      });

      // Reset form
      setLinkFormState({
        productId: '',
        competitorSku: '',
        competitorUrl: '',
      });
    }
  };

  const onAddPrice = () => {
    if (!priceFormState.price) {
      toast({
        title: 'Price required',
        description: 'Enter a competitor price before saving',
        variant: 'destructive',
      });
      return;
    }

    if (priceFormState.id) {
      updatePriceMutation.mutate(priceFormState);
      return;
    }

    addPriceMutation.mutate(priceFormState);
  };

  // Generate competitor trends data
  const generateTrendsData = async () => {
    try {
      const response = await apiRequest('POST', '/api/analytics/generate-sample-data');
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Sample competitor trends data generated successfully',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/analytics/competitor-trends'] });
        queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      } else {
        const error = await response.json();
        throw new Error(error.message || error.error || error.details || 'Failed to generate sample data');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate sample data',
        variant: 'destructive',
      });
    }
  };

  // Handle edit click
  const handleEditClick = (competitor: Competitor) => {
    setSelectedCompetitor(normalizeCompetitor(competitor));
    setOpenEditDialog(true);
  };

  // Handle delete click
  const handleDeleteClick = (id: number) => {
    if (confirm('Are you sure you want to delete this competitor?')) {
      deleteCompetitorMutation.mutate(id);
    }
  };

  // Handle product link click
  const handleProductClick = (competitor: Competitor) => {
    setSelectedCompetitor(normalizeCompetitor(competitor));
    setSelectedTab('products');
  };

  const handlePriceClick = (productLink: CompetitorProduct) => {
    setSelectedProductLink(productLink);
    setPriceFormState(getDefaultPriceFormState());
    setOpenPriceDialog(true);
  };

  const handleEditPriceClick = (price: CompetitorPriceEntry) => {
    const timestamp = new Date(price.timestamp);
    const timezoneAdjusted = new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setPriceFormState({
      id: price.id,
      price: Number(price.price).toFixed(2),
      currency: price.currency,
      availability: price.availability || 'in_stock',
      timestamp: timezoneAdjusted,
      isPromotion: Boolean(price.isPromotion),
      promotionType: price.promotionType || '',
    });
  };

  const priceChartData = [...competitorPriceHistory]
    .slice()
    .reverse()
    .map((price: CompetitorPriceEntry) => ({
      observedAt: new Date(price.timestamp).toLocaleDateString(),
      price: Number(price.price),
      currency: price.currency || 'USD',
    }));
  const formatCompetitorChartPrice = (value: number, currencyCode = 'USD', compact = false) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: compact ? 0 : 2,
      notation: compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
    }).format(value);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Competitor Management</h1>
          <p className="text-muted-foreground">
            Track competitors and compare their products with yours
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => generateTrendsData()}
            variant="secondary"
          >
            Generate Sample Data
          </Button>
          <Link href="/advanced-analytics">
            <Button variant="outline">View Competitor Analysis</Button>
          </Link>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="products">Linked Products</TabsTrigger>
        </TabsList>

        <TabsContent value="competitors" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Add Competitor
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Competitor</DialogTitle>
                  <DialogDescription>
                    Add a new competitor to track and compare with your products
                  </DialogDescription>
                </DialogHeader>
                <Form {...addForm}>
                  <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                    <FormField
                      control={addForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Competitor Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter competitor name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com" {...field} />
                          </FormControl>
                          <FormDescription>Optional: Enter competitor website URL</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addForm.control}
                        name="marketShare"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Market Share (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="0"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addForm.control}
                        name="priceIndex"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price Index (0-5)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="5"
                                step="0.1"
                                placeholder="1"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>Lower = Cheaper, Higher = More Expensive</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={addForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Active Status</FormLabel>
                            <FormDescription>
                              Is this competitor currently active in the market?
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpenAddDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addCompetitorMutation.isPending}>
                        {addCompetitorMutation.isPending ? 'Adding...' : 'Add Competitor'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoadingCompetitors ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : competitors.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Competitors Found</CardTitle>
                <CardDescription>
                  You haven't added any competitors yet. Add competitors to start tracking them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center py-6">
                  <Button onClick={() => setOpenAddDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Your First Competitor
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Market Share</TableHead>
                    <TableHead>Price Index</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Scanned</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitors.map((competitor: Competitor) => (
                    <TableRow key={competitor.id}>
                      <TableCell className="font-medium">{competitor.name}</TableCell>
                      <TableCell>
                        {competitor.website ? (
                          <a
                            href={competitor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-blue-600 hover:underline"
                          >
                            <Globe className="h-4 w-4 mr-1" />
                            {new URL(competitor.website).hostname}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Not provided</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {competitor.marketShare !== undefined ? `${competitor.marketShare}%` : '-'}
                      </TableCell>
                      <TableCell>
                        {formatOptionalNumber(competitor.priceIndex, 1)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            competitor.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {competitor.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {competitor.lastScanned
                          ? new Date(competitor.lastScanned).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleProductClick(competitor)}
                            title="Link Products"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditClick(competitor)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(competitor.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Edit Competitor Dialog */}
          <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Competitor</DialogTitle>
                <DialogDescription>
                  Update competitor information
                </DialogDescription>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Competitor Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter competitor name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormDescription>Optional: Enter competitor website URL</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="marketShare"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Market Share (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              placeholder="0"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="priceIndex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price Index (0-5)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="5"
                              step="0.1"
                              placeholder="1"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>Lower = Cheaper, Higher = More Expensive</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Active Status</FormLabel>
                          <FormDescription>
                            Is this competitor currently active in the market?
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpenEditDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateCompetitorMutation.isPending}>
                      {updateCompetitorMutation.isPending ? 'Updating...' : 'Update Competitor'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          {!selectedCompetitor ? (
            <Card>
              <CardHeader>
                <CardTitle>Select a Competitor</CardTitle>
                <CardDescription>
                  Please select a competitor from the competitors tab to manage linked products
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center py-6">
                  <Button onClick={() => setSelectedTab('competitors')}>
                    Go to Competitors
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">
                  Products for {selectedCompetitor.name}
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCompetitor(null)}
                  >
                    Clear Selection
                  </Button>
                  <Dialog open={openProductDialog} onOpenChange={setOpenProductDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" /> Link Product
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Link Product to Competitor</DialogTitle>
                        <DialogDescription>
                          Associate one of your products with a competitor product
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Select Product</label>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                            value={linkFormState.productId}
                            onChange={(e) =>
                              setLinkFormState({
                                ...linkFormState,
                                productId: e.target.value,
                              })
                            }
                          >
                            <option value="">-- Select a product --</option>
                            {products.map((product: any) => (
                              <option key={product.id} value={product.id}>
                                {product.name} (SKU: {product.sku})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Competitor SKU (Optional)</label>
                          <Input
                            placeholder="Enter competitor's product SKU"
                            value={linkFormState.competitorSku}
                            onChange={(e) =>
                              setLinkFormState({
                                ...linkFormState,
                                competitorSku: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Product URL (Optional)</label>
                          <Input
                            placeholder="https://competitor.com/product"
                            value={linkFormState.competitorUrl}
                            onChange={(e) =>
                              setLinkFormState({
                                ...linkFormState,
                                competitorUrl: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setOpenProductDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={onLinkProduct}
                          disabled={
                            linkProductMutation.isPending || !linkFormState.productId
                          }
                        >
                          {linkProductMutation.isPending ? 'Linking...' : 'Link Product'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={openPriceDialog} onOpenChange={setOpenPriceDialog}>
                    <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[760px]">
                      <DialogHeader>
                        <DialogTitle>Manage Competitor Prices</DialogTitle>
                        <DialogDescription>
                          {selectedProductLink?.product?.name
                            ? `Track competitor pricing history for ${selectedProductLink.product.name}.`
                            : 'Track competitor pricing history for this linked product.'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-6 overflow-y-auto pr-1 md:grid-cols-[280px_1fr]">
                        <div className="space-y-4 rounded-lg border p-4">
                          <div>
                            <h3 className="font-medium">Add Price Snapshot</h3>
                            <p className="text-sm text-muted-foreground">
                              Record the latest competitor price and availability.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Price</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={priceFormState.price}
                              onChange={(e) =>
                                setPriceFormState((current) => ({ ...current, price: e.target.value }))
                              }
                              placeholder="0.00"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Currency</label>
                              <Input
                                value={priceFormState.currency}
                                onChange={(e) =>
                                  setPriceFormState((current) => ({
                                    ...current,
                                    currency: e.target.value.toUpperCase().slice(0, 3),
                                  }))
                                }
                                placeholder="USD"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Availability</label>
                              <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2"
                                value={priceFormState.availability}
                                onChange={(e) =>
                                  setPriceFormState((current) => ({ ...current, availability: e.target.value }))
                                }
                              >
                                <option value="in_stock">In Stock</option>
                                <option value="limited_stock">Limited Stock</option>
                                <option value="out_of_stock">Out of Stock</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Observed At</label>
                            <Input
                              type="datetime-local"
                              value={priceFormState.timestamp}
                              onChange={(e) =>
                                setPriceFormState((current) => ({ ...current, timestamp: e.target.value }))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                              <p className="text-sm font-medium">Promotion Active</p>
                              <p className="text-xs text-muted-foreground">
                                Mark this snapshot as a promotional price.
                              </p>
                            </div>
                            <Switch
                              checked={priceFormState.isPromotion}
                              onCheckedChange={(checked) =>
                                setPriceFormState((current) => ({
                                  ...current,
                                  isPromotion: checked,
                                  promotionType: checked ? current.promotionType : '',
                                }))
                              }
                            />
                          </div>
                          {priceFormState.isPromotion && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Promotion Type</label>
                              <Input
                                value={priceFormState.promotionType}
                                onChange={(e) =>
                                  setPriceFormState((current) => ({
                                    ...current,
                                    promotionType: e.target.value,
                                  }))
                                }
                                placeholder="e.g. Clearance, Bundle, Coupon"
                              />
                            </div>
                          )}
                          <Button
                            className="w-full"
                            onClick={onAddPrice}
                            disabled={addPriceMutation.isPending || updatePriceMutation.isPending}
                          >
                            {addPriceMutation.isPending || updatePriceMutation.isPending
                              ? 'Saving...'
                              : priceFormState.id
                              ? 'Update Price'
                              : 'Record Price'}
                          </Button>
                          {priceFormState.id && (
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => setPriceFormState(getDefaultPriceFormState())}
                              disabled={updatePriceMutation.isPending}
                            >
                              Cancel Edit
                            </Button>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-medium">Price History</h3>
                            <p className="text-sm text-muted-foreground">
                              Latest observed competitor prices for this linked product.
                            </p>
                          </div>
                          {isLoadingPriceHistory ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">Loading price history...</div>
                          ) : competitorPriceHistory.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                              No competitor prices recorded yet.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="h-[240px] rounded-md border p-3">
                                <ResponsiveContainer width="100%" height="100%">
                                  <RechartsLineChart data={priceChartData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis
                                      dataKey="observedAt"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 11 }}
                                      tickMargin={10}
                                      minTickGap={18}
                                      interval="preserveStartEnd"
                                    />
                                    <YAxis
                                      width={64}
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 11 }}
                                      tickFormatter={(value) => {
                                        const firstCurrency = priceChartData[0]?.currency || 'USD';
                                        return formatCompetitorChartPrice(Number(value), firstCurrency, true);
                                      }}
                                    />
                                    <Tooltip
                                      formatter={(value: number, _name, props) => {
                                        const currencyCode = props.payload?.currency || 'USD';
                                        return [formatCompetitorChartPrice(Number(value), currencyCode), 'Price'];
                                      }}
                                    />
                                    <Line type="monotone" dataKey="price" stroke="#4472C4" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                  </RechartsLineChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="overflow-hidden rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Observed</TableHead>
                                      <TableHead>Price</TableHead>
                                      <TableHead>Availability</TableHead>
                                      <TableHead>Promotion</TableHead>
                                      <TableHead className="w-[110px]">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {competitorPriceHistory.map((price: CompetitorPriceEntry) => (
                                      <TableRow key={price.id}>
                                        <TableCell className="text-sm">
                                          {new Date(price.timestamp).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                          {price.currency} {Number(price.price).toFixed(2)}
                                        </TableCell>
                                        <TableCell>{price.availability || 'in_stock'}</TableCell>
                                        <TableCell>
                                          {price.isPromotion
                                            ? price.promotionType || 'Promotion'
                                            : 'Standard'}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleEditPriceClick(price)}
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              disabled={deletePriceMutation.isPending}
                                              onClick={() => deletePriceMutation.mutate(price.id)}
                                            >
                                              <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {isLoadingCompetitorProducts ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : competitorProducts.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>No Products Linked</CardTitle>
                    <CardDescription>
                      You haven't linked any products to this competitor yet.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-center py-6">
                      <Button onClick={() => setOpenProductDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Link Your First Product
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Your Product</TableHead>
                        <TableHead>Your SKU</TableHead>
                        <TableHead>Your Price</TableHead>
                        <TableHead>Competitor SKU</TableHead>
                        <TableHead>Competitor URL</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitorProducts.map((cp: any) => (
                        <TableRow key={cp.id}>
                          <TableCell className="font-medium">{cp.product?.name || 'Unknown Product'}</TableCell>
                          <TableCell>{cp.product?.sku || '-'}</TableCell>
                          <TableCell>${parseFloat(cp.product?.currentPrice || '0').toFixed(2)}</TableCell>
                          <TableCell>{cp.competitorSku || '-'}</TableCell>
                          <TableCell>
                            {cp.competitorUrl ? (
                              <a
                                href={cp.competitorUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                View
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePriceClick(cp)}
                                title="Manage Price History"
                              >
                                <DollarSign className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  unlinkProductMutation.mutate({
                                    competitorId: selectedCompetitor.id,
                                    productLinkId: cp.id,
                                  })
                                }
                                title="Unlink Product"
                                disabled={unlinkProductMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
