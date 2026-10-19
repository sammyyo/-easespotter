import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiColorCircularProgress, PROGRESS_COLORS } from "@/components/ui/circular-progress";
import { exportCampaignToCSV, exportCampaignsToCSV, type Campaign as ExportCampaign } from "@/lib/export";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Globe,
  Loader2,
  Mail,
  PieChart,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";

type CampaignStatus = "active" | "completed" | "paused" | "draft" | "scheduled" | "cancelled" | string;
type CampaignType = "email" | "social" | "ppc" | "display" | "content" | "event" | "referral" | string;

interface RawCampaign {
  id: number;
  name: string;
  description?: string | null;
  type: CampaignType;
  status: CampaignStatus;
  startDate: string;
  endDate: string | null;
  targetSegment: string;
  budget: number | string;
  channels: string[];
  goals?: {
    sales?: string;
    engagement?: string;
    awareness?: string;
  } | null;
  performance?: Record<string, unknown> | null;
  metrics?: Record<string, unknown> | null;
}

interface DashboardCampaign {
  id: string;
  name: string;
  description: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate: string;
  endDate: string | null;
  segment: string;
  platform: string;
  tags: string[];
  budget: number;
  spent: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  channelBreakdown: {
    channel: string;
    spend: number;
    revenue: number;
    budget: number;
    conversions: number;
  }[];
}

interface ChannelSummary {
  id: string;
  name: string;
  spend: number;
  recommendedSpend: number;
  revenue: number;
  roi: number;
  conversions: number;
  cpa: number;
  contribution: number;
}

const attributionFormSchema = z.object({
  model: z.string().min(1),
  lookbackWindow: z.number().min(1).max(90),
  includeDirectTraffic: z.boolean().default(true),
  includeSocialReferrals: z.boolean().default(true),
});

type AttributionFormValues = z.infer<typeof attributionFormSchema>;

function parseNumericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return 0;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getCampaignBudget(campaign: RawCampaign) {
  return parseNumericValue(campaign.budget);
}

function getCampaignSpend(campaign: RawCampaign) {
  return (
    parseNumericValue(campaign.metrics?.spend) ||
    parseNumericValue(campaign.performance?.spend) ||
    parseNumericValue(campaign.metrics?.cost) ||
    parseNumericValue(campaign.performance?.cost) ||
    getCampaignBudget(campaign)
  );
}

function getCampaignImpressions(campaign: RawCampaign) {
  return (
    parseNumericValue(campaign.metrics?.impressions) ||
    parseNumericValue(campaign.performance?.impressions) ||
    parseNumericValue(campaign.metrics?.traffic) ||
    parseNumericValue(campaign.goals?.awareness)
  );
}

function getCampaignClicks(campaign: RawCampaign) {
  return (
    parseNumericValue(campaign.metrics?.clicks) ||
    parseNumericValue(campaign.performance?.clicks) ||
    parseNumericValue(campaign.performance?.engagement) ||
    parseNumericValue(campaign.goals?.engagement)
  );
}

function getCampaignConversions(campaign: RawCampaign) {
  return (
    parseNumericValue(campaign.metrics?.conversions) ||
    parseNumericValue(campaign.performance?.conversions) ||
    parseNumericValue(campaign.goals?.sales)
  );
}

function getCampaignRevenue(campaign: RawCampaign) {
  return (
    parseNumericValue(campaign.metrics?.revenue) ||
    parseNumericValue(campaign.performance?.revenue)
  );
}

function getCampaignTags(campaign: RawCampaign) {
  return [campaign.type, campaign.targetSegment, ...(campaign.channels || [])]
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeCampaign(campaign: RawCampaign): DashboardCampaign {
  const budget = getCampaignBudget(campaign);
  const spent = getCampaignSpend(campaign);
  const revenue = getCampaignRevenue(campaign);
  const impressions = getCampaignImpressions(campaign);
  const clicks = getCampaignClicks(campaign);
  const conversions = getCampaignConversions(campaign);
  const channels = Array.isArray(campaign.channels) && campaign.channels.length ? campaign.channels : [campaign.type];
  const perChannelBudget = budget / Math.max(channels.length, 1);
  const perChannelSpend = spent / Math.max(channels.length, 1);
  const perChannelRevenue = revenue / Math.max(channels.length, 1);
  const perChannelConversions = conversions / Math.max(channels.length, 1);

  return {
    id: String(campaign.id),
    name: campaign.name,
    description: campaign.description || "No campaign description",
    type: campaign.type,
    status: campaign.status,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    segment: campaign.targetSegment,
    platform: channels.join(", "),
    tags: getCampaignTags(campaign),
    budget,
    spent,
    revenue,
    impressions,
    clicks,
    conversions,
    channelBreakdown: channels.map((channel) => ({
      channel,
      spend: perChannelSpend,
      revenue: perChannelRevenue,
      budget: perChannelBudget,
      conversions: perChannelConversions,
    })),
  };
}

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-50 text-green-700 border-green-200";
    case "completed":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "paused":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "scheduled":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function getCampaignTypeIcon(type: string) {
  switch (type) {
    case "email":
      return <Mail className="h-4 w-4" />;
    case "social":
      return <Share2 className="h-4 w-4" />;
    case "ppc":
      return <Search className="h-4 w-4" />;
    case "display":
      return <Globe className="h-4 w-4" />;
    case "content":
      return <FileText className="h-4 w-4" />;
    case "referral":
      return <Users className="h-4 w-4" />;
    default:
      return <Tag className="h-4 w-4" />;
  }
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getPeriodStart(period: string) {
  const now = new Date();
  const start = new Date(now);
  switch (period) {
    case "7d":
      start.setDate(now.getDate() - 7);
      break;
    case "90d":
      start.setDate(now.getDate() - 90);
      break;
    case "6m":
      start.setMonth(now.getMonth() - 6);
      break;
    case "1y":
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setDate(now.getDate() - 30);
      break;
  }
  return start;
}

function campaignOverlapsWindow(campaign: DashboardCampaign, start: Date, end: Date) {
  const campaignStart = new Date(campaign.startDate);
  const campaignEnd = campaign.endDate ? new Date(campaign.endDate) : end;
  return campaignStart <= end && campaignEnd >= start;
}

function calculateTotals(campaigns: DashboardCampaign[]) {
  const totals = campaigns.reduce(
    (acc, campaign) => {
      acc.budget += campaign.budget;
      acc.spent += campaign.spent;
      acc.revenue += campaign.revenue;
      acc.impressions += campaign.impressions;
      acc.clicks += campaign.clicks;
      acc.conversions += campaign.conversions;
      return acc;
    },
    { budget: 0, spent: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  const roi = totals.spent > 0 ? ((totals.revenue / totals.spent) - 1) * 100 : 0;
  return { ...totals, roi };
}

function calculateDelta(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function buildExportCampaign(campaign: DashboardCampaign): ExportCampaign {
  return {
    id: campaign.id,
    name: campaign.name,
    type: campaign.type,
    status: campaign.status,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    budget: campaign.budget,
    spent: campaign.spent,
    revenue: campaign.revenue,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    conversions: campaign.conversions,
    segment: campaign.segment,
    platform: campaign.platform,
    tags: campaign.tags,
    channelBreakdown: campaign.channelBreakdown.map((item) => ({
      channel: item.channel,
      spend: item.spend,
      revenue: item.revenue,
      budget: item.budget,
    })),
    performanceOverTime: [],
  };
}

function CampaignDetailDialog({
  campaign,
  open,
  onOpenChange,
  formatCurrency,
}: {
  campaign: DashboardCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatCurrency: (value: number) => string;
}) {
  if (!campaign) return null;

  const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;
  const conversionRate = campaign.clicks > 0 ? (campaign.conversions / campaign.clicks) * 100 : 0;
  const cpa = campaign.conversions > 0 ? campaign.spent / campaign.conversions : 0;
  const roi = campaign.spent > 0 ? ((campaign.revenue / campaign.spent) - 1) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getCampaignTypeIcon(campaign.type)}
            <span>{campaign.name}</span>
            <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
          </DialogTitle>
          <DialogDescription>{campaign.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Budget</div><div className="text-xl font-semibold">{formatCurrency(campaign.budget)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Spent</div><div className="text-xl font-semibold">{formatCurrency(campaign.spent)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Revenue</div><div className="text-xl font-semibold">{formatCurrency(campaign.revenue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">ROI</div><div className="text-xl font-semibold">{formatPercent(roi)}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Campaign Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Segment</span><span>{campaign.segment}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span>{campaign.platform}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{new Date(campaign.startDate).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">End</span><span>{campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : "Ongoing"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tags</span><span>{campaign.tags.join(", ") || "None"}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Performance Metrics</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Impressions</span><span>{campaign.impressions.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Clicks</span><span>{campaign.clicks.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conversions</span><span>{campaign.conversions.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">CTR</span><span>{formatPercent(ctr)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conversion Rate</span><span>{formatPercent(conversionRate)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">CPA</span><span>{campaign.conversions > 0 ? formatCurrency(cpa) : "N/A"}</span></div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channel Breakdown</CardTitle>
            <CardDescription>Derived from the campaign's actual channel allocation and stored performance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaign.channelBreakdown.map((channel) => {
              const channelRoi = channel.spend > 0 ? ((channel.revenue / channel.spend) - 1) * 100 : 0;
              return (
                <div key={channel.channel} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{channel.channel}</span>
                    <span className={channelRoi >= 0 ? "text-green-600" : "text-red-600"}>{formatPercent(channelRoi)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground md:grid-cols-4">
                    <span>Budget: {formatCurrency(channel.budget)}</span>
                    <span>Spend: {formatCurrency(channel.spend)}</span>
                    <span>Revenue: {formatCurrency(channel.revenue)}</span>
                    <span>Conversions: {channel.conversions.toFixed(0)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => exportCampaignToCSV(buildExportCampaign(campaign), `campaign-${campaign.id}-details`)}>
            <Download className="mr-2 h-4 w-4" />
            Export Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignROIDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPeriod, setSelectedPeriod] = useState("30d");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<DashboardCampaign | null>(null);
  const [campaignDetailOpen, setCampaignDetailOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    type: "all",
    dateRange: { start: "", end: "" },
  });
  const { toast } = useToast();
  const { currency } = useCurrency();
  const isMobile = useIsMobile();

  const attributionForm = useForm<AttributionFormValues>({
    resolver: zodResolver(attributionFormSchema),
    defaultValues: {
      model: "last-touch",
      lookbackWindow: 30,
      includeDirectTraffic: true,
      includeSocialReferrals: true,
    },
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatCurrencyCompact = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      compactDisplay: "short",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);

  const { data: rawCampaigns = [], isLoading } = useQuery<RawCampaign[]>({
    queryKey: ["/api/marketing/campaigns"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/campaigns");
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      return response.json();
    },
    initialData: [],
  });

  const campaigns = useMemo(() => rawCampaigns.map(normalizeCampaign), [rawCampaigns]);
  const periodStart = useMemo(() => getPeriodStart(selectedPeriod), [selectedPeriod]);
  const now = useMemo(() => new Date(), []);
  const previousStart = useMemo(() => {
    const previous = new Date(periodStart);
    const distance = now.getTime() - periodStart.getTime();
    previous.setTime(previous.getTime() - distance);
    return previous;
  }, [now, periodStart]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      const inPeriod = campaignOverlapsWindow(campaign, periodStart, now);
      const matchesSearch =
        !searchTerm.trim() ||
        `${campaign.name} ${campaign.platform} ${campaign.segment}`.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const matchesStatus = filters.status === "all" || campaign.status === filters.status;
      const matchesType = filters.type === "all" || campaign.type === filters.type;
      const customStart = filters.dateRange.start ? new Date(filters.dateRange.start) : null;
      const customEnd = filters.dateRange.end ? new Date(filters.dateRange.end) : null;
      const inCustomWindow = customStart && customEnd ? campaignOverlapsWindow(campaign, customStart, customEnd) : true;
      return inPeriod && matchesSearch && matchesStatus && matchesType && inCustomWindow;
    });
  }, [campaigns, filters, now, periodStart, searchTerm]);

  const previousCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaignOverlapsWindow(campaign, previousStart, periodStart)),
    [campaigns, periodStart, previousStart]
  );

  const currentTotals = useMemo(() => calculateTotals(filteredCampaigns), [filteredCampaigns]);
  const previousTotals = useMemo(() => calculateTotals(previousCampaigns), [previousCampaigns]);

  const overviewCards = useMemo(
    () => [
      {
        label: "Total ROI",
        value: formatPercent(currentTotals.roi),
        delta: calculateDelta(currentTotals.roi, previousTotals.roi),
        icon: <DollarSign className="h-8 w-8 text-primary" />,
      },
      {
        label: "Total Revenue",
        value: formatCurrencyCompact(currentTotals.revenue),
        delta: calculateDelta(currentTotals.revenue, previousTotals.revenue),
        icon: <DollarSign className="h-8 w-8 text-primary" />,
      },
      {
        label: "Total Spend",
        value: formatCurrencyCompact(currentTotals.spent),
        delta: calculateDelta(currentTotals.spent, previousTotals.spent),
        icon: <DollarSign className="h-8 w-8 text-primary" />,
      },
      {
        label: "Total Conversions",
        value: currentTotals.conversions.toLocaleString(),
        delta: calculateDelta(currentTotals.conversions, previousTotals.conversions),
        icon: <ShoppingBag className="h-8 w-8 text-primary" />,
      },
    ],
    [currentTotals, previousTotals]
  );

  const channelSummaries = useMemo(() => {
    const channelMap = new Map<string, { spend: number; revenue: number; conversions: number }>();
    filteredCampaigns.forEach((campaign) => {
      campaign.channelBreakdown.forEach((channel) => {
        const current = channelMap.get(channel.channel) || { spend: 0, revenue: 0, conversions: 0 };
        current.spend += channel.spend;
        current.revenue += channel.revenue;
        current.conversions += channel.conversions;
        channelMap.set(channel.channel, current);
      });
    });

    const averageRoi = channelMap.size
      ? Array.from(channelMap.values()).reduce((sum, item) => sum + (item.spend > 0 ? ((item.revenue / item.spend) - 1) * 100 : 0), 0) / channelMap.size
      : 0;

    return Array.from(channelMap.entries())
      .map(([channel, values]) => {
        const roi = values.spend > 0 ? ((values.revenue / values.spend) - 1) * 100 : 0;
        const recommendedSpend = roi > averageRoi ? values.spend * 1.15 : roi < averageRoi * 0.7 ? values.spend * 0.85 : values.spend;
        return {
          id: channel,
          name: channel,
          spend: values.spend,
          recommendedSpend,
          revenue: values.revenue,
          roi,
          conversions: values.conversions,
          cpa: values.conversions > 0 ? values.spend / values.conversions : 0,
          contribution: currentTotals.revenue > 0 ? (values.revenue / currentTotals.revenue) * 100 : 0,
        } satisfies ChannelSummary;
      })
      .sort((a, b) => b.roi - a.roi);
  }, [currentTotals.revenue, filteredCampaigns]);

  const topCampaigns = useMemo(
    () =>
      filteredCampaigns
        .slice()
        .sort((a, b) => {
          const aRoi = a.spent > 0 ? ((a.revenue / a.spent) - 1) * 100 : 0;
          const bRoi = b.spent > 0 ? ((b.revenue / b.spent) - 1) * 100 : 0;
          return bRoi - aRoi;
        })
        .slice(0, 5),
    [filteredCampaigns]
  );

  const optimizationImpact = useMemo(() => {
    const spendShift = channelSummaries.reduce((sum, channel) => sum + (channel.recommendedSpend - channel.spend), 0);
    const weightedUplift = channelSummaries.reduce((sum, channel) => {
      const changeRatio = channel.spend > 0 ? (channel.recommendedSpend - channel.spend) / channel.spend : 0;
      return sum + changeRatio * Math.max(channel.roi, 0) * 0.05;
    }, 0);
    return {
      roiLift: Math.max(0, weightedUplift),
      revenueLift: Math.max(0, currentTotals.revenue * weightedUplift * 0.01),
      conversionLift: Math.max(0, currentTotals.conversions * weightedUplift * 0.008),
      spendShift,
    };
  }, [channelSummaries, currentTotals.conversions, currentTotals.revenue]);

  const attributionModels = [
    { id: "last-touch", name: "Last Touch", description: "Assigns value to the last touchpoint before conversion." },
    { id: "first-touch", name: "First Touch", description: "Assigns value to the first customer touchpoint." },
    { id: "linear", name: "Linear", description: "Distributes value equally across touchpoints." },
    { id: "time-decay", name: "Time Decay", description: "Weights recent touches more heavily." },
  ];

  const handleAttributionSetup = (values: AttributionFormValues) => {
    toast({
      title: "Attribution settings saved",
      description: `${values.model} selected with a ${values.lookbackWindow}-day lookback window.`,
    });
    setAttributionOpen(false);
  };

  const openCampaignDetails = (campaign: DashboardCampaign) => {
    setSelectedCampaign(campaign);
    setCampaignDetailOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className={isMobile ? "space-y-4" : "flex items-start justify-between"}>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Campaign ROI Dashboard</h2>
          <p className="text-muted-foreground">Live campaign ROI, spend, revenue, and channel recommendations from stored campaign data.</p>
        </div>
        <div className={`gap-2 ${isMobile ? "flex flex-wrap" : "flex items-center"}`}>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setFilterDialogOpen(true)}>
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => exportCampaignsToCSV(filteredCampaigns.map(buildExportCampaign), "campaign-roi-dashboard")}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => setAttributionOpen(true)}>
            <PieChart className="mr-2 h-4 w-4" />
            Attribution Setup
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={isMobile ? "grid w-full grid-cols-1 gap-2" : "grid w-full grid-cols-3"}>
            <TabsTrigger value="overview"><BarChart3 className="mr-2 h-4 w-4" />Performance Overview</TabsTrigger>
            <TabsTrigger value="campaigns"><Calendar className="mr-2 h-4 w-4" />Campaign Analysis</TabsTrigger>
            <TabsTrigger value="recommendations"><TrendingUp className="mr-2 h-4 w-4" />Optimization Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className={`grid gap-4 ${isMobile ? "grid-cols-2" : "grid-cols-4"}`}>
              {overviewCards.map((card) => (
                <Card key={card.label}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      {card.icon}
                      <p className="mt-2 text-sm font-medium">{card.label}</p>
                      <h3 className={`${isMobile ? "text-2xl" : "text-3xl"} mt-1 font-bold`}>{card.value}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {card.delta === null ? (
                          "No previous period baseline"
                        ) : (
                          <span className={`inline-flex items-center ${card.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {card.delta >= 0 ? <ArrowUp className="mr-1 h-3 w-3" /> : <ArrowDown className="mr-1 h-3 w-3" />}
                            {Math.abs(card.delta).toFixed(1)}% vs previous period
                          </span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>ROI by Channel</CardTitle>
                <CardDescription>Derived from live campaign channel allocations and stored revenue/performance fields.</CardDescription>
              </CardHeader>
              <CardContent>
                {channelSummaries.length ? (
                  <div className={`grid gap-6 ${isMobile ? "grid-cols-2" : "grid-cols-4 xl:grid-cols-5"}`}>
                    {channelSummaries.map((channel) => (
                      <div key={channel.id} className="flex flex-col items-center">
                        <MultiColorCircularProgress
                          percentage={Math.max(0, Math.min(channel.roi, 999))}
                          size={isMobile ? 90 : 120}
                          strokeWidth={isMobile ? 6 : 8}
                          backgroundColor="#f3f4f6"
                          pathColor={
                            channel.roi > 300 ? PROGRESS_COLORS.excellent :
                            channel.roi > 200 ? PROGRESS_COLORS.good :
                            channel.roi > 100 ? PROGRESS_COLORS.average :
                            PROGRESS_COLORS.poor
                          }
                        />
                        <h4 className="mt-4 text-center text-sm font-medium">{channel.name}</h4>
                        <p className="mt-1 text-2xl font-bold">{formatPercent(channel.roi)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(channel.spend)} spent</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                    No campaign channel data is available for the selected period.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Top Performing Campaigns</CardTitle>
                  <CardDescription>Highest ROI campaigns from the selected period.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportCampaignsToCSV(topCampaigns.map(buildExportCampaign), "top-performing-campaigns")}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {topCampaigns.length ? (
                  topCampaigns.map((campaign) => {
                    const roi = campaign.spent > 0 ? ((campaign.revenue / campaign.spent) - 1) * 100 : 0;
                    const cpa = campaign.conversions > 0 ? campaign.spent / campaign.conversions : 0;
                    return (
                      <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            {getCampaignTypeIcon(campaign.type)}
                          </div>
                          <div>
                            <div className="font-medium">{campaign.name}</div>
                            <div className="text-xs text-muted-foreground">{campaign.platform}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                          <span>Budget {formatCurrency(campaign.budget)}</span>
                          <span>Revenue {formatCurrency(campaign.revenue)}</span>
                          <span className={roi >= 0 ? "text-green-600" : "text-red-600"}>{formatPercent(roi)}</span>
                          <span>{campaign.conversions.toLocaleString()} conversions</span>
                          <span>{campaign.conversions > 0 ? formatCurrency(cpa) : "N/A"} CPA</span>
                          <Button variant="outline" size="sm" onClick={() => openCampaignDetails(campaign)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                    No campaign ROI data is available for the selected period.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-6">
            <div className={`gap-3 ${isMobile ? "space-y-3" : "flex items-center justify-between"}`}>
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search campaigns" className="h-8 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
              </div>
              <Button variant="outline" onClick={() => exportCampaignsToCSV(filteredCampaigns.map(buildExportCampaign), "all-campaigns")}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {filteredCampaigns.length ? (
                  <div className="space-y-0">
                    {filteredCampaigns.map((campaign) => {
                      const roi = campaign.spent > 0 ? ((campaign.revenue / campaign.spent) - 1) * 100 : 0;
                      return (
                        <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-4 border-b p-4 hover:bg-muted/10">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                              {getCampaignTypeIcon(campaign.type)}
                            </div>
                            <div>
                              <div className="font-medium">{campaign.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(campaign.startDate).toLocaleDateString()} {campaign.endDate ? `- ${new Date(campaign.endDate).toLocaleDateString()}` : "(Ongoing)"}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm">
                            <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                            <span>{formatCurrency(campaign.budget)} budget</span>
                            <span>{formatCurrency(campaign.spent)} spent</span>
                            <span>{formatCurrency(campaign.revenue)} revenue</span>
                            <span className={roi >= 0 ? "text-green-600" : "text-red-600"}>{formatPercent(roi)}</span>
                            <span>{campaign.impressions.toLocaleString()} impressions</span>
                            <span>{campaign.clicks.toLocaleString()} clicks</span>
                            <Button variant="ghost" size="sm" onClick={() => openCampaignDetails(campaign)}>View Details</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    No campaigns match the selected filters.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Budget Allocation Recommendations</CardTitle>
                <CardDescription>Rule-based recommendations derived from current channel ROI and contribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {channelSummaries.length ? (
                  channelSummaries.map((channel) => {
                    const delta = channel.recommendedSpend - channel.spend;
                    const deltaPct = channel.spend > 0 ? (delta / channel.spend) * 100 : 0;
                    return (
                      <div key={channel.id} className="rounded-md border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{channel.name}</div>
                            <div className="text-sm text-muted-foreground">
                              Contribution {formatPercent(channel.contribution)} of total campaign revenue
                            </div>
                          </div>
                          <Badge variant="outline" className={channel.roi >= 100 ? "text-green-700" : "text-red-700"}>
                            ROI {formatPercent(channel.roi)}
                          </Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                          <div><div className="text-muted-foreground">Current Spend</div><div className="font-medium">{formatCurrency(channel.spend)}</div></div>
                          <div><div className="text-muted-foreground">Recommended</div><div className="font-medium">{formatCurrency(channel.recommendedSpend)}</div></div>
                          <div><div className="text-muted-foreground">Revenue</div><div className="font-medium">{formatCurrency(channel.revenue)}</div></div>
                          <div><div className="text-muted-foreground">CPA</div><div className="font-medium">{channel.conversions > 0 ? formatCurrency(channel.cpa) : "N/A"}</div></div>
                          <div><div className="text-muted-foreground">Change</div><div className={`font-medium ${delta >= 0 ? "text-green-600" : "text-red-600"}`}>{delta >= 0 ? "+" : ""}{formatCurrency(delta)} ({deltaPct.toFixed(1)}%)</div></div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                    No live channel performance data is available for recommendations.
                  </div>
                )}

                <div className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium">Projected Impact</h4>
                      <p className="mt-1 text-sm text-muted-foreground">Based on the current recommendation mix across live channels.</p>
                      <div className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-green-600" /><span>{formatPercent(optimizationImpact.roiLift)} potential ROI lift</span></div>
                        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-green-600" /><span>{formatCurrency(optimizationImpact.revenueLift)} potential revenue lift</span></div>
                        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-green-600" /><span>{Math.round(optimizationImpact.conversionLift).toLocaleString()} potential additional conversions</span></div>
                        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-green-600" /><span>{optimizationImpact.spendShift >= 0 ? "+" : ""}{formatCurrency(optimizationImpact.spendShift)} recommended spend shift</span></div>
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        toast({
                          title: "Recommendations reviewed",
                          description: "This dashboard now shows real recommendation inputs, but spend changes are not auto-applied.",
                        })
                      }
                    >
                      Review Recommendations
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <CampaignDetailDialog campaign={selectedCampaign} open={campaignDetailOpen} onOpenChange={setCampaignDetailOpen} formatCurrency={formatCurrency} />

      <Dialog open={attributionOpen} onOpenChange={setAttributionOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Attribution Setup</DialogTitle>
            <DialogDescription>This config remains local UI configuration until you add a deeper attribution backend.</DialogDescription>
          </DialogHeader>
          <Form {...attributionForm}>
            <form onSubmit={attributionForm.handleSubmit(handleAttributionSetup)} className="space-y-5">
              <FormField
                control={attributionForm.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attribution Model</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {attributionModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{attributionModels.find((item) => item.id === field.value)?.description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attributionForm.control}
                name="lookbackWindow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lookback Window</FormLabel>
                    <FormControl><Input type="number" value={field.value} onChange={(event) => field.onChange(Number(event.target.value || 30))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  control={attributionForm.control}
                  name="includeDirectTraffic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Include Direct Traffic</FormLabel>
                        <FormDescription>Count direct visits as touchpoints.</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={attributionForm.control}
                  name="includeSocialReferrals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Include Social Referrals</FormLabel>
                        <FormDescription>Count social referrals as touchpoints.</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit">Save Attribution Settings</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Filter Campaigns</DialogTitle>
            <DialogDescription>Filter the live campaign set used by the ROI dashboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={filters.type} onValueChange={(value) => setFilters((current) => ({ ...current, type: value }))}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="ppc">PPC/Search</SelectItem>
                  <SelectItem value="display">Display</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={filters.dateRange.start} onChange={(event) => setFilters((current) => ({ ...current, dateRange: { ...current.dateRange, start: event.target.value } }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={filters.dateRange.end} onChange={(event) => setFilters((current) => ({ ...current, dateRange: { ...current.dateRange, end: event.target.value } }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setFilters({
                  status: "all",
                  type: "all",
                  dateRange: { start: "", end: "" },
                })
              }
            >
              Reset Filters
            </Button>
            <Button onClick={() => setFilterDialogOpen(false)}>Apply Filters</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
