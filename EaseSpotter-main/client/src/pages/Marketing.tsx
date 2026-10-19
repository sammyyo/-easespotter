import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingCampaigns } from "@/components/marketing/MarketingCampaigns";
import { Button } from "@/components/ui/button";
import {
  Megaphone,
  Users,
  BarChart3,
  RefreshCw,
  Download,
  Filter,
  Plus,
  Loader2,
  LogIn,
  TestTube,
  Map as MapIcon,
  Brain,
  Target,
  BarChart2,
  Calendar as CalendarIcon,
  Mail,
  ChevronDown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ABTestingDashboard } from "@/components/marketing/a-b-testing/ABTestingDashboard";
import { CustomerJourneyMap } from "@/components/marketing/journey-mapping/CustomerJourneyMap";
import { PredictiveAnalytics } from "@/components/marketing/predictive/PredictiveAnalytics";
import { PersonalizationEngine } from "@/components/marketing/personalization/PersonalizationEngine";
import { CampaignROIDashboard } from "@/components/marketing/roi-dashboard/CampaignROIDashboard";
import { MarketingCalendar } from "@/components/marketing/calendar/MarketingCalendar";
import { EmailMarketing } from "@/components/marketing/email/EmailMarketing";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/hooks/use-currency";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { LineChart, BarChart } from "@tremor/react";
import { DonutChart } from "@tremor/react";
import { MultiColorCircularProgress, PROGRESS_COLORS } from "@/components/ui/circular-progress";
import { Link } from "wouter";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface MarketingCampaign {
  id: number;
  name: string;
  description?: string;
  type: string;
  status: string;
  startDate: string | Date;
  endDate?: string | Date;
  targetSegment: string;
  channels: string[];
  budget: number | string;
  vendorId: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  goals?: {
    sales?: string;
    engagement?: string;
    awareness?: string;
  } | null;
  performance?: {
    engagement?: number | string;
    conversions?: number | string;
    revenue?: number | string;
    impressions?: number | string;
    clicks?: number | string;
  } | null;
  metrics?: {
    impressions?: number | string;
    clicks?: number | string;
    conversions?: number | string;
    revenue?: number | string;
    traffic?: number | string;
  } | null;
}

type TimePeriod = "7d" | "30d" | "90d" | "12m";

const parseNumericValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return 0;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getPeriodDays = (period: TimePeriod) => {
  switch (period) {
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "12m":
      return 365;
    case "30d":
    default:
      return 30;
  }
};

const getCampaignDate = (campaign: MarketingCampaign) => {
  const rawDate = campaign.endDate || campaign.startDate || campaign.updatedAt || campaign.createdAt;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? new Date(campaign.createdAt) : date;
};

const getCampaignBudget = (campaign: MarketingCampaign) => parseNumericValue(campaign.budget);
const getCampaignTraffic = (campaign: MarketingCampaign) =>
  parseNumericValue(campaign.metrics?.traffic) ||
  parseNumericValue(campaign.metrics?.impressions) ||
  parseNumericValue(campaign.performance?.impressions) ||
  parseNumericValue(campaign.goals?.awareness);
const getCampaignClicks = (campaign: MarketingCampaign) =>
  parseNumericValue(campaign.metrics?.clicks) ||
  parseNumericValue(campaign.performance?.clicks) ||
  parseNumericValue(campaign.performance?.engagement) ||
  parseNumericValue(campaign.goals?.engagement);
const getCampaignConversions = (campaign: MarketingCampaign) =>
  parseNumericValue(campaign.metrics?.conversions) ||
  parseNumericValue(campaign.performance?.conversions) ||
  parseNumericValue(campaign.goals?.sales);
const getCampaignRevenue = (campaign: MarketingCampaign) =>
  parseNumericValue(campaign.metrics?.revenue) ||
  parseNumericValue(campaign.performance?.revenue);

// Define form schema with Zod
const segmentFormSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  criteria: z.object({
    purchaseCount: z.boolean().default(false),
    purchaseValue: z.boolean().default(false),
    daysSinceLastPurchase: z.boolean().default(false),
    productCategory: z.boolean().default(false),
  }),
  minPurchaseCount: z.number().min(0).optional(),
  minPurchaseValue: z.number().min(0).optional(),
  maxDaysSinceLastPurchase: z.number().min(0).optional(),
  productCategories: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive", "draft"]).default("draft"),
});

type SegmentFormValues = z.infer<typeof segmentFormSchema>;

// Interface for customer segment data
interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  count: number;
  metrics: {
    avgOrderValue?: string;
    conversionRate?: string;
    repeatPurchase?: string;
    lifetimeValue?: string;
    lastPurchase?: string;
    recoveryRate?: string;
  };
}

export default function Marketing() {
  const [activeTab, setActiveTab] = useState("campaigns");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<TimePeriod>("30d");
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | null>(null);
  const { toast } = useToast();
  const { currency } = useCurrency();

  const parseCurrencyValue = (value: string) => {
    const num = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? null : num;
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  };
  
  // Create form with react-hook-form and zod resolver
  const form = useForm<SegmentFormValues>({
    resolver: zodResolver(segmentFormSchema),
    defaultValues: {
      name: "",
      description: "",
      criteria: {
        purchaseCount: false,
        purchaseValue: false,
        daysSinceLastPurchase: false,
        productCategory: false,
      },
      minPurchaseCount: 0,
      minPurchaseValue: 0,
      maxDaysSinceLastPurchase: 180,
      productCategories: [],
      status: "draft",
    },
  });
  
  // Form submission handler
  const onSubmit = (values: SegmentFormValues) => {
    console.log(values);
    // Here you would typically send this data to your backend API
    toast({
      title: "Customer segment created",
      description: `"${values.name}" has been created successfully.`,
    });
    setOpen(false);
  };
  
  // Use auth context to check if user is authenticated
  const { user } = useAuth();
  
  // Fetch customer segments from the API
  const { data: segments = [], isLoading: isLoadingSegments, error: segmentsError } = useQuery<CustomerSegment[]>({
    queryKey: ["/api/marketing/segments"],
    queryFn: async () => {
      console.log("Fetching customer segments, authenticated user:", !!user);
      const res = await apiRequest("GET", "/api/marketing/segments");
      console.log("API response status:", res.status);
      
      if (!res.ok) {
        if (res.status === 401) {
          console.error("Authentication error when fetching segments");
          throw new Error("Authentication required. Please log in.");
        } else {
          console.error("Error fetching segments:", res.status, res.statusText);
          throw new Error("Failed to fetch customer segments");
        }
      }
      
      const data = await res.json();
      console.log("Received customer segments data:", data);
      return data;
    },
    // Only run this query if the user is logged in
    enabled: !!user
  });

  const { data: campaigns = [] } = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/marketing/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/marketing/campaigns");
      if (!res.ok) {
        throw new Error("Failed to fetch marketing campaigns");
      }
      return res.json();
    },
    enabled: !!user
  });
  
  // Create data for the donut chart from the segments
  const customerSegmentsData = segments.map(segment => ({
    name: segment.name,
    value: segment.count
  }));
  
  // Handle opening the details dialog for a segment
  const handleViewDetails = (segment: CustomerSegment) => {
    setSelectedSegment(segment);
    setDetailsOpen(true);
  };
  
  // Handle opening the target dialog for a segment
  const handleTarget = (segment: CustomerSegment) => {
    setSelectedSegment(segment);
    setTargetOpen(true);
  };
  
  const analyticsCutoff = new Date();
  analyticsCutoff.setDate(analyticsCutoff.getDate() - getPeriodDays(analyticsPeriod));

  const filteredCampaigns = campaigns.filter((campaign) => getCampaignDate(campaign) >= analyticsCutoff);
  const comparisonCutoff = new Date(analyticsCutoff);
  comparisonCutoff.setDate(comparisonCutoff.getDate() - getPeriodDays(analyticsPeriod));
  const previousCampaigns = campaigns.filter((campaign) => {
    const date = getCampaignDate(campaign);
    return date >= comparisonCutoff && date < analyticsCutoff;
  });

  const aggregateCampaignSet = (campaignSet: MarketingCampaign[]) => {
    return campaignSet.reduce((acc, campaign) => {
      const traffic = getCampaignTraffic(campaign);
      const clicks = getCampaignClicks(campaign);
      const conversions = getCampaignConversions(campaign);
      const budget = getCampaignBudget(campaign);
      const revenue = getCampaignRevenue(campaign);

      acc.traffic += traffic;
      acc.clicks += clicks;
      acc.conversions += conversions;
      acc.budget += budget;
      acc.revenue += revenue;
      return acc;
    }, { traffic: 0, clicks: 0, conversions: 0, budget: 0, revenue: 0 });
  };

  const currentAnalytics = aggregateCampaignSet(filteredCampaigns);
  const previousAnalytics = aggregateCampaignSet(previousCampaigns);

  const getDelta = (current: number, previous: number) => {
    if (previous <= 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const totalTraffic = currentAnalytics.traffic;
  const conversionRate = totalTraffic > 0 ? (currentAnalytics.conversions / totalTraffic) * 100 : 0;
  const costPerAcquisition = currentAnalytics.conversions > 0
    ? currentAnalytics.budget / currentAnalytics.conversions
    : 0;

  const previousConversionRate = previousAnalytics.traffic > 0
    ? (previousAnalytics.conversions / previousAnalytics.traffic) * 100
    : 0;
  const previousCpa = previousAnalytics.conversions > 0
    ? previousAnalytics.budget / previousAnalytics.conversions
    : 0;

  const totalTrafficDelta = getDelta(totalTraffic, previousAnalytics.traffic);
  const conversionRateDelta = conversionRate - previousConversionRate;
  const cpaDelta = getDelta(costPerAcquisition, previousCpa);

  const channelGroups = [
    { key: "organic", label: "Organic", aliases: ["blog", "youtube"] },
    { key: "paid", label: "Paid", aliases: ["google", "bing", "display", "facebook", "instagram", "twitter", "linkedin", "tiktok"] },
    { key: "referral", label: "Referral", aliases: ["webinar", "sms"] },
    { key: "affiliate", label: "Affiliate", aliases: ["email"] },
  ] as const;

  const monthLabel = (date: Date) =>
    date.toLocaleDateString("en-US", { month: analyticsPeriod === "12m" ? "short" : "short", day: analyticsPeriod === "12m" ? undefined : "numeric" });

  const trafficByDate = new Map<string, { date: string; organic: number; paid: number; referral: number; affiliate: number }>();
  const channelPerformanceMap = new Map<string, { channel: string; visitors: number; conversions: number; budget: number }>();

  filteredCampaigns.forEach((campaign) => {
    const traffic = getCampaignTraffic(campaign);
    const conversions = getCampaignConversions(campaign);
    const budget = getCampaignBudget(campaign);
    const campaignChannels = Array.isArray(campaign.channels) && campaign.channels.length > 0 ? campaign.channels : [campaign.type];
    const perChannelTraffic = campaignChannels.length > 0 ? traffic / campaignChannels.length : traffic;
    const perChannelConversions = campaignChannels.length > 0 ? conversions / campaignChannels.length : conversions;
    const perChannelBudget = campaignChannels.length > 0 ? budget / campaignChannels.length : budget;

    const bucketDate = monthLabel(getCampaignDate(campaign));
    const bucket = trafficByDate.get(bucketDate) || { date: bucketDate, organic: 0, paid: 0, referral: 0, affiliate: 0 };

    campaignChannels.forEach((channel) => {
      const normalizedChannel = channel.toLowerCase();
      const group = channelGroups.find((item) => item.aliases.includes(normalizedChannel)) || channelGroups[1];
      bucket[group.key] += perChannelTraffic;

      const channelLabel = channel.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
      const currentChannel = channelPerformanceMap.get(channelLabel) || {
        channel: channelLabel,
        visitors: 0,
        conversions: 0,
        budget: 0,
      };

      currentChannel.visitors += perChannelTraffic;
      currentChannel.conversions += perChannelConversions;
      currentChannel.budget += perChannelBudget;
      channelPerformanceMap.set(channelLabel, currentChannel);
    });

    trafficByDate.set(bucketDate, bucket);
  });

  const customerTrafficData = Array.from(trafficByDate.values());
  const channelPerformanceData = Array.from(channelPerformanceMap.values())
    .sort((a, b) => b.visitors - a.visitors)
    .map((channel) => ({
      ...channel,
      rate: channel.visitors > 0 ? `${((channel.conversions / channel.visitors) * 100).toFixed(1)}%` : "0.0%",
    }));

  const campaignEffectiveness = filteredCampaigns
    .map((campaign) => {
      const budget = getCampaignBudget(campaign);
      const revenue = getCampaignRevenue(campaign);
      const conversions = getCampaignConversions(campaign);
      const score = revenue > 0
        ? revenue / Math.max(budget, 1)
        : conversions > 0
          ? conversions / Math.max(budget, 1) * 100
          : 0;

      return {
        campaign: campaign.name,
        score,
        suffix: revenue > 0 ? "x" : " conv/$100",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const spendAllocation = channelPerformanceData
    .map((channel) => ({
      label: channel.channel,
      value: channel.budget,
    }))
    .filter((channel) => channel.value > 0);

  const totalAllocatedBudget = spendAllocation.reduce((sum, channel) => sum + channel.value, 0);
  const spendAllocationSegments = spendAllocation.map((channel, index) => ({
    value: channel.value,
    label: channel.label,
    color: [
      PROGRESS_COLORS.purple,
      PROGRESS_COLORS.cyan,
      PROGRESS_COLORS.pink,
      PROGRESS_COLORS.green,
      PROGRESS_COLORS.orange,
    ][index % 5],
    percentage: totalAllocatedBudget > 0 ? (channel.value / totalAllocatedBudget) * 100 : 0,
  }));
  
  // Get mobile status
  const isMobile = useIsMobile();
  
  // Tab configuration for both desktop and mobile views
  const tabConfig = [
    { value: "campaigns", label: "Campaigns", icon: <Megaphone className="w-4 h-4" /> },
    { value: "customers", label: "Customer Segments", icon: <Users className="w-4 h-4" /> },
    { value: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { value: "a-b-testing", label: "A/B Testing", icon: <TestTube className="w-4 h-4" /> },
    { value: "journey-mapping", label: "Journey Map", icon: <MapIcon className="w-4 h-4" /> },
    { value: "predictive", label: "Predictive", icon: <Brain className="w-4 h-4" /> },
    { value: "personalization", label: "Personalization", icon: <Target className="w-4 h-4" /> },
    { value: "roi-dashboard", label: "ROI Dashboard", icon: <BarChart2 className="w-4 h-4" /> },
    { value: "calendar", label: "Calendar", icon: <CalendarIcon className="w-4 h-4" /> },
    { value: "email-marketing", label: "Email", icon: <Mail className="w-4 h-4" /> }
  ];
  
  // Function to get label and icon for active tab (for mobile dropdown display)
  const getActiveTabInfo = () => {
    const activeTabInfo = tabConfig.find(tab => tab.value === activeTab);
    return activeTabInfo || tabConfig[0];
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Marketing</h1>
        <p className="text-muted-foreground">
          Create, manage, and analyze your marketing campaigns and customer segments.
        </p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Mobile view - Dropdown menu */}
          {isMobile ? (
            <div className="w-full">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <div className="flex items-center gap-2">
                      {getActiveTabInfo().icon}
                      <span>{getActiveTabInfo().label}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  {tabConfig.map(tab => (
                    <DropdownMenuItem 
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className="flex items-center gap-2"
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            /* Desktop view - Traditional TabsList */
            <TabsList className="flex flex-wrap h-auto">
              {tabConfig.map(tab => (
                <TabsTrigger 
                  key={tab.value}
                  value={tab.value} 
                  className="flex items-center gap-2"
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          
          <div className="flex items-center gap-2 self-end md:self-auto">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        
        <TabsContent value="campaigns" className="mt-0">
          <MarketingCampaigns />
        </TabsContent>
        
        <TabsContent value="customers" className="mt-0">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Customer Segments</h2>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Segment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[525px]">
                  <DialogHeader>
                    <DialogTitle>Create Customer Segment</DialogTitle>
                    <DialogDescription>
                      Define criteria for a new customer segment to target specific groups with your marketing campaigns.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Segment Name</FormLabel>
                            <FormControl>
                              <Input placeholder="High-value customers" {...field} />
                            </FormControl>
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
                              <Input placeholder="Customers with high lifetime value..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div>
                        <h4 className="text-sm font-medium mb-3">Segment Criteria</h4>
                        <div className="space-y-3">
                          <FormField
                            control={form.control}
                            name="criteria.purchaseCount"
                            render={({ field }) => (
                              <FormItem className="flex items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Purchase Count</FormLabel>
                                  <FormDescription>
                                    Customers who made a minimum number of purchases
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                          {form.watch("criteria.purchaseCount") && (
                            <FormField
                              control={form.control}
                              name="minPurchaseCount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Minimum Purchases</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      {...field} 
                                      onChange={e => field.onChange(Number(e.target.value))} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          
                          <FormField
                            control={form.control}
                            name="criteria.purchaseValue"
                            render={({ field }) => (
                              <FormItem className="flex items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Purchase Value</FormLabel>
                                  <FormDescription>
                                    Customers who spent a minimum amount
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                          {form.watch("criteria.purchaseValue") && (
                            <FormField
                              control={form.control}
                              name="minPurchaseValue"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Minimum Purchase Value ($)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      {...field} 
                                      onChange={e => field.onChange(Number(e.target.value))} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          
                          <FormField
                            control={form.control}
                            name="criteria.daysSinceLastPurchase"
                            render={({ field }) => (
                              <FormItem className="flex items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Days Since Last Purchase</FormLabel>
                                  <FormDescription>
                                    Customers who haven't purchased for a specific period
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                          {form.watch("criteria.daysSinceLastPurchase") && (
                            <FormField
                              control={form.control}
                              name="maxDaysSinceLastPurchase"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Maximum Days</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      {...field} 
                                      onChange={e => field.onChange(Number(e.target.value))} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select 
                              value={field.value} 
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select segment status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                                <SelectItem value="draft">Draft</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit">Create Segment</Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="flex gap-4 items-center">
              <div className="flex gap-2 flex-1">
                <Input placeholder="Search segments..." className="max-w-sm" />
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              <Select defaultValue="all">
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {!user ? (
                <div className="col-span-3 flex justify-center py-10">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
                      <LogIn className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="font-medium">Authentication Required</h3>
                      <p className="text-sm text-muted-foreground">
                        Please log in to view customer segments
                      </p>
                      <div className="mt-3 p-3 rounded bg-muted/50 text-xs text-muted-foreground max-w-xs mx-auto">
                        <p className="font-medium mb-1">Test credentials:</p>
                        <p><strong>Admin:</strong> admin / password</p>
                        <p><strong>User:</strong> user / password</p>
                      </div>
                      <Link href="/">
                        <Button 
                          variant="default" 
                          size="sm"
                          className="mt-2"
                        >
                          <LogIn className="mr-2 h-4 w-4" />
                          Log In
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : isLoadingSegments ? (
                <div className="col-span-3 flex justify-center py-10">
                  <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading customer segments...</p>
                  </div>
                </div>
              ) : segmentsError ? (
                <div className="col-span-3 flex justify-center py-10">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="rounded-full bg-destructive/10 p-3">
                      <RefreshCw className="h-6 w-6 text-destructive" />
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="font-medium">Error loading segments</h3>
                      <p className="text-sm text-muted-foreground">
                        {segmentsError.message.includes("Authentication") 
                          ? "Please login to view customer segments." 
                          : "There was an error loading the customer segments."}
                      </p>
                      {segmentsError.message.includes("Authentication") ? (
                        <Link href="/">
                          <Button variant="outline" size="sm">
                            Login
                          </Button>
                        </Link>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.location.reload()}
                        >
                          Try Again
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : segments.length === 0 ? (
                <div className="col-span-3 flex justify-center py-10">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="rounded-full bg-muted p-3">
                      <Users className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="font-medium">No segments found</h3>
                      <p className="text-sm text-muted-foreground">Get started by creating your first customer segment.</p>
                      <Button onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Segment
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                segments.map(segment => (
                  <Card key={segment.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">{segment.name}</CardTitle>
                        <Badge>{segment.count} users</Badge>
                      </div>
                      <CardDescription>
                        {segment.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {segment.metrics.avgOrderValue && (
                            <div>
                              <div className="text-muted-foreground">Avg. Order Value</div>
                              <div className="font-medium">
                                {formatCurrency(parseCurrencyValue(segment.metrics.avgOrderValue))}
                              </div>
                            </div>
                          )}
                          {segment.metrics.conversionRate && (
                            <div>
                              <div className="text-muted-foreground">Conversion Rate</div>
                              <div className="font-medium">{segment.metrics.conversionRate}</div>
                            </div>
                          )}
                          {segment.metrics.repeatPurchase && (
                            <div>
                              <div className="text-muted-foreground">Repeat Purchase</div>
                              <div className="font-medium">{segment.metrics.repeatPurchase}</div>
                            </div>
                          )}
                          {segment.metrics.lifetimeValue && (
                            <div>
                              <div className="text-muted-foreground">Lifetime Value</div>
                              <div className="font-medium">
                                {formatCurrency(parseCurrencyValue(segment.metrics.lifetimeValue))}
                              </div>
                            </div>
                          )}
                          {segment.metrics.lastPurchase && (
                            <div>
                              <div className="text-muted-foreground">Last Purchase</div>
                              <div className="font-medium">{segment.metrics.lastPurchase}</div>
                            </div>
                          )}
                          {segment.metrics.recoveryRate && (
                            <div>
                              <div className="text-muted-foreground">Recovery Rate</div>
                              <div className="font-medium">{segment.metrics.recoveryRate}</div>
                            </div>
                          )}
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewDetails(segment)}
                          >
                            View Details
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleTarget(segment)}
                          >
                            Target
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Segment Distribution</CardTitle>
                <CardDescription className="text-foreground/90">
                  Overview of your customer segments by size
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col items-center pt-2">
                    {!user ? (
                      <div className="flex items-center justify-center h-[200px]">
                        <div className="text-center">
                          <LogIn className="h-8 w-8 mx-auto mb-2 text-blue-600 dark:text-blue-300" />
                          <p>Login to view segment data</p>
                        </div>
                      </div>
                    ) : isLoadingSegments ? (
                      <div className="flex items-center justify-center h-[200px]">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : segmentsError ? (
                      <div className="flex items-center justify-center h-[200px]">
                        <div className="text-center text-destructive">
                          <RefreshCw className="h-8 w-8 mx-auto mb-2" />
                          <p>Failed to load data</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <MultiColorCircularProgress 
                          segments={segments.map((segment, index) => {
                            // Use a predefined set of colors cycling through them
                            const colors = [PROGRESS_COLORS.purple, PROGRESS_COLORS.cyan, PROGRESS_COLORS.pink, PROGRESS_COLORS.green, PROGRESS_COLORS.orange];
                            return {
                              value: segment.count,
                              color: colors[index % colors.length],
                              label: segment.name
                            };
                          })}
                          size={200}
                        />
                        <div className="text-center mt-2 text-lg font-medium">
                          {segments.reduce((total, segment) => total + segment.count, 0).toLocaleString()} total customers
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Key Insights</h3>
                    {!user ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="text-center">
                          <LogIn className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-300" />
                          <p className="text-sm">Login to view insights</p>
                        </div>
                      </div>
                    ) : isLoadingSegments ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : segments.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {segments.map((segment, index) => {
                          // Calculate the percentage for this segment
                          const totalCustomers = segments.reduce((sum, seg) => sum + seg.count, 0);
                          const percentage = totalCustomers > 0 
                            ? Math.round((segment.count / totalCustomers) * 100) 
                            : 0;
                            
                          // Use a predefined set of colors cycling through them
                          const colors = [PROGRESS_COLORS.purple, PROGRESS_COLORS.cyan, PROGRESS_COLORS.pink, PROGRESS_COLORS.green, PROGRESS_COLORS.orange];
                          const color = colors[index % colors.length];
                          
                          let insight = "";
                          
                          // Generate specific insights for known segment types
                          if (segment.name.toLowerCase().includes("new")) {
                            insight = `make up ${percentage}% of your customer base, focus on conversion strategies`;
                          } else if (segment.name.toLowerCase().includes("return")) {
                            insight = `(${percentage}%) are your most valuable group by revenue`;
                          } else if (segment.name.toLowerCase().includes("inactive") || segment.name.toLowerCase().includes("at risk")) {
                            insight = `${percentage}% of customers are inactive, create re-engagement campaigns`;
                          } else if (segment.name.toLowerCase().includes("high") || segment.name.toLowerCase().includes("value")) {
                            insight = `(${percentage}%) contribute significantly to total revenue`;
                          } else {
                            insight = `represent ${percentage}% of your customer base`;
                          }
                          
                          return (
                            <li key={segment.id} className="flex items-start gap-2">
                              <span className="h-2 w-2 rounded-full mt-1.5" style={{backgroundColor: color}}></span>
                              <span>{segment.name} {insight}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No customer segments to analyze
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="analytics" className="mt-0">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Marketing Analytics</h2>
              <Select value={analyticsPeriod} onValueChange={(value: TimePeriod) => setAnalyticsPeriod(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Time period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="12m">Last 12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Traffic</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Math.round(totalTraffic).toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    <span style={{color: totalTrafficDelta >= 0 ? "#34C759" : "#FF2D55"}}>
                      {totalTrafficDelta >= 0 ? "+" : ""}{totalTrafficDelta.toFixed(1)}%
                    </span> from last period
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversionRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    <span style={{color: conversionRateDelta >= 0 ? "#34C759" : "#FF2D55"}}>
                      {conversionRateDelta >= 0 ? "+" : ""}{conversionRateDelta.toFixed(1)}%
                    </span> from last period
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cost Per Acquisition</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(costPerAcquisition)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span style={{color: cpaDelta <= 0 ? "#34C759" : "#FF2D55"}}>
                      {cpaDelta >= 0 ? "+" : ""}{cpaDelta.toFixed(1)}%
                    </span> from last period
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Traffic Sources</CardTitle>
                  <CardDescription className="text-foreground/90">
                    Customer acquisition channels over time
                  </CardDescription>
                </div>
                <div className="flex gap-2 items-center text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#AF52DE" }}></div>
                    <span>Organic</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#00E4FF" }}></div>
                    <span>Paid</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#FF2D55" }}></div>
                    <span>Referral</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#34C759" }}></div>
                    <span>Affiliate</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Y-axis labels with better visibility */}
                  {customerTrafficData.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
                      No campaign traffic data is available for the selected period.
                    </div>
                  ) : (
                    <>
                      <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-foreground font-medium py-6">
                        <span>{Math.round(Math.max(...customerTrafficData.map(item => item.organic + item.paid + item.referral + item.affiliate))).toLocaleString()}</span>
                        <span>{Math.round(Math.max(...customerTrafficData.map(item => item.organic + item.paid + item.referral + item.affiliate)) * 0.75).toLocaleString()}</span>
                        <span>{Math.round(Math.max(...customerTrafficData.map(item => item.organic + item.paid + item.referral + item.affiliate)) * 0.5).toLocaleString()}</span>
                        <span>{Math.round(Math.max(...customerTrafficData.map(item => item.organic + item.paid + item.referral + item.affiliate)) * 0.25).toLocaleString()}</span>
                        <span>0</span>
                      </div>
                      
                      <div className="ml-10">
                        <LineChart
                          data={customerTrafficData}
                          index="date"
                          categories={["organic", "paid", "referral", "affiliate"]}
                          colors={["#AF52DE", "#00E4FF", "#FF2D55", "#34C759"]}
                          valueFormatter={(value) => `${Math.round(value).toLocaleString()} visitors`}
                          showYAxis={false}
                          showLegend
                          className="h-80 mt-2"
                        />
                      </div>
                    </>
                  )}
                  
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Channel Performance</CardTitle>
                <CardDescription className="text-foreground/90">
                  Traffic and conversion metrics by marketing channel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <div className="grid grid-cols-12 py-3 px-4 border-b bg-muted/40">
                    <div className="col-span-4 font-medium">Channel</div>
                    <div className="col-span-3 font-medium text-right">Visitors</div>
                    <div className="col-span-3 font-medium text-right">Conversions</div>
                    <div className="col-span-2 font-medium text-right">Rate</div>
                  </div>
                  
                  {channelPerformanceData.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No channel analytics are available for the selected period.
                    </div>
                  ) : (
                    channelPerformanceData.map((item, i) => (
                      <div key={i} className={`grid grid-cols-12 py-3 px-4 ${i !== channelPerformanceData.length - 1 ? 'border-b' : ''}`}>
                        <div className="col-span-4">{item.channel}</div>
                        <div className="col-span-3 text-right">{Math.round(item.visitors).toLocaleString()}</div>
                        <div className="col-span-3 text-right">{Math.round(item.conversions).toLocaleString()}</div>
                        <div className="col-span-2 text-right">{item.rate}</div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Effectiveness</CardTitle>
                  <CardDescription className="text-foreground/90">
                    Campaign return or conversion efficiency for the selected period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 mt-4">
                    {campaignEffectiveness.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        No campaign performance data is available for the selected period.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {campaignEffectiveness.map((item, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{item.campaign}</span>
                              <span className="font-medium">
                                {item.suffix === "x" ? `${item.score.toFixed(2)}x` : `${item.score.toFixed(1)}${item.suffix}`}
                              </span>
                            </div>
                            <div className="w-full bg-muted/50 rounded-full h-3">
                              <div 
                                className="h-3 rounded-full" 
                                style={{ 
                                  width: `${Math.min(item.score / Math.max(campaignEffectiveness[0]?.score || 1, 1), 1) * 100}%`, 
                                  backgroundColor: '#f16b3c' 
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Marketing Spend Allocation</CardTitle>
                  <CardDescription className="text-foreground/90">
                    Budget distribution across channels
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    {spendAllocationSegments.length === 0 ? (
                      <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                        No budget allocation data is available for the selected period.
                      </div>
                    ) : (
                      <>
                        <MultiColorCircularProgress 
                          segments={spendAllocationSegments.map(({ value, color, label }) => ({ value, color, label }))}
                          size={200}
                        />
                        <div className="flex flex-wrap justify-center gap-3 mt-4">
                          {spendAllocationSegments.map((segment) => (
                            <div key={segment.label} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></div>
                              <span className="text-sm">{segment.label} ({segment.percentage.toFixed(0)}%)</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="a-b-testing" className="mt-0">
          <ABTestingDashboard />
        </TabsContent>
        
        <TabsContent value="journey-mapping" className="mt-0">
          <CustomerJourneyMap />
        </TabsContent>
        
        <TabsContent value="predictive" className="mt-0">
          <PredictiveAnalytics />
        </TabsContent>
        
        <TabsContent value="personalization" className="mt-0">
          <PersonalizationEngine />
        </TabsContent>
        
        <TabsContent value="roi-dashboard" className="mt-0">
          <CampaignROIDashboard />
        </TabsContent>
        
        <TabsContent value="calendar" className="mt-0">
          <MarketingCalendar />
        </TabsContent>
        
        <TabsContent value="email-marketing" className="mt-0">
          <EmailMarketing />
        </TabsContent>
      </Tabs>
    </div>
  );
}
