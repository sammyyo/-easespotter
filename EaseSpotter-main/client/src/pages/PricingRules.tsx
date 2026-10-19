import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Copy, Trash2, Filter, RefreshCw, InfoIcon, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PricingRuleForm } from "@/components/pricing/PricingRuleForm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { RulePreview } from "@/components/pricing/RulePreview";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface PricingRule {
  id: number;
  name: string;
  description?: string;
  priority: number;
  isActive: boolean;
  adjustment: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  conditions: Record<string, unknown>;
  category?: string;
  metadata?: {
    isPartOfTest?: boolean;
    testGroup?: string | null;
    minimumMarginGuardrail?: {
      enabled?: boolean;
      minimumMarginPercent?: number;
      mode?: string;
    };
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface MarginRecommendation {
  productId: number;
  productName: string;
  sku?: string;
  category?: string;
  supplierName?: string;
  currentPrice?: number;
  latestUnitCost?: number;
  previousUnitCost?: number | null;
  costChangePercent?: number | null;
  currentMargin?: number;
  targetMargin?: number;
  minimumMarginPercent?: number | null;
  minimumAllowedPrice?: number | null;
  recommendedPrice?: number;
  priceDelta?: number;
  priceDeltaPercent?: number;
  hasSupplierCost: boolean;
  status: "missing_cost" | "increase_recommended" | "review_recommended" | "on_target";
  message: string;
}

interface MarginOptimizationResponse {
  targetMargin: number;
  generatedAt: string;
  recommendations: MarginRecommendation[];
}

interface UserSettings {
  dashboardLayout?: Record<string, any> | null;
}

interface SupplierOption {
  id: number;
  name: string;
}

interface SupplierInvoice {
  id: number;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate: string;
  status: string;
  subtotal?: string;
  currencyCode?: string;
}

interface PriceChangeApproval {
  id: number;
  productName: string;
  oldPrice: string;
  recommendedPrice: string;
  targetMargin: string;
  latestUnitCost: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface RepricingSchedule {
  isEnabled: boolean;
  targetMargin: string;
  mode: string;
  frequency: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

const getMinimumMarginGuardrail = (rule?: PricingRule | null) => {
  const guardrail = rule?.metadata?.minimumMarginGuardrail;
  if (!guardrail?.enabled) return null;

  const minimumMarginPercent = Number(guardrail.minimumMarginPercent);
  if (!Number.isFinite(minimumMarginPercent)) return null;

  return minimumMarginPercent;
};

export default function PricingRules() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [activeRule, setActiveRule] = useState<PricingRule | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("priority");
  const [targetMargin, setTargetMargin] = useState(35);
  const [marginFilter, setMarginFilter] = useState("actionable");
  const [pendingMarginRecommendation, setPendingMarginRecommendation] = useState<MarginRecommendation | null>(null);
  const [invoiceSupplierId, setInvoiceSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceCsvText, setInvoiceCsvText] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleMode, setScheduleMode] = useState("approval_required");
  const [scheduleFrequency, setScheduleFrequency] = useState("daily");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManagePricingRules = isAdmin || Boolean(user?.vendorId);
  const canApplyMarginOptimization = isAdmin || Boolean(user?.vendorId);

  const buildRulePayload = (formData: any) => {
    const metadata: Record<string, unknown> = {};

    if (formData.isPartOfTest) {
      metadata.isPartOfTest = true;
      metadata.testGroup = formData.testGroup || null;
    }

    if (formData.minimumMarginEnabled) {
      const minimumMarginPercent = Number(formData.minimumMarginPercent);
      if (Number.isFinite(minimumMarginPercent)) {
        metadata.minimumMarginGuardrail = {
          enabled: true,
          minimumMarginPercent,
          mode: "block",
        };
      }
    }

    return {
      name: formData.name,
      description: formData.description || null,
      priority: Number(formData.priority),
      isActive: Boolean(formData.isActive),
      category: formData.category || "other",
      conditions: typeof formData.conditions === "string"
        ? JSON.parse(formData.conditions)
        : formData.conditions || {},
      adjustment: {
        type: formData.adjustmentType,
        value: Number(formData.adjustmentValue),
      },
      startDate: formData.startDate || null,
      endDate: formData.endDate || null,
      targetSegment: formData.targetSegment && formData.targetSegment !== "all"
        ? formData.targetSegment
        : null,
      isTemplate: Boolean(formData.isTemplate),
      templateCategory: formData.isTemplate ? formData.templateCategory || null : null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      vendorId: user?.vendorId,
    };
  };

  const { data: rules = [], isLoading } = useQuery<PricingRule[]>({
    queryKey: ["/api/price-rules"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/price-rules");
      return response.json();
    },
  });

  const {
    data: marginOptimization,
    isLoading: isLoadingMarginOptimization,
    refetch: refetchMarginOptimization,
  } = useQuery<MarginOptimizationResponse>({
    queryKey: ["/api/pricing/margin-optimization", targetMargin],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/pricing/margin-optimization?targetMargin=${targetMargin}`);
      if (!response.ok) throw new Error("Failed to fetch margin optimization recommendations");
      return response.json();
    },
    enabled: Boolean(user?.vendorId),
  });

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ["/api/user-settings"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/user-settings");
      if (!response.ok) throw new Error("Failed to fetch user settings");
      return response.json();
    },
    enabled: Boolean(user),
  });

  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ["suppliers", user?.vendorId],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/suppliers");
      if (!response.ok) throw new Error("Failed to fetch suppliers");
      return response.json();
    },
    enabled: Boolean(user?.vendorId),
  });

  const { data: invoices = [] } = useQuery<SupplierInvoice[]>({
    queryKey: ["/api/supplier-invoices"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/supplier-invoices");
      if (!response.ok) throw new Error("Failed to fetch supplier invoices");
      return response.json();
    },
    enabled: Boolean(user?.vendorId),
  });

  const { data: approvals = [] } = useQuery<PriceChangeApproval[]>({
    queryKey: ["/api/pricing/approvals", "pending"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/pricing/approvals?status=pending");
      if (!response.ok) throw new Error("Failed to fetch pricing approvals");
      return response.json();
    },
    enabled: Boolean(user?.vendorId),
  });

  const { data: repricingSchedule } = useQuery<RepricingSchedule>({
    queryKey: ["/api/pricing/repricing-schedule"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/pricing/repricing-schedule");
      if (!response.ok) throw new Error("Failed to fetch repricing schedule");
      return response.json();
    },
    enabled: Boolean(user?.vendorId),
  });

  useEffect(() => {
    const savedMargin = userSettings?.dashboardLayout?.pricingTargetMargin;
    if (typeof savedMargin === "number" && savedMargin > 0 && savedMargin < 95) {
      setTargetMargin(savedMargin);
    }
  }, [userSettings]);

  useEffect(() => {
    if (repricingSchedule) {
      setScheduleEnabled(Boolean(repricingSchedule.isEnabled));
      setScheduleMode(repricingSchedule.mode || "approval_required");
      setScheduleFrequency(repricingSchedule.frequency || "daily");
    }
  }, [repricingSchedule]);

  // Prepare category options for filtering
  const categories = useMemo(() => {
    // Make sure rules is an array before using array methods
    const rulesArray = Array.isArray(rules) ? rules : [];
    
    const uniqueCategories = Array.from(
      new Set(rulesArray.map(rule => rule.category || 'uncategorized'))
    );
    
    return [
      { value: "all", label: "All Categories" },
      ...uniqueCategories.map(category => ({
        value: category,
        label: category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')
      }))
    ];
  }, [rules]);

  // Filter and sort rules
  const filteredRules = useMemo(() => {
    // Make sure rules is an array before using array methods
    const rulesArray = Array.isArray(rules) ? rules : [];
    let result = [...rulesArray];
    
    // Apply category filter
    if (categoryFilter && categoryFilter !== "all") {
      result = result.filter(rule => 
        (rule.category || 'uncategorized') === categoryFilter
      );
    }
    
    // Apply sorting
    if (result.length > 0) {
      result.sort((a, b) => {
        switch (sortBy) {
          case "priority":
            return b.priority - a.priority;
          case "name":
            return a.name.localeCompare(b.name);
          case "date":
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          default:
            return 0;
        }
      });
    }
    
    return result;
  }, [rules, categoryFilter, sortBy]);

  const createRuleMutation = useMutation({
    mutationFn: async (formData: any) => {
      const response = await apiRequest("POST", "/api/price-rules", buildRulePayload(formData));

      if (!response.ok) throw new Error("Failed to create rule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Pricing rule created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create pricing rule",
        variant: "destructive",
      });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async (formData: any) => {
      if (!activeRule?.id) throw new Error("No rule selected");
      
      const response = await apiRequest("PATCH", `/api/price-rules/${activeRule.id}`, buildRulePayload(formData));

      if (!response.ok) throw new Error("Failed to update rule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      setIsEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Pricing rule updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update rule",
        variant: "destructive",
      });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ ruleId, isActive }: { ruleId: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/price-rules/${ruleId}`, { isActive });

      if (!response.ok) throw new Error("Failed to update rule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      toast({
        title: "Success",
        description: "Rule status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update rule status",
        variant: "destructive",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      const response = await apiRequest("DELETE", `/api/price-rules/${ruleId}`);

      if (!response.ok) throw new Error("Failed to delete rule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      setIsDeleteDialogOpen(false);
      setActiveRule(null);
      toast({
        title: "Success",
        description: "Pricing rule deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete pricing rule",
        variant: "destructive",
      });
    },
  });

  const duplicateRuleMutation = useMutation({
    mutationFn: async (rule: PricingRule) => {
      const duplicatedRule = {
        name: `${rule.name} (Copy)`,
        description: rule.description || "",
        priority: rule.priority,
        isActive: rule.isActive,
        adjustmentType: rule.adjustment.type,
        adjustmentValue: String(rule.adjustment.value),
        category: rule.category || "other",
        conditions: rule.conditions,
        startDate: (rule as any).startDate || null,
        endDate: (rule as any).endDate || null,
        targetSegment: (rule as any).targetSegment || "",
        isTemplate: Boolean((rule as any).isTemplate),
        templateCategory: (rule as any).templateCategory || "",
        isPartOfTest: Boolean((rule as any).metadata?.isPartOfTest),
        testGroup: (rule as any).metadata?.testGroup || "",
        minimumMarginEnabled: Boolean(rule.metadata?.minimumMarginGuardrail?.enabled),
        minimumMarginPercent: rule.metadata?.minimumMarginGuardrail?.minimumMarginPercent?.toString() || "",
      };
      
      const response = await apiRequest("POST", "/api/price-rules", buildRulePayload(duplicatedRule));

      if (!response.ok) throw new Error("Failed to duplicate rule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-rules"] });
      toast({
        title: "Success",
        description: "Pricing rule duplicated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate pricing rule",
        variant: "destructive",
      });
    },
  });

  const applyMarginRecommendationMutation = useMutation({
    mutationFn: async (recommendation: MarginRecommendation) => {
      const response = await apiRequest("POST", "/api/pricing/margin-optimization/apply", {
        productId: recommendation.productId,
        targetMargin,
        recommendedPrice: recommendation.recommendedPrice,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message || "Failed to apply recommendation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/margin-optimization", targetMargin] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/price-changes"] });
      toast({
        title: "Success",
        description: "Margin recommendation applied and price history updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to apply margin recommendation",
        variant: "destructive",
      });
    },
  });

  const saveTargetMarginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/user-settings", {
        dashboardLayout: {
          ...(userSettings?.dashboardLayout || {}),
          pricingTargetMargin: targetMargin,
        },
      });

      if (!response.ok) throw new Error("Failed to save target margin");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
      toast({
        title: "Target margin saved",
        description: "Your pricing automation default has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save target margin",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const importInvoiceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/supplier-invoices/import", {
        supplierId: Number(invoiceSupplierId),
        invoiceNumber,
        currencyCode: "USD",
        csvText: invoiceCsvText,
      });

      if (!response.ok) throw new Error("Failed to import invoice");
      return response.json();
    },
    onSuccess: () => {
      setInvoiceNumber("");
      setInvoiceCsvText("");
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      toast({
        title: "Invoice imported",
        description: "Invoice lines were imported and matched where possible.",
      });
    },
    onError: () => {
      toast({
        title: "Invoice import failed",
        description: "Check the supplier and CSV line format.",
        variant: "destructive",
      });
    },
  });

  const postInvoiceCostsMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest("POST", `/api/supplier-invoices/${invoiceId}/post-costs`, {
        targetMargin,
      });
      if (!response.ok) throw new Error("Failed to post invoice costs");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/approvals", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/margin-optimization", targetMargin] });
      toast({
        title: "Invoice posted",
        description: "Matched invoice lines created supplier costs and approval requests.",
      });
    },
  });

  const updateApprovalMutation = useMutation({
    mutationFn: async ({ approvalId, action }: { approvalId: number; action: string }) => {
      const response = await apiRequest("PATCH", `/api/pricing/approvals/${approvalId}`, { action });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message || "Failed to update approval");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/approvals", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/margin-optimization", targetMargin] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error) => {
      toast({
        title: "Approval update failed",
        description: error instanceof Error ? error.message : "Failed to update approval",
        variant: "destructive",
      });
    },
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/pricing/repricing-schedule", {
        isEnabled: scheduleEnabled,
        targetMargin,
        mode: scheduleMode,
        frequency: scheduleFrequency,
      });
      if (!response.ok) throw new Error("Failed to save schedule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/repricing-schedule"] });
      toast({ title: "Schedule saved", description: "Scheduled repricing settings were updated." });
    },
  });

  const runScheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/pricing/repricing-schedule/run", {
        targetMargin,
        mode: scheduleMode,
      });
      if (!response.ok) throw new Error("Failed to run scheduled repricing");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/approvals", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/repricing-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/margin-optimization", targetMargin] });
      toast({ title: "Repricing run complete", description: "Review any generated approval requests." });
    },
  });

  const handleEditRule = (rule: PricingRule) => {
    setActiveRule(rule);
    setIsEditDialogOpen(true);
  };

  const handleViewDetails = (rule: PricingRule) => {
    setActiveRule(rule);
    setIsDetailDialogOpen(true);
  };

  const handleDeleteRule = (rule: PricingRule) => {
    setActiveRule(rule);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (activeRule) {
      deleteRuleMutation.mutate(activeRule.id);
    }
  };

  const handleDuplicateRule = (rule: PricingRule) => {
    duplicateRuleMutation.mutate(rule);
  };

  const getCategoryBadgeVariant = (category?: string) => {
    switch (category) {
      case "seasonal":
        return "seasonal";
      case "competitive":
        return "competitive";
      case "inventory":
        return "inventory";
      case "promotional":
        return "promotional";
      case "loyalty":
        return "loyalty";
      case "clearance":
        return "clearance";
      case "bundle":
        return "bundle";
      default:
        return "outline";
    }
  };

  const formatCurrency = (value?: number | null) => {
    if (value === undefined || value === null || !Number.isFinite(value)) return "N/A";
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value?: number | null) => {
    if (value === undefined || value === null || !Number.isFinite(value)) return "N/A";
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  };

  const filteredMarginRecommendations = useMemo(() => {
    const recommendations = marginOptimization?.recommendations || [];
    return recommendations
      .filter((recommendation) => {
        if (marginFilter === "missing_cost") return !recommendation.hasSupplierCost;
        if (marginFilter === "on_target") return recommendation.status === "on_target";
        if (marginFilter === "all") return true;
        return recommendation.hasSupplierCost && recommendation.status !== "on_target" && recommendation.recommendedPrice;
      })
      .sort((a, b) => Math.abs(b.priceDeltaPercent || 0) - Math.abs(a.priceDeltaPercent || 0));
  }, [marginOptimization, marginFilter]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[150px] w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pricing Rules</h1>
          <p className="text-muted-foreground">
            Configure dynamic pricing rules to automatically adjust product prices
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canManagePricingRules}>
              <Plus className="h-4 w-4 mr-2" />
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create New Pricing Rule</DialogTitle>
              <DialogDescription>
                Configure a new pricing rule to dynamically adjust product prices based on specific conditions.
              </DialogDescription>
            </DialogHeader>
            <PricingRuleForm
              onSubmit={(data) => createRuleMutation.mutate(data)}
              isLoading={createRuleMutation.isPending}
              mode="create"
            />
          </DialogContent>
        </Dialog>
      </div>
      {!canManagePricingRules && (
        <p className="text-sm text-muted-foreground">
          A vendor account is required to create, edit, or delete pricing rules.
        </p>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Margin Optimization</CardTitle>
              <CardDescription>
                Recommendations based on the latest supplier cost for each product.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={marginFilter} onValueChange={setMarginFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="actionable">Needs action</SelectItem>
                  <SelectItem value="on_target">On target</SelectItem>
                  <SelectItem value="missing_cost">Missing cost</SelectItem>
                  <SelectItem value="all">All products</SelectItem>
                </SelectContent>
              </Select>
              <div className="w-28">
                <Input
                  type="number"
                  min={1}
                  max={94}
                  step={1}
                  value={targetMargin}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setTargetMargin(Number.isFinite(nextValue) ? nextValue : 35);
                  }}
                  aria-label="Target margin percentage"
                />
              </div>
              <span className="text-sm text-muted-foreground">target margin</span>
              <Button variant="outline" size="sm" onClick={() => refetchMarginOptimization()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveTargetMarginMutation.mutate()}
                disabled={saveTargetMarginMutation.isPending}
              >
                Save Default
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMarginOptimization ? (
            <Skeleton className="h-24 w-full" />
          ) : filteredMarginRecommendations.length > 0 ? (
            <div className="space-y-3">
              {filteredMarginRecommendations.map((recommendation) => (
                <div
                  key={recommendation.productId}
                  className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.4fr_repeat(4,0.8fr)_auto] md:items-center"
                >
                  <div>
                    <p className="font-medium">{recommendation.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {recommendation.supplierName || "Supplier cost"} · {recommendation.message}
                    </p>
                    {recommendation.minimumMarginPercent ? (
                      <Badge variant="outline" className="mt-2 bg-emerald-50 text-emerald-700">
                        Guardrail: {recommendation.minimumMarginPercent}% min margin
                      </Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cost Shift</p>
                    <p className="font-medium">{formatPercent(recommendation.costChangePercent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="font-medium">{formatPercent(recommendation.currentMargin)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current</p>
                    <p className="font-medium">{formatCurrency(recommendation.currentPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recommended</p>
                    <p className="font-medium">{formatCurrency(recommendation.recommendedPrice)}</p>
                  </div>
                  {recommendation.hasSupplierCost && recommendation.recommendedPrice ? (
                    <Button
                      size="sm"
                      disabled={
                        !canApplyMarginOptimization ||
                        recommendation.status === "on_target" ||
                        applyMarginRecommendationMutation.isPending
                      }
                      onClick={() => setPendingMarginRecommendation(recommendation)}
                    >
                      Apply
                    </Button>
                  ) : (
                    <Badge variant="outline">Add cost</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No products match the selected margin filter.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Import</CardTitle>
            <CardDescription>
              Import supplier invoice lines as CSV: SKU, description, quantity, unit cost, total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={invoiceSupplierId} onValueChange={setInvoiceSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Invoice number"
            />
            <Textarea
              value={invoiceCsvText}
              onChange={(event) => setInvoiceCsvText(event.target.value)}
              placeholder={"SKU-1, Product name, 12, 8.50, 102.00"}
              className="min-h-[100px]"
            />
            <Button
              className="w-full"
              disabled={!invoiceSupplierId || !invoiceCsvText || importInvoiceMutation.isPending}
              onClick={() => importInvoiceMutation.mutate()}
            >
              Import Invoice
            </Button>
            <div className="space-y-2">
              {invoices.slice(0, 3).map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">{invoice.invoiceNumber || `Invoice #${invoice.id}`}</p>
                    <p className="text-muted-foreground">{invoice.supplierName || "Supplier"} · {invoice.status}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => postInvoiceCostsMutation.mutate(invoice.id)}
                    disabled={postInvoiceCostsMutation.isPending || invoice.status === "posted"}
                  >
                    Post Costs
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval Queue</CardTitle>
            <CardDescription>
              Review cost-driven price changes before they affect live pricing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {approvals.length > 0 ? approvals.slice(0, 5).map((approval) => (
              <div key={approval.id} className="rounded-md border p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{approval.productName}</p>
                    <p className="text-muted-foreground">
                      ${Number(approval.oldPrice).toFixed(2)} → ${Number(approval.recommendedPrice).toFixed(2)}
                    </p>
                  </div>
                  <Badge variant="outline">{approval.status}</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => updateApprovalMutation.mutate({ approvalId: approval.id, action: "apply" })}>
                    Apply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateApprovalMutation.mutate({ approvalId: approval.id, action: "approve" })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateApprovalMutation.mutate({ approvalId: approval.id, action: "reject" })}>
                    Reject
                  </Button>
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No pending approvals.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Repricing</CardTitle>
            <CardDescription>
              Automatically create approvals or apply prices from latest supplier costs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm font-medium">Enabled</span>
              <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
            </div>
            <Select value={scheduleMode} onValueChange={setScheduleMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approval_required">Approval required</SelectItem>
                <SelectItem value="auto_apply">Auto apply</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scheduleFrequency} onValueChange={setScheduleFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Next run: {repricingSchedule?.nextRunAt ? new Date(repricingSchedule.nextRunAt).toLocaleString() : "Not scheduled"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => saveScheduleMutation.mutate()} disabled={saveScheduleMutation.isPending}>
                Save
              </Button>
              <Button onClick={() => runScheduleMutation.mutate()} disabled={runScheduleMutation.isPending}>
                Run Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Filters and Sort */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-muted/40 p-4 rounded-lg">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filter:</span>
          <Select 
            value={categoryFilter || "all"} 
            onValueChange={setCategoryFilter}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Rule Categories</SelectLabel>
                {categories.map(category => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Sort by:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority (Highest first)</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
              <SelectItem value="date">Updated Date (Newest)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rule Cards */}
      <div className="grid gap-4">
        {filteredRules.length > 0 ? (
          filteredRules.map((rule: PricingRule) => (
            <Card key={rule.id} className={!rule.isActive ? "opacity-70" : ""}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-medium">{rule.name}</CardTitle>
                    {rule.category && (
                      <Badge variant={getCategoryBadgeVariant(rule.category) as any} className="capitalize ml-2">
                        {rule.category.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {!rule.isActive && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                    {getMinimumMarginGuardrail(rule) !== null && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                        Margin floor {getMinimumMarginGuardrail(rule)}%
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {rule.description || "No description provided"}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(checked) =>
                            toggleRuleMutation.mutate({ ruleId: rule.id, isActive: checked })
                          }
                          disabled={!canManagePricingRules || toggleRuleMutation.isPending}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {rule.isActive ? "Disable Rule" : "Enable Rule"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <InfoIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Rule Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleViewDetails(rule)}>
                        <InfoIcon className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditRule(rule)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Rule
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateRule(rule)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive" 
                        onClick={() => handleDeleteRule(rule)}
                        disabled={!canManagePricingRules}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Rule
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Priority</p>
                    <p className="font-medium">{rule.priority}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Adjustment</p>
                    <p className="font-medium">
                      {rule.adjustment.type === 'percentage'
                        ? `${rule.adjustment.value}%`
                        : `$${rule.adjustment.value}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Conditions</p>
                    <p className="font-medium">
                      {Object.keys(rule.conditions).length} condition(s)
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Guardrail</p>
                    <p className="font-medium">
                      {getMinimumMarginGuardrail(rule) !== null
                        ? `${getMinimumMarginGuardrail(rule)}% min`
                        : "None"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Updated</p>
                    <p className="font-medium">
                      {new Date(rule.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <Accordion type="single" collapsible className="mt-4">
                  <AccordionItem value="conditions">
                    <AccordionTrigger className="text-sm py-2">
                      Preview Rule Impact
                    </AccordionTrigger>
                    <AccordionContent>
                      <RulePreview 
                        conditions={rule.conditions}
                        adjustment={rule.adjustment}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t pt-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleEditRule(rule)}
                  disabled={!canManagePricingRules}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => handleViewDetails(rule)}
                >
                  View Details
                </Button>
              </CardFooter>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {categoryFilter && categoryFilter !== "all" 
                ? `No pricing rules found matching the "${categoryFilter}" category. Try another filter or create a new rule.`
                : "No pricing rules found. Create your first rule to start dynamic pricing."}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Rule Dialog */}
      {activeRule && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Edit Pricing Rule</DialogTitle>
              <DialogDescription>
                Modify this pricing rule's configuration.
              </DialogDescription>
            </DialogHeader>
            <PricingRuleForm
              onSubmit={(data) => updateRuleMutation.mutate(data)}
              isLoading={updateRuleMutation.isPending}
              initialData={{
                ...activeRule,
                adjustmentType: activeRule.adjustment.type,
                adjustmentValue: activeRule.adjustment.value.toString(),
                startDate: (activeRule as any).startDate ? new Date((activeRule as any).startDate) : undefined,
                endDate: (activeRule as any).endDate ? new Date((activeRule as any).endDate) : undefined,
                targetSegment: (activeRule as any).targetSegment || "",
                isTemplate: Boolean((activeRule as any).isTemplate),
                templateCategory: (activeRule as any).templateCategory || "",
                isPartOfTest: Boolean((activeRule as any).metadata?.isPartOfTest),
                testGroup: (activeRule as any).metadata?.testGroup || "",
                minimumMarginEnabled: Boolean(activeRule.metadata?.minimumMarginGuardrail?.enabled),
                minimumMarginPercent: activeRule.metadata?.minimumMarginGuardrail?.minimumMarginPercent?.toString() || "",
              }}
              mode="edit"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Detail View Dialog */}
      {activeRule && (
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Pricing Rule Details</DialogTitle>
              <DialogDescription>
                Comprehensive information about this pricing rule.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 items-center">
                <h2 className="text-2xl font-bold">{activeRule.name}</h2>
                {activeRule.category && (
                  <Badge variant={getCategoryBadgeVariant(activeRule.category) as any} className="capitalize">
                    {activeRule.category.replace(/_/g, ' ')}
                  </Badge>
                )}
                <Badge variant={activeRule.isActive ? "default" : "outline"}>
                  {activeRule.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <p className="text-muted-foreground">
                {activeRule.description || "No description provided"}
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rule Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Priority:</span>
                      <span>{activeRule.priority}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Adjustment Type:</span>
                      <span className="capitalize">{activeRule.adjustment.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Adjustment Value:</span>
                      <span>
                        {activeRule.adjustment.type === 'percentage'
                          ? `${activeRule.adjustment.value}%`
                          : `$${activeRule.adjustment.value}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margin Guardrail:</span>
                      <span>
                        {getMinimumMarginGuardrail(activeRule) !== null
                          ? `${getMinimumMarginGuardrail(activeRule)}% minimum`
                          : "None"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span>{new Date(activeRule.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Updated:</span>
                      <span>{new Date(activeRule.updatedAt).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Conditions</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {Object.keys(activeRule.conditions).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(activeRule.conditions).map(([field, condition], index) => (
                          <div key={index} className="border p-2 rounded-md">
                            <p className="font-medium capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}</p>
                            <pre className="text-xs bg-muted p-1 rounded mt-1 overflow-auto">
                              {JSON.stringify(condition, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic">No conditions specified</p>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-4">Price Impact Preview</h3>
                <RulePreview 
                  conditions={activeRule.conditions}
                  adjustment={activeRule.adjustment}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleDuplicateRule(activeRule)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </Button>
                <Button 
                  onClick={() => {
                    setIsDetailDialogOpen(false);
                    handleEditRule(activeRule);
                  }}
                  disabled={!canManagePricingRules}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Rule
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the rule "{activeRule?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingMarginRecommendation)}
        onOpenChange={(open) => {
          if (!open) setPendingMarginRecommendation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Margin Optimization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the current product price and add a price history entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingMarginRecommendation && (
            <div className="grid grid-cols-2 gap-3 rounded-md border p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Product</p>
                <p className="font-medium">{pendingMarginRecommendation.productName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Supplier Cost</p>
                <p className="font-medium">{formatCurrency(pendingMarginRecommendation.latestUnitCost)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Old Price</p>
                <p className="font-medium">{formatCurrency(pendingMarginRecommendation.currentPrice)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">New Price</p>
                <p className="font-medium">{formatCurrency(pendingMarginRecommendation.recommendedPrice)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current Margin</p>
                <p className="font-medium">{formatPercent(pendingMarginRecommendation.currentMargin)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Target Margin</p>
                <p className="font-medium">{formatPercent(targetMargin)}</p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingMarginRecommendation) {
                  applyMarginRecommendationMutation.mutate(pendingMarginRecommendation);
                  setPendingMarginRecommendation(null);
                }
              }}
            >
              Apply Price
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
