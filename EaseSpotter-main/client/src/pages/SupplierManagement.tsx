import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Calendar,
  FileText,
  Search,
  ArrowUpDown,
  Settings,
  Plus,
  Pencil,
  XCircle,
  Zap,
  Activity,
  Star,
  Filter,
  Loader2,
  Trash,
} from "lucide-react";
import {
  CircularProgressbarWithChildren,
  buildStyles,
} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { getCurrencySymbol } from "@/lib/currency-utils";

// Type definitions based on database schema
interface Supplier {
  id: number;
  name: string;
  vendorId: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  country: string;
  categories: string;
  status: "active" | "probation" | "inactive" | "blacklisted";
  paymentTerms: string;
  leadTime: number;
  minimumOrderQuantity: number;
  performanceScore: number;
  createdAt: string;
  updatedAt: string;
}

interface SupplierPerformance {
  id: number;
  supplierId: number;
  vendorId: number;
  metricDate: string;
  onTimeDeliveryRate: number;
  qualityScore: number;
  responseTime: number;
  priceCompetitiveness: number;
  costSavings: number;
  defectRate: number;
  riskScore: number;
  complianceScore: number;
  innovationScore: number;
  overallScore: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface SupplierCost {
  id: number;
  supplierId: number;
  vendorId: number;
  productId: number;
  costDate: string;
  unitCost: string;
  currencyCode: string;
  quantity: number;
  totalCost: string;
  priceFluctuation: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  productName?: string; // Joined from products table
}

interface ProductOption {
  id: number;
  name: string;
  sku?: string;
  currentPrice?: string;
}

interface NegotiationRecommendation {
  id: number;
  supplierId: number;
  vendorId: number;
  recommendationDate: string;
  recommendationType: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  currentValue: string;
  recommendedValue: string;
  potentialSavings: string;
  confidenceScore: string;
  rationale: string;
  tactics: string; // JSON string of tactics array
  createdAt: string;
  updatedAt: string;
}

interface Tactic {
  tactic: string;
  description: string;
  priority: number;
}

// Custom hook for supplier data
function useSupplierData(supplierId?: number) {
  const { user } = useAuth();
  const vendorId = user?.vendorId;
  
  console.log("Current user in useSupplierData:", user);

  // Get all suppliers for the vendor
  const {
    data: suppliers = [],
    isLoading: isSuppliersLoading,
    isError: isSuppliersError,
    refetch: refetchSuppliers,
    error: suppliersError,
  } = useQuery<Supplier[]>({
    queryKey: ["suppliers", vendorId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/suppliers`);
        console.log("Supplier API response:", res.status, res.statusText);
        if (!res.ok) throw new Error(`Failed to fetch suppliers: ${res.status} ${res.statusText}`);
        const data = await res.json();
        console.log("Supplier data:", data);
        return data;
      } catch (error) {
        console.error("Error fetching suppliers:", error);
        throw error;
      }
    },
    // Only enable the query when we have a user with proper authentication
    enabled: !!user,
  });

  // Get supplier performance metrics if a supplier is selected
  const {
    data: performance,
    isLoading: isPerformanceLoading,
    isError: isPerformanceError,
  } = useQuery<SupplierPerformance>({
    queryKey: ["supplier-performance", supplierId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/supplier-performance/${supplierId}`
      );
      if (!res.ok) throw new Error("Failed to fetch supplier performance");
      return res.json();
    },
    enabled: !!supplierId,
  });

  // Get supplier costs if a supplier is selected
  const {
    data: costs = [],
    isLoading: isCostsLoading,
    isError: isCostsError,
  } = useQuery<SupplierCost[]>({
    queryKey: ["supplier-costs", supplierId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/supplier-costs?supplierId=${supplierId}`
      );
      if (!res.ok) throw new Error("Failed to fetch supplier costs");
      return res.json();
    },
    enabled: !!supplierId,
  });

  // Get negotiation recommendations if a supplier is selected
  const {
    data: recommendations = [],
    isLoading: isRecommendationsLoading,
    isError: isRecommendationsError,
  } = useQuery<NegotiationRecommendation[]>({
    queryKey: ["negotiation-recommendations", supplierId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/negotiation-recommendations?supplierId=${supplierId}`
      );
      if (!res.ok)
        throw new Error("Failed to fetch negotiation recommendations");
      return res.json();
    },
    enabled: !!supplierId,
  });

  return {
    suppliers,
    performance,
    costs,
    recommendations,
    isLoading:
      isSuppliersLoading ||
      (!!supplierId &&
        (isPerformanceLoading ||
          isCostsLoading ||
          isRecommendationsLoading)),
    isError: isSuppliersError, // Only consider the main supplier data fetch as critical error
    refetchSuppliers,
  };
}

// Supplier Status Badge component
function SupplierStatusBadge({ status }: { status: Supplier["status"] }) {
  const statusConfig = {
    active: { variant: "success", label: "Active" },
    probation: { variant: "warning", label: "Probation" },
    inactive: { variant: "secondary", label: "Inactive" },
    blacklisted: { variant: "destructive", label: "Blacklisted" },
  } as const;

  const config = statusConfig[status] || statusConfig.inactive;

  return (
    <Badge
      variant={
        config.variant as "default" | "destructive" | "outline" | "secondary"
      }
    >
      {config.label}
    </Badge>
  );
}

// Supplier List Component
function SupplierList({
  suppliers,
  isLoading,
  onSelectSupplier,
  selectedSupplierId,
}: {
  suppliers: Supplier[];
  isLoading: boolean;
  onSelectSupplier: (supplierId: number) => void;
  selectedSupplierId?: number;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredSuppliers = suppliers.filter((supplier) => {
    return (
      (supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.contactName.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === "all" || supplier.status === statusFilter)
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="cursor-pointer">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="probation">Probation</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="blacklisted">Blacklisted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredSuppliers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No suppliers found matching your criteria.
        </div>
      ) : (
        filteredSuppliers.map((supplier) => (
          <Card
            key={supplier.id}
            className={`cursor-pointer hover:shadow-md transition-shadow ${
              selectedSupplierId === supplier.id
                ? "border-primary border-2"
                : ""
            }`}
            onClick={() => onSelectSupplier(supplier.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between">
                <CardTitle className="text-lg">{supplier.name}</CardTitle>
                <SupplierStatusBadge status={supplier.status} />
              </div>
              <CardDescription>
                Contact: {supplier.contactName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  <Star className="h-4 w-4 inline-block mr-1 text-primary" />
                  Performance Score: {parseFloat(supplier.performanceScore as any).toFixed(1)}/5
                </span>
                <Badge variant="outline" className="font-mono">
                  {supplier.paymentTerms}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// Supplier Performance Component
function SupplierPerformanceView({
  supplier,
  performance,
  isLoading,
}: {
  supplier?: Supplier;
  performance?: SupplierPerformance;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <Skeleton className="h-48 w-48 rounded-full mx-auto" />
            <div className="space-y-4 flex-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!supplier || !performance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supplier Performance</CardTitle>
          <CardDescription>Select a supplier to view performance metrics</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center text-muted-foreground">
            <Truck className="h-10 w-10 mx-auto mb-4 opacity-30" />
            <p>No supplier selected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Metrics</CardTitle>
        <CardDescription>
          Last updated: {new Date(performance.metricDate).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-shrink-0 w-48 h-48 mx-auto">
            <CircularProgressbarWithChildren
              value={performance.overallScore * 20} // Convert 0-5 to 0-100
              strokeWidth={10}
              styles={buildStyles({
                strokeLinecap: "round",
                pathColor: `var(--primary)`,
                trailColor: "#e9ecef",
              })}
            >
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">
                  {parseFloat(performance.overallScore as any).toFixed(1)}
                </div>
                <div className="text-sm text-muted-foreground">Overall Score</div>
              </div>
            </CircularProgressbarWithChildren>
          </div>

          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm flex justify-between">
                <span>Quality Score</span>
                <span>{parseFloat(performance.qualityScore as any).toFixed(1)}/5</span>
              </Label>
              <Progress value={performance.qualityScore * 20} className="h-3" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm flex justify-between">
                <span>On-Time Delivery</span>
                <span>{(parseFloat(performance.onTimeDeliveryRate as any) * 100).toFixed(0)}%</span>
              </Label>
              <Progress
                value={performance.onTimeDeliveryRate * 100}
                className="h-3"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm flex justify-between">
                <span>Price Competitiveness</span>
                <span>{parseFloat(performance.priceCompetitiveness as any).toFixed(1)}/5</span>
              </Label>
              <Progress
                value={performance.priceCompetitiveness * 20}
                className="h-3"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm flex justify-between">
                <span>Response Time</span>
                <span>{parseFloat(performance.responseTime as any).toFixed(1)} hrs</span>
              </Label>
              <Progress
                value={Math.max(0, 100 - performance.responseTime * 10)}
                className="h-3"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="border rounded-md p-4">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Compliance Score
            </div>
            <div className="text-2xl font-bold flex items-center">
              {parseFloat(performance.complianceScore as any).toFixed(1)}
              <Badge
                variant={
                  performance.complianceScore > 4
                    ? "success"
                    : performance.complianceScore > 3
                    ? "default"
                    : "destructive"
                }
                className="ml-2"
              >
                {performance.complianceScore > 4
                  ? "High"
                  : performance.complianceScore > 3
                  ? "Medium"
                  : "Low"}
              </Badge>
            </div>
          </div>
          <div className="border rounded-md p-4">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Risk Score
            </div>
            <div className="text-2xl font-bold flex items-center">
              {parseFloat(performance.riskScore as any).toFixed(1)}
              <Badge
                variant={
                  performance.riskScore < 2
                    ? "success"
                    : performance.riskScore < 3
                    ? "default"
                    : "destructive"
                }
                className="ml-2"
              >
                {performance.riskScore < 2
                  ? "Low"
                  : performance.riskScore < 3
                  ? "Medium"
                  : "High"}
              </Badge>
            </div>
          </div>
          <div className="border rounded-md p-4">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Innovation Score
            </div>
            <div className="text-2xl font-bold">
              {parseFloat(performance.innovationScore as any).toFixed(1)}/5
            </div>
          </div>
          <div className="border rounded-md p-4">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Cost Savings
            </div>
            <div className="text-2xl font-bold">
              ${performance.costSavings.toLocaleString()}
            </div>
          </div>
        </div>

        {performance.notes && (
          <div className="mt-6 p-4 border rounded-md bg-muted/50">
            <h4 className="font-medium mb-2">Notes</h4>
            <p className="text-sm text-muted-foreground">{performance.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Cost History Component
function CostHistoryView({
  supplier,
  costs,
  isLoading,
}: {
  supplier?: Supplier;
  costs: SupplierCost[];
  isLoading: boolean;
}) {
  const { currency } = useCurrency();
  const currencySymbol = getCurrencySymbol(currency);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [editingCost, setEditingCost] = useState<SupplierCost | null>(null);
  const [productId, setProductId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costDate, setCostDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof SupplierCost;
    direction: "asc" | "desc";
  }>({ key: "costDate", direction: "desc" });

  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: Boolean(supplier),
  });

  const resetCostForm = () => {
    setEditingCost(null);
    setProductId("");
    setUnitCost("");
    setQuantity("");
    setCostDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  };

  const openCreateCostDialog = () => {
    resetCostForm();
    setShowCostDialog(true);
  };

  const openEditCostDialog = (cost: SupplierCost) => {
    setEditingCost(cost);
    setProductId(String(cost.productId));
    setUnitCost(cost.unitCost || "");
    setQuantity(cost.quantity ? String(cost.quantity) : "");
    setCostDate(cost.costDate ? new Date(cost.costDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setNotes(cost.notes || "");
    setShowCostDialog(true);
  };

  const saveCostMutation = useMutation({
    mutationFn: async () => {
      if (!supplier) throw new Error("Select a supplier first");

      const payload = {
        supplierId: supplier.id,
        productId: Number(productId),
        unitCost: Number(unitCost),
        quantity: quantity ? Number(quantity) : undefined,
        costDate,
        currencyCode: currency,
        notes,
      };

      const res = editingCost
        ? await apiRequest("PATCH", `/api/supplier-costs/${editingCost.id}`, payload)
        : await apiRequest("POST", "/api/supplier-costs", payload);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.error || "Failed to save supplier cost");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: editingCost ? "Cost updated" : "Cost added",
        description: editingCost
          ? "Supplier cost history has been updated."
          : "Supplier cost history has been recorded.",
      });
      setShowCostDialog(false);
      resetCostForm();
      queryClient.invalidateQueries({ queryKey: ["supplier-costs", supplier?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/margin-optimization"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save cost",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sortedCosts = [...costs].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === "asc" ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === "asc" ? 1 : -1;
    }
    return 0;
  });

  const handleSort = (key: keyof SupplierCost) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!supplier) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost History</CardTitle>
          <CardDescription>Select a supplier to view cost history</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center text-muted-foreground">
            <DollarSign className="h-10 w-10 mx-auto mb-4 opacity-30" />
            <p>No supplier selected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Cost History</CardTitle>
          <CardDescription>
            Historical cost data for {supplier.name}
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreateCostDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Cost
        </Button>
      </CardHeader>
      <CardContent>
        {costs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No cost data available for this supplier.
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("productName")}
                  >
                    Product
                    {sortConfig.key === "productName" && (
                      <ArrowUpDown className="ml-1 h-3 w-3 inline-block" />
                    )}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("costDate")}
                  >
                    Date
                    {sortConfig.key === "costDate" && (
                      <ArrowUpDown className="ml-1 h-3 w-3 inline-block" />
                    )}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-right"
                    onClick={() => handleSort("unitCost")}
                  >
                    Unit Cost
                    {sortConfig.key === "unitCost" && (
                      <ArrowUpDown className="ml-1 h-3 w-3 inline-block" />
                    )}
                  </TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead
                    className="cursor-pointer text-right"
                    onClick={() => handleSort("priceFluctuation")}
                  >
                    Change %
                    {sortConfig.key === "priceFluctuation" && (
                      <ArrowUpDown className="ml-1 h-3 w-3 inline-block" />
                    )}
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCosts.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell className="font-medium">
                      {cost.productName || `Product #${cost.productId}`}
                    </TableCell>
                    <TableCell>
                      {new Date(cost.costDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(cost.unitCost))}
                    </TableCell>
                    <TableCell className="text-right">
                      {cost.quantity ? cost.quantity.toLocaleString() : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      {cost.totalCost
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(cost.totalCost))
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`${
                          parseFloat(cost.priceFluctuation || "0") > 0
                            ? "text-destructive"
                            : parseFloat(cost.priceFluctuation || "0") < 0
                            ? "text-emerald-600"
                            : ""
                        }`}
                      >
                        {parseFloat(cost.priceFluctuation || "0") > 0 && "+"}
                        {parseFloat(cost.priceFluctuation || "0").toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEditCostDialog(cost)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <Dialog open={showCostDialog} onOpenChange={setShowCostDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCost ? "Edit Supplier Cost" : "Add Supplier Cost"}</DialogTitle>
            <DialogDescription>
              Record the actual product cost from this supplier. These values power margin optimization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId} disabled={Boolean(editingCost)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.name}{product.sku ? ` (${product.sku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit Cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cost Date</Label>
              <Input
                type="date"
                value={costDate}
                onChange={(event) => setCostDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Invoice number, vendor note, or reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCostDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveCostMutation.mutate()}
              disabled={saveCostMutation.isPending || !productId || !unitCost}
            >
              {saveCostMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCost ? "Update Cost" : "Add Cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Negotiation Recommendations Component
function NegotiationRecommendationsView({
  supplier,
  recommendations,
  isLoading,
}: {
  supplier?: Supplier;
  recommendations: NegotiationRecommendation[];
  isLoading: boolean;
}) {
  const [selectedRecommendation, setSelectedRecommendation] = useState<NegotiationRecommendation | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!supplier) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Negotiation Recommendations</CardTitle>
          <CardDescription>Select a supplier to view recommendations</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center text-muted-foreground">
            <TrendingUp className="h-10 w-10 mx-auto mb-4 opacity-30" />
            <p>No supplier selected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Function to parse tactics JSON
  const parseTactics = (tacticsJson: string): Tactic[] => {
    try {
      return JSON.parse(tacticsJson);
    } catch (e) {
      console.error("Error parsing tactics JSON:", e);
      return [];
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Negotiation Recommendations</CardTitle>
          <CardDescription>
            AI-driven recommendations for {supplier.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No negotiation recommendations available for this supplier.
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((recommendation) => (
                <Card
                  key={recommendation.id}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row">
                    <div className={`p-4 text-white w-full md:w-24 flex items-center justify-center md:justify-start ${
                      recommendation.status === "pending"
                        ? "bg-amber-500"
                        : recommendation.status === "in_progress"
                        ? "bg-blue-500"
                        : recommendation.status === "completed"
                        ? "bg-emerald-500"
                        : "bg-red-500"
                    }`}>
                      <div className="text-center md:text-left">
                        <div className="text-sm font-medium">Status</div>
                        <div className="capitalize font-semibold">
                          {recommendation.status.replace("_", " ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 p-4">
                      <div className="flex flex-col md:flex-row justify-between">
                        <div>
                          <h3 className="font-semibold text-lg capitalize">
                            {recommendation.recommendationType} Negotiation
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(recommendation.recommendationDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="mt-2 md:mt-0 md:text-right">
                          <div className="text-sm text-muted-foreground">Potential Savings</div>
                          <div className="text-lg font-bold text-primary">
                            ${parseFloat(recommendation.potentialSavings).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Current Value</div>
                          <div className="font-medium">${parseFloat(recommendation.currentValue).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Recommended Value</div>
                          <div className="font-medium">${parseFloat(recommendation.recommendedValue).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Confidence Score</div>
                          <div className="font-medium flex items-center">
                            {(parseFloat(recommendation.confidenceScore) * 100).toFixed(0)}%
                            <Zap className="ml-1 h-4 w-4 text-amber-500" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRecommendation(recommendation);
                            setDetailsOpen(true);
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendation Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRecommendation?.recommendationType} Negotiation Recommendation
            </DialogTitle>
            <DialogDescription>
              Generated on {selectedRecommendation && new Date(selectedRecommendation.recommendationDate).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>

          {selectedRecommendation && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Current Value</Label>
                  <div className="text-lg font-bold">${parseFloat(selectedRecommendation.currentValue).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}</div>
                </div>
                <div className="space-y-1">
                  <Label>Recommended Value</Label>
                  <div className="text-lg font-bold">${parseFloat(selectedRecommendation.recommendedValue).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}</div>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Badge
                    variant={
                      selectedRecommendation.status === "pending"
                        ? "outline"
                        : selectedRecommendation.status === "in_progress"
                        ? "default"
                        : selectedRecommendation.status === "completed"
                        ? "success"
                        : "destructive"
                    }
                    className="capitalize"
                  >
                    {selectedRecommendation.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>

              <div>
                <Label>Rationale</Label>
                <div className="p-4 bg-muted rounded-md mt-2">
                  {selectedRecommendation.rationale}
                </div>
              </div>

              <div>
                <Label>Recommended Tactics</Label>
                <div className="mt-2 space-y-3">
                  {parseTactics(selectedRecommendation.tactics).map((tactic, index) => (
                    <div key={index} className="border rounded-md p-3">
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-2">
                          Priority {tactic.priority}
                        </Badge>
                        <h4 className="font-medium">{tactic.tactic}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {tactic.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <div>
                  <Label>Potential Savings</Label>
                  <div className="text-lg font-bold text-primary">
                    ${parseFloat(selectedRecommendation.potentialSavings).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <Label>Confidence Score</Label>
                  <div className="text-lg font-bold flex items-center justify-end">
                    {(parseFloat(selectedRecommendation.confidenceScore) * 100).toFixed(0)}%
                    <Zap className="ml-1 h-4 w-4 text-amber-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
            {selectedRecommendation?.status === "pending" && (
              <Button variant="default">
                Start Negotiation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Supplier Details Component
function SupplierDetailsView({
  supplier,
  isLoading,
}: {
  supplier?: Supplier;
  isLoading: boolean;
}) {
  // IMPORTANT: All hooks must be at the top level, before any conditionals
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Update supplier mutation
  const updateSupplierMutation = useMutation({
    mutationFn: async (supplierData: Partial<Supplier>) => {
      if (!supplier) return {} as Supplier;
      
      const res = await apiRequest("PUT", `/api/suppliers/${supplier.id}`, supplierData);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update supplier");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Supplier updated",
        description: "Supplier information has been updated successfully",
      });
      setShowEditDialog(false);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update supplier",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Delete supplier mutation
  const deleteSupplierMutation = useMutation({
    mutationFn: async () => {
      if (!supplier) return {};
      
      const res = await apiRequest("DELETE", `/api/suppliers/${supplier.id}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete supplier");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Supplier deleted",
        description: "Supplier has been deleted successfully",
      });
      setShowDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete supplier",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle update form submission
  const handleUpdateSupplier = (data: Partial<Supplier>) => {
    updateSupplierMutation.mutate(data);
  };
  
  // Handle delete confirmation
  const handleDeleteSupplier = () => {
    deleteSupplierMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!supplier) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supplier Details</CardTitle>
          <CardDescription>Select a supplier to view details</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-4 opacity-30" />
            <p>No supplier selected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{supplier.name}</CardTitle>
          <CardDescription>Supplier Information</CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <SupplierStatusBadge status={supplier.status} />
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowEditDialog(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
          >
            <Trash className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardHeader>
      
      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
            <DialogDescription>
              Update supplier information
            </DialogDescription>
          </DialogHeader>
          <EditSupplierForm 
            supplier={supplier}
            onSubmit={handleUpdateSupplier}
            isLoading={updateSupplierMutation.isPending}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {supplier.name}? This action cannot be undone and
              will remove all associated data including performance metrics, cost history, and negotiation recommendations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSupplier}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSupplierMutation.isPending}
            >
              {deleteSupplierMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Supplier"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Contact Person</Label>
              <div className="font-medium mt-1">{supplier.contactName}</div>
            </div>
            <div>
              <Label>Email</Label>
              <div className="font-medium mt-1">{supplier.contactEmail}</div>
            </div>
            <div>
              <Label>Phone</Label>
              <div className="font-medium mt-1">{supplier.contactPhone}</div>
            </div>
            <div>
              <Label>Address</Label>
              <div className="font-medium mt-1">{supplier.address}</div>
            </div>
            <div>
              <Label>Country</Label>
              <div className="font-medium mt-1">{supplier.country}</div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {supplier.categories.split(",").map((category, i) => (
                  <Badge key={i} variant="secondary">
                    {category.trim()}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Payment Terms</Label>
              <div className="font-medium mt-1">{supplier.paymentTerms}</div>
            </div>
            <div>
              <Label>Lead Time</Label>
              <div className="font-medium mt-1">{supplier.leadTime} days</div>
            </div>
            <div>
              <Label>Minimum Order Quantity</Label>
              <div className="font-medium mt-1">{supplier.minimumOrderQuantity.toLocaleString()} units</div>
            </div>
            <div>
              <Label>Performance Score</Label>
              <div className="font-medium mt-1 flex items-center">
                {parseFloat(supplier.performanceScore as any).toFixed(1)}/5.0
                <Star className="h-4 w-4 text-primary ml-2" />
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between mt-6 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Created: {new Date(supplier.createdAt).toLocaleDateString()}
          </div>
          <div className="text-sm text-muted-foreground">
            Last Updated: {new Date(supplier.updatedAt).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Main Supplier Management Page
export default function SupplierManagement() {
  // All state variables and hooks at the top of the component
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>();
  const { suppliers, performance, costs, recommendations, isLoading, isError } = useSupplierData(selectedSupplierId);
  const { toast } = useToast();
  const [showCreateSupplierDialog, setShowCreateSupplierDialog] = useState(false);
  const queryClient = useQueryClient();

  // Create new supplier mutation - ALWAYS declared regardless of conditions
  const createSupplierMutation = useMutation({
    mutationFn: async (supplierData: Omit<Supplier, "id" | "vendorId" | "createdAt" | "updatedAt">) => {
      const res = await apiRequest("POST", "/api/suppliers", supplierData);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create supplier");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Supplier created",
        description: "New supplier has been added successfully",
      });
      setShowCreateSupplierDialog(false);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create supplier",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleCreateSupplier = (data: Omit<Supplier, "id" | "vendorId" | "createdAt" | "updatedAt">) => {
    createSupplierMutation.mutate(data);
  };

  // Find selected supplier
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === selectedSupplierId
  );

  // Render error state if needed
  if (isError) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
            <div>
              <h3 className="text-lg font-medium text-red-800">
                Error Loading Data
              </h3>
              <p className="text-red-700 mt-1">
                There was a problem loading supplier data. Please try refreshing
                the page or contact support if the problem persists.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Supplier Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your suppliers, track performance, and optimize procurement
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateSupplierDialog(true)}
          className="flex items-center"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Supplier
        </Button>
      </div>
      
      {/* Create Supplier Dialog */}
      <Dialog open={showCreateSupplierDialog} onOpenChange={setShowCreateSupplierDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Supplier</DialogTitle>
            <DialogDescription>
              Add a new supplier to your vendor account
            </DialogDescription>
          </DialogHeader>
          <CreateSupplierForm 
            onSubmit={handleCreateSupplier} 
            isLoading={createSupplierMutation.isPending}
            onCancel={() => setShowCreateSupplierDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <SupplierList
            suppliers={suppliers}
            isLoading={isLoading}
            onSelectSupplier={setSelectedSupplierId}
            selectedSupplierId={selectedSupplierId}
          />
        </div>

        <div className="md:col-span-2 space-y-4">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="costs">Cost History</TabsTrigger>
              <TabsTrigger value="negotiations">Negotiations</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="p-0">
              <SupplierDetailsView
                supplier={selectedSupplier}
                isLoading={isLoading}
              />
            </TabsContent>
            
            <TabsContent value="performance" className="p-0">
              <SupplierPerformanceView
                supplier={selectedSupplier}
                performance={performance}
                isLoading={isLoading}
              />
            </TabsContent>
            
            <TabsContent value="costs" className="p-0">
              <CostHistoryView
                supplier={selectedSupplier}
                costs={costs}
                isLoading={isLoading}
              />
            </TabsContent>
            
            <TabsContent value="negotiations" className="p-0">
              <NegotiationRecommendationsView
                supplier={selectedSupplier}
                recommendations={recommendations}
                isLoading={isLoading}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
// Create Supplier Form Component
// Edit Supplier Form component
function EditSupplierForm({
  supplier,
  onSubmit,
  isLoading,
  onCancel,
}: {
  supplier: Supplier;
  onSubmit: (data: Partial<Supplier>) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(supplier.name);
  const [contactName, setContactName] = useState(supplier.contactName);
  const [contactEmail, setContactEmail] = useState(supplier.contactEmail);
  const [contactPhone, setContactPhone] = useState(supplier.contactPhone);
  const [address, setAddress] = useState(supplier.address);
  const [country, setCountry] = useState(supplier.country);
  const [categories, setCategories] = useState(supplier.categories);
  const [status, setStatus] = useState<Supplier["status"]>(supplier.status);
  const [paymentTerms, setPaymentTerms] = useState(supplier.paymentTerms);
  const [leadTime, setLeadTime] = useState(supplier.leadTime.toString());
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState(supplier.minimumOrderQuantity.toString());
  const [performanceScore, setPerformanceScore] = useState(supplier.performanceScore.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!name) {
      return;
    }

    // Create supplier update object
    const supplierData: Partial<Supplier> = {
      name,
      contactName,
      contactEmail,
      contactPhone,
      address,
      country,
      categories,
      status,
      paymentTerms,
      leadTime: parseInt(leadTime),
      minimumOrderQuantity: parseInt(minimumOrderQuantity),
      performanceScore: parseFloat(performanceScore),
    };

    onSubmit(supplierData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Supplier Name <span className="text-red-500">*</span></Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter supplier name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-contactName">Contact Person</Label>
            <Input
              id="edit-contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Enter contact person name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-contactEmail">Contact Email</Label>
            <Input
              id="edit-contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@supplier.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-contactPhone">Contact Phone</Label>
            <Input
              id="edit-contactPhone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Address</Label>
            <Input
              id="edit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter supplier address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-country">Country</Label>
            <Input
              id="edit-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Enter country"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-categories">Categories (comma separated)</Label>
            <Input
              id="edit-categories"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="Electronics, Apparel, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as Supplier["status"])}>
              <SelectTrigger id="edit-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="probation">Probation</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-paymentTerms">Payment Terms</Label>
            <Input
              id="edit-paymentTerms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Net 30, Net 60, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-leadTime">Lead Time (days)</Label>
            <Input
              id="edit-leadTime"
              type="number"
              min="0"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-minimumOrderQuantity">Minimum Order Quantity</Label>
            <Input
              id="edit-minimumOrderQuantity"
              type="number"
              min="0"
              value={minimumOrderQuantity}
              onChange={(e) => setMinimumOrderQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-performanceScore">Performance Score (0-5)</Label>
            <Input
              id="edit-performanceScore"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={performanceScore}
              onChange={(e) => setPerformanceScore(e.target.value)}
            />
          </div>
        </div>
      </div>

      <DialogFooter className="mt-6 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Update Supplier"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateSupplierForm({
  onSubmit,
  isLoading,
  onCancel,
}: {
  onSubmit: (data: Omit<Supplier, "id" | "vendorId" | "createdAt" | "updatedAt">) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [categories, setCategories] = useState("");
  const [status, setStatus] = useState<Supplier["status"]>("active");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [leadTime, setLeadTime] = useState("7");
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState("100");
  const [performanceScore, setPerformanceScore] = useState("0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!name) {
      return;
    }

    // Create supplier object
    const supplierData = {
      name,
      contactName,
      contactEmail,
      contactPhone,
      address,
      country,
      categories,
      status,
      paymentTerms,
      leadTime: parseInt(leadTime),
      minimumOrderQuantity: parseInt(minimumOrderQuantity),
      performanceScore: parseFloat(performanceScore),
    };

    onSubmit(supplierData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Supplier Name <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter supplier name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Person</Label>
            <Input
              id="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Enter contact person name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@supplier.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input
              id="contactPhone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter supplier address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Enter country"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categories">Categories (comma separated)</Label>
            <Input
              id="categories"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="Electronics, Apparel, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as Supplier["status"])}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="probation">Probation</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Select value={paymentTerms} onValueChange={setPaymentTerms}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Net 30">Net 30</SelectItem>
                <SelectItem value="Net 60">Net 60</SelectItem>
                <SelectItem value="Net 90">Net 90</SelectItem>
                <SelectItem value="Immediate">Immediate</SelectItem>
                <SelectItem value="Cash on Delivery">Cash on Delivery</SelectItem>
                <SelectItem value="Letter of Credit">Letter of Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadTime">Lead Time (days)</Label>
            <Input
              id="leadTime"
              type="number"
              min="0"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              placeholder="7"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="minimumOrderQuantity">Minimum Order Quantity</Label>
            <Input
              id="minimumOrderQuantity"
              type="number"
              min="0"
              value={minimumOrderQuantity}
              onChange={(e) => setMinimumOrderQuantity(e.target.value)}
              placeholder="100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="performanceScore">
              Initial Performance Score (0-5)
            </Label>
            <Input
              id="performanceScore"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={performanceScore}
              onChange={(e) => setPerformanceScore(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="mr-2">Creating supplier...</span>
              <Loader2 className="h-4 w-4 animate-spin" />
            </>
          ) : (
            'Create Supplier'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
