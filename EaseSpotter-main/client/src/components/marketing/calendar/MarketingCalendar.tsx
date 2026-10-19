import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit,
  Search,
  Filter,
  Download,
  Eye,
  Copy,
  FileDown,
  Mail,
  MessageSquare,
  Share2,
  Megaphone,
  BellRing,
  Tag,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Zap,
  Send,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  Calendar as CalendarIcon2,
  CalendarX,
  Clock8,
  AlertCircle,
  Users,
  Tag as TagIcon,
  Save,
  Landmark
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";

// Types and interfaces
enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

enum CampaignType {
  EMAIL = 'email',
  SOCIAL = 'social',
  PPC = 'ppc',
  DISPLAY = 'display',
  CONTENT = 'content',
  EVENT = 'event'
}

interface MarketingEvent {
  id: string;
  title: string;
  type: CampaignType;
  description: string;
  startDate: string;
  endDate?: string;
  status: CampaignStatus;
  segment?: string;
  channel?: string;
  owner?: string;
  budget?: number;
  tasks?: EventTask[];
  approvalStatus?: 'pending' | 'approved' | 'rejected';
}

interface MarketingCampaignRecord {
  id: number;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  targetSegment: string;
  channels: string[];
  budget?: number | string;
  active: boolean;
  goals?: {
    sales?: string;
    engagement?: string;
    awareness?: string;
  } | null;
}

interface SegmentOption {
  id: string;
  name: string;
}

interface EventTask {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  assignee?: string;
}

interface CalendarDay {
  date: Date;
  events: MarketingEvent[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

interface CalendarWeek {
  days: CalendarDay[];
}

interface MonthData {
  year: number;
  month: number;
  weeks: CalendarWeek[];
}

// Create event form schema
const createEventSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters" }),
  type: z.nativeEnum(CampaignType),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  startDate: z.string().min(1, { message: "Start date is required" }),
  endDate: z.string().optional(),
  status: z.nativeEnum(CampaignStatus).default(CampaignStatus.DRAFT),
  segment: z.string().optional(),
  channels: z.array(z.string()).min(1, { message: "Select at least one channel" }),
  budget: z.number().optional(),
  goals: z.object({
    sales: z.string().optional(),
    engagement: z.string().optional(),
    awareness: z.string().optional(),
  }).default({ sales: "", engagement: "", awareness: "" }),
  requiresApproval: z.boolean().default(false),
}).superRefine((values, ctx) => {
  if (values.endDate && values.startDate && values.endDate < values.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after the start date",
    });
  }
});

type CreateEventFormValues = z.infer<typeof createEventSchema>;

// View types
type CalendarView = 'month' | 'week' | 'day' | 'list';

const CHANNEL_OPTIONS = [
  { value: CampaignType.EMAIL, label: "Email" },
  { value: CampaignType.SOCIAL, label: "Social Media" },
  { value: CampaignType.PPC, label: "PPC / Search" },
  { value: CampaignType.DISPLAY, label: "Display Ads" },
  { value: CampaignType.CONTENT, label: "Content" },
  { value: CampaignType.EVENT, label: "Event" },
] as const;

const FIELD_ERROR_MESSAGE_KEYS = [
  "_errors",
  "message",
  "error",
] as const;

export function MarketingCalendar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedView, setSelectedView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<MarketingEvent | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const parseBudget = (value: unknown) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  const normalizeCampaignType = (type: string): CampaignType => {
    switch (type) {
      case CampaignType.EMAIL:
      case CampaignType.SOCIAL:
      case CampaignType.PPC:
      case CampaignType.DISPLAY:
      case CampaignType.CONTENT:
      case CampaignType.EVENT:
        return type;
      default:
        return CampaignType.CONTENT;
    }
  };

  const normalizeCampaignStatus = (status: string): CampaignStatus => {
    switch (status) {
      case CampaignStatus.DRAFT:
      case CampaignStatus.SCHEDULED:
      case CampaignStatus.ACTIVE:
      case CampaignStatus.COMPLETED:
      case CampaignStatus.CANCELLED:
        return status;
      default:
        return CampaignStatus.DRAFT;
    }
  };

  const getFieldErrorMessage = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object") return undefined;
    for (const key of FIELD_ERROR_MESSAGE_KEYS) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate) && typeof candidate[0] === "string") {
        return candidate[0];
      }
      if (typeof candidate === "string") {
        return candidate;
      }
    }
    return undefined;
  };

  const applyServerValidationErrors = (errors: Record<string, unknown> | undefined) => {
    if (!errors) return;

    const titleError = getFieldErrorMessage(errors.name);
    if (titleError) eventForm.setError("title", { type: "server", message: titleError });

    const descriptionError = getFieldErrorMessage(errors.description);
    if (descriptionError) eventForm.setError("description", { type: "server", message: descriptionError });

    const typeError = getFieldErrorMessage(errors.type);
    if (typeError) eventForm.setError("type", { type: "server", message: typeError });

    const segmentError = getFieldErrorMessage(errors.targetSegment);
    if (segmentError) eventForm.setError("segment", { type: "server", message: segmentError });

    const statusError = getFieldErrorMessage(errors.status);
    if (statusError) eventForm.setError("status", { type: "server", message: statusError });

    const budgetError = getFieldErrorMessage(errors.budget);
    if (budgetError) eventForm.setError("budget", { type: "server", message: budgetError });

    const startDateError = getFieldErrorMessage(errors.startDate);
    if (startDateError) eventForm.setError("startDate", { type: "server", message: startDateError });

    const endDateError = getFieldErrorMessage(errors.endDate);
    if (endDateError) eventForm.setError("endDate", { type: "server", message: endDateError });

    const channelsError = getFieldErrorMessage(errors.channels);
    if (channelsError) eventForm.setError("channels", { type: "server", message: channelsError });

    const goalsErrors = errors.goals as Record<string, unknown> | undefined;
    const salesError = getFieldErrorMessage(goalsErrors?.sales);
    if (salesError) eventForm.setError("goals.sales", { type: "server", message: salesError });

    const engagementError = getFieldErrorMessage(goalsErrors?.engagement);
    if (engagementError) eventForm.setError("goals.engagement", { type: "server", message: engagementError });

    const awarenessError = getFieldErrorMessage(goalsErrors?.awareness);
    if (awarenessError) eventForm.setError("goals.awareness", { type: "server", message: awarenessError });
  };
  
  // Form setup
  const eventForm = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: "",
      type: CampaignType.EMAIL,
      description: "",
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      status: CampaignStatus.DRAFT,
      segment: "",
      channels: [CampaignType.EMAIL],
      budget: undefined,
      goals: {
        sales: "",
        engagement: "",
        awareness: "",
      },
      requiresApproval: false,
    },
  });

  const { data: campaigns = [] } = useQuery<MarketingCampaignRecord[]>({
    queryKey: ["/api/marketing/campaigns"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/campaigns");
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      return response.json();
    },
    initialData: [],
  });

  const { data: segments = [] } = useQuery<SegmentOption[]>({
    queryKey: ["/api/marketing/segments"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/segments");
      if (!response.ok) throw new Error("Failed to fetch segments");
      return response.json();
    },
    initialData: [],
  });

  const marketingEvents: MarketingEvent[] = useMemo(
    () =>
      campaigns.map((campaign) => ({
        id: String(campaign.id),
        title: campaign.name,
        type: normalizeCampaignType(campaign.type),
        description: campaign.description || "No campaign description",
        startDate: new Date(campaign.startDate).toISOString().split("T")[0],
        endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().split("T")[0] : undefined,
        status: normalizeCampaignStatus(campaign.status),
        segment: campaign.targetSegment,
        channel: Array.isArray(campaign.channels) ? campaign.channels.join(", ") : "",
        budget: parseBudget(campaign.budget),
        tasks: [],
        approvalStatus: campaign.active ? "approved" : undefined,
      })),
    [campaigns]
  );

  const campaignsById = useMemo(
    () => new Map(campaigns.map((campaign) => [String(campaign.id), campaign])),
    [campaigns]
  );

  const watchedStartDate = eventForm.watch("startDate");
  const watchedEndDate = eventForm.watch("endDate");
  const overlappingCampaigns = useMemo(() => {
    if (!watchedStartDate) return [];

    const start = new Date(watchedStartDate);
    const end = new Date(watchedEndDate || watchedStartDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return [];
    }

    return marketingEvents.filter((event) => {
      if (selectedEvent && event.id === selectedEvent.id) {
        return false;
      }

      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate || event.startDate);
      return start <= eventEnd && end >= eventStart;
    });
  }, [marketingEvents, selectedEvent, watchedEndDate, watchedStartDate]);

  // Generate calendar data for the month view
  const generateMonthData = (date: Date): MonthData => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Get the first day of the month
    const firstDay = new Date(year, month, 1);
    // Get the last day of the month
    const lastDay = new Date(year, month + 1, 0);
    
    // Get the day of the week for the first day (0 = Sunday, 6 = Saturday)
    let firstDayOfWeek = firstDay.getDay();
    // Adjust for starting the week on Monday (0 = Monday, 6 = Sunday)
    if (firstDayOfWeek === 0) firstDayOfWeek = 6;
    else firstDayOfWeek -= 1;
    
    const weeks: CalendarWeek[] = [];
    let currentWeek: CalendarDay[] = [];
    
    // Add days from the previous month to fill the first week
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = 0; i < firstDayOfWeek; i++) {
      const day = prevMonthLastDay - firstDayOfWeek + i + 1;
      const date = new Date(year, month - 1, day);
      currentWeek.push({
        date,
        events: getEventsForDate(date),
        isCurrentMonth: false,
        isToday: isSameDate(date, new Date())
      });
    }
    
    // Add days of the current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      
      currentWeek.push({
        date,
        events: getEventsForDate(date),
        isCurrentMonth: true,
        isToday: isSameDate(date, new Date())
      });
      
      // Start a new week if we've reached the end of a week
      if (currentWeek.length === 7) {
        weeks.push({ days: currentWeek });
        currentWeek = [];
      }
    }
    
    // Add days from the next month to complete the last week
    if (currentWeek.length > 0) {
      const daysToAdd = 7 - currentWeek.length;
      for (let day = 1; day <= daysToAdd; day++) {
        const date = new Date(year, month + 1, day);
        currentWeek.push({
          date,
          events: getEventsForDate(date),
          isCurrentMonth: false,
          isToday: isSameDate(date, new Date())
        });
      }
      weeks.push({ days: currentWeek });
    }
    
    return { year, month, weeks };
  };

  // Helper function to get events for a specific date
  const getEventsForDate = (date: Date): MarketingEvent[] => {
    // Filter events that match the selected type and status criteria
    const filteredEvents = marketingEvents.filter(event => {
      // Apply type filter
      if (filterType !== 'all' && event.type !== filterType) {
        return false;
      }
      
      // Apply status filter
      if (filterStatus !== 'all' && event.status !== filterStatus) {
        return false;
      }
      
      const startDate = new Date(event.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      if (event.endDate) {
        const endDate = new Date(event.endDate);
        endDate.setHours(23, 59, 59, 999);
        
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);
        
        return compareDate >= startDate && compareDate <= endDate;
      } else {
        return isSameDate(startDate, date);
      }
    });
    
    return filteredEvents;
  };

  // Helper function to check if two dates are the same day
  const isSameDate = (date1: Date, date2: Date): boolean => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  // Generate data for the selected month
  const monthData = generateMonthData(currentDate);

  // Helper to get days for the selected week
  const getWeekDays = (): CalendarDay[] => {
    // Get the current week's start and end dates
    const date = new Date(selectedDate);
    const day = date.getDay();
    
    // Adjust for starting the week on Monday (0 = Monday, 6 = Sunday)
    const diff = day === 0 ? 6 : day - 1;
    
    // Set to the first day of the week (Monday)
    date.setDate(date.getDate() - diff);
    
    const weekDays: CalendarDay[] = [];
    
    // Add 7 days to the array
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(date);
      currentDate.setDate(date.getDate() + i);
      
      weekDays.push({
        date: currentDate,
        events: getEventsForDate(currentDate),
        isCurrentMonth: currentDate.getMonth() === selectedDate.getMonth(),
        isToday: isSameDate(currentDate, new Date())
      });
    }
    
    return weekDays;
  };

  // Helper function to group events by hour for day view
  const getDayViewHours = (): { hour: number; events: MarketingEvent[] }[] => {
    const hours = [];
    for (let hour = 0; hour < 24; hour++) {
      hours.push({
        hour,
        events: getEventsForDate(selectedDate).filter(event => {
          const eventDate = new Date(event.startDate);
          return eventDate.getHours() === hour;
        })
      });
    }
    return hours;
  };

  // Get the full month name for the header
  const getMonthName = (date: Date): string => {
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Helper to format dates
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format time (24 hour format)
  const formatTime = (hour: number): string => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // Navigate to the previous period (month, week, or day)
  const goToPrevious = () => {
    if (selectedView === 'month') {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() - 1);
      setCurrentDate(newDate);
    } else if (selectedView === 'week') {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() - 7);
      setSelectedDate(newDate);
    } else if (selectedView === 'day') {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() - 1);
      setSelectedDate(newDate);
    }
  };

  // Navigate to the next period (month, week, or day)
  const goToNext = () => {
    if (selectedView === 'month') {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + 1);
      setCurrentDate(newDate);
    } else if (selectedView === 'week') {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + 7);
      setSelectedDate(newDate);
    } else if (selectedView === 'day') {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + 1);
      setSelectedDate(newDate);
    }
  };

  // Go to today
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const saveCampaignMutation = useMutation({
    mutationFn: async (values: CreateEventFormValues) => {
      eventForm.clearErrors();

      const payload = {
        name: values.title,
        description: values.description,
        type: values.type,
        targetSegment: values.segment || "All Customers",
        budget: values.budget ?? 0,
        startDate: values.startDate,
        endDate: values.endDate || values.startDate,
        active: values.status === CampaignStatus.ACTIVE,
        channels: values.channels.length > 0 ? values.channels : [values.type],
        status: values.status,
        goals: {
          sales: values.goals.sales?.trim() || undefined,
          engagement: values.goals.engagement?.trim() || undefined,
          awareness: values.goals.awareness?.trim() || undefined,
        },
      };

      const method = editMode && selectedEvent ? "PATCH" : "POST";
      const url = editMode && selectedEvent
        ? `/api/marketing/campaigns/${selectedEvent.id}`
        : "/api/marketing/campaigns";

      const response = await apiRequest(method, url, payload);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || "Failed to save campaign") as Error & {
          fieldErrors?: Record<string, unknown>;
        };
        if (data.errors && typeof data.errors === "object") {
          error.fieldErrors = data.errors;
        } else if (data.error === "INVALID_DATE_RANGE") {
          error.fieldErrors = {
            endDate: { _errors: ["End date must be on or after the start date"] },
          };
        }
        throw error;
      }
      return data;
    },
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
      toast({
        title: editMode ? "Campaign updated" : "Campaign created",
        description: `"${campaign.name}" has been saved to your marketing calendar.`,
      });
      setCreateEventOpen(false);
      setEditMode(false);
      setSelectedEvent(null);
    },
    onError: (error: Error & { fieldErrors?: Record<string, unknown> }) => {
      applyServerValidationErrors(error.fieldErrors);
      toast({
        title: editMode ? "Failed to update campaign" : "Failed to create campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await apiRequest("DELETE", `/api/marketing/campaigns/${campaignId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to delete campaign");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
      toast({
        title: "Campaign deleted",
        description: "The campaign has been removed from the marketing calendar.",
      });
      setCreateEventOpen(false);
      setEditMode(false);
      setSelectedEvent(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle creating or updating an event
  const handleCreateEvent = (values: CreateEventFormValues) => {
    saveCampaignMutation.mutate(values);
  };

  // Reset form and open create event dialog
  const openCreateEventDialog = (date?: Date) => {
    eventForm.reset({
      title: "",
      type: CampaignType.EMAIL,
      description: "",
      startDate: date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      endDate: "",
      status: CampaignStatus.DRAFT,
      segment: "",
      channels: [CampaignType.EMAIL],
      budget: undefined,
      goals: {
        sales: "",
        engagement: "",
        awareness: "",
      },
      requiresApproval: false,
    });
    setCreateEventOpen(true);
    setEditMode(false);
    setSelectedEvent(null);
  };

  // Open edit dialog for an existing event
  const openEditEventDialog = (event: MarketingEvent) => {
    const campaign = campaignsById.get(event.id);
    eventForm.reset({
      title: event.title,
      type: event.type,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate || "",
      status: event.status,
      segment: event.segment || "",
      channels: campaign?.channels?.length ? campaign.channels : [event.type],
      budget: event.budget,
      goals: {
        sales: campaign?.goals?.sales || "",
        engagement: campaign?.goals?.engagement || "",
        awareness: campaign?.goals?.awareness || "",
      },
      requiresApproval: event.approvalStatus !== undefined,
    });
    setSelectedEvent(event);
    setCreateEventOpen(true);
    setEditMode(true);
  };

  // Helper function to get event type icon
  const getEventTypeIcon = (type: CampaignType) => {
    switch (type) {
      case CampaignType.EMAIL:
        return <Mail className="h-4 w-4" />;
      case CampaignType.SOCIAL:
        return <Share2 className="h-4 w-4" />;
      case CampaignType.PPC:
        return <Tag className="h-4 w-4" />;
      case CampaignType.DISPLAY:
        return <Eye className="h-4 w-4" />;
      case CampaignType.CONTENT:
        return <FileDown className="h-4 w-4" />;
      case CampaignType.EVENT:
        return <CalendarCheck className="h-4 w-4" />;
      default:
        return <Megaphone className="h-4 w-4" />;
    }
  };

  // Helper function to get event status color
  const getEventStatusColor = (status: CampaignStatus) => {
    switch (status) {
      case CampaignStatus.ACTIVE:
        return 'text-green-500 border-green-500 bg-green-50';
      case CampaignStatus.SCHEDULED:
        return 'text-blue-500 border-blue-500 bg-blue-50';
      case CampaignStatus.COMPLETED:
        return 'text-purple-500 border-purple-500 bg-purple-50';
      case CampaignStatus.CANCELLED:
        return 'text-red-500 border-red-500 bg-red-50';
      case CampaignStatus.DRAFT:
      default:
        return 'text-gray-500 border-gray-500 bg-gray-50';
    }
  };

  // Helper function to get event type color
  const getEventTypeColor = (type: CampaignType) => {
    switch (type) {
      case CampaignType.EMAIL:
        return 'bg-blue-100 text-blue-800';
      case CampaignType.SOCIAL:
        return 'bg-pink-100 text-pink-800';
      case CampaignType.PPC:
        return 'bg-green-100 text-green-800';
      case CampaignType.DISPLAY:
        return 'bg-yellow-100 text-yellow-800';
      case CampaignType.CONTENT:
        return 'bg-purple-100 text-purple-800';
      case CampaignType.EVENT:
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to get compact calendar marker colors
  const getEventMarkerColor = (type: CampaignType) => {
    switch (type) {
      case CampaignType.EMAIL:
        return 'bg-blue-500';
      case CampaignType.SOCIAL:
        return 'bg-pink-500';
      case CampaignType.PPC:
        return 'bg-green-500';
      case CampaignType.DISPLAY:
        return 'bg-amber-500';
      case CampaignType.CONTENT:
        return 'bg-violet-500';
      case CampaignType.EVENT:
        return 'bg-orange-500';
      default:
        return 'bg-slate-500';
    }
  };

  // Helper function to get approval status badge
  const getApprovalBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 border-green-500">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 border-red-500">Rejected</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-500">Pending Approval</Badge>;
      default:
        return null;
    }
  };

  // Calculate event conflicts for a specific date
  const hasConflicts = (date: Date): boolean => {
    const events = getEventsForDate(date);
    return events.length > 2; // Consider it a conflict if there are more than 2 events on the same day
  };

  const isSelectedDate = (date: Date) => isSameDate(date, selectedDate);

  const getViewButtonClassName = (view: CalendarView, withRightBorder = false) => {
    const isActive = selectedView === view;
    return [
      "px-3 transition-colors",
      withRightBorder ? "border-r" : "",
      isActive
        ? "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
        : "text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
    ].join(" ");
  };

  // Week day names
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Marketing Calendar</h2>
          <p className="text-muted-foreground">
            Plan, schedule, and manage your marketing campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openCreateEventDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>{editMode ? "Edit Campaign" : "Create Campaign"}</DialogTitle>
                <DialogDescription>
                  {editMode 
                    ? "Update the details of your marketing campaign." 
                    : "Add a new marketing campaign to your calendar."}
                </DialogDescription>
              </DialogHeader>
              <Form {...eventForm}>
                <form onSubmit={eventForm.handleSubmit(handleCreateEvent)} className="flex max-h-[calc(85vh-96px)] flex-col">
                  <div className="space-y-6 overflow-y-auto pr-1">
                  <FormField
                    control={eventForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Spring Collection Email Campaign" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={eventForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Campaign Type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select campaign type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={CampaignType.EMAIL}>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  <span>Email</span>
                                </div>
                              </SelectItem>
                              <SelectItem value={CampaignType.SOCIAL}>
                                <div className="flex items-center gap-2">
                                  <Share2 className="h-4 w-4" />
                                  <span>Social Media</span>
                                </div>
                              </SelectItem>
                              <SelectItem value={CampaignType.PPC}>
                                <div className="flex items-center gap-2">
                                  <Tag className="h-4 w-4" />
                                  <span>PPC/Search</span>
                                </div>
                              </SelectItem>
                              <SelectItem value={CampaignType.DISPLAY}>
                                <div className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  <span>Display Ads</span>
                                </div>
                              </SelectItem>
                              <SelectItem value={CampaignType.CONTENT}>
                                <div className="flex items-center gap-2">
                                  <FileDown className="h-4 w-4" />
                                  <span>Content</span>
                                </div>
                              </SelectItem>
                              <SelectItem value={CampaignType.EVENT}>
                                <div className="flex items-center gap-2">
                                  <CalendarCheck className="h-4 w-4" />
                                  <span>Event</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={eventForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Campaign Status</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={CampaignStatus.DRAFT}>Draft</SelectItem>
                              <SelectItem value={CampaignStatus.SCHEDULED}>Scheduled</SelectItem>
                              <SelectItem value={CampaignStatus.ACTIVE}>Active</SelectItem>
                              <SelectItem value={CampaignStatus.COMPLETED}>Completed</SelectItem>
                              <SelectItem value={CampaignStatus.CANCELLED}>Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={eventForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Briefly describe the campaign purpose and goals..." 
                            {...field} 
                            className="min-h-[80px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={eventForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                              <Input type="date" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={eventForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date (Optional)</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                              <Input type="date" {...field} />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Leave blank for single-day campaigns
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={eventForm.control}
                      name="segment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Segment</FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select audience segment" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="All Customers">
                                All Customers
                              </SelectItem>
                              {segments.map(segment => (
                                <SelectItem key={segment.id} value={segment.name}>
                                  {segment.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={eventForm.control}
                      name="budget"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Budget (Optional)</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <span className="absolute ml-3 text-muted-foreground">$</span>
                              <Input 
                                type="number" 
                                {...field} 
                                value={field.value || ""} 
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)} 
                                className="pl-7"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {overlappingCampaigns.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                        <div className="space-y-1">
                          <p className="font-medium text-amber-900">Schedule overlap detected</p>
                          <p className="text-amber-800">
                            This campaign overlaps with {overlappingCampaigns.length} existing campaign{overlappingCampaigns.length > 1 ? "s" : ""}.
                          </p>
                          <p className="text-amber-700">
                            {overlappingCampaigns.slice(0, 3).map((event) => event.title).join(", ")}
                            {overlappingCampaigns.length > 3 ? ` and ${overlappingCampaigns.length - 3} more` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <FormField
                    control={eventForm.control}
                    name="channels"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channels</FormLabel>
                        <FormDescription>
                          Select every channel this campaign will run on.
                        </FormDescription>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          {CHANNEL_OPTIONS.map((channel) => {
                            const checked = field.value?.includes(channel.value) ?? false;
                            return (
                              <label
                                key={channel.value}
                                className="flex items-center gap-3 rounded-md border p-3 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(isChecked) => {
                                    if (isChecked) {
                                      field.onChange([...(field.value || []), channel.value]);
                                      return;
                                    }
                                    field.onChange((field.value || []).filter((value) => value !== channel.value));
                                  }}
                                />
                                <span>{channel.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-4 rounded-md border p-4">
                    <div>
                      <Label className="text-base font-medium">Campaign Goals</Label>
                      <p className="text-sm text-muted-foreground">
                        These targets feed the marketing analytics and ROI views.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField
                        control={eventForm.control}
                        name="goals.sales"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Goal</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 150 purchases" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={eventForm.control}
                        name="goals.engagement"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Engagement Goal</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 3.5% CTR" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={eventForm.control}
                        name="goals.awareness"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Awareness Goal</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 20k reach" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <FormField
                    control={eventForm.control}
                    name="requiresApproval"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Requires Approval</FormLabel>
                          <FormDescription>
                            Campaign will need to be approved before going live
                          </FormDescription>
                        </div>
                      </FormItem>
                      )}
                  />
                  </div>
                  <DialogFooter className="mt-6 border-t pt-4">
                    {editMode ? (
                      <div className="flex flex-1 justify-between">
                        <div className="flex flex-col gap-1">
                          {isAdmin ? (
                            <Button
                              variant="outline"
                              type="button"
                              className="text-red-500"
                              disabled={!selectedEvent || deleteCampaignMutation.isPending}
                              onClick={() => selectedEvent && deleteCampaignMutation.mutate(selectedEvent.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {deleteCampaignMutation.isPending ? "Deleting..." : "Delete"}
                            </Button>
                          ) : (
                            <Button variant="outline" type="button" disabled>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Restricted
                            </Button>
                          )}
                          {!isAdmin && (
                            <p className="text-xs text-muted-foreground">
                              Only admins can delete campaigns.
                            </p>
                          )}
                        </div>
                        <Button type="submit" disabled={saveCampaignMutation.isPending}>
                          <Save className="h-4 w-4 mr-2" />
                          {saveCampaignMutation.isPending ? "Updating..." : "Update Campaign"}
                        </Button>
                      </div>
                    ) : (
                      <Button type="submit" disabled={saveCampaignMutation.isPending}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {saveCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
                      </Button>
                    )}
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevious}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToNext}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <h3 className="text-xl font-semibold pl-2">
            {selectedView === 'month' 
              ? getMonthName(currentDate) 
              : selectedView === 'week'
                ? `Week of ${formatDate(getWeekDays()[0].date)} - ${formatDate(getWeekDays()[6].date)}`
                : formatDate(selectedDate)
            }
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <Button 
              variant="ghost"
              className={getViewButtonClassName('month', true)}
              onClick={() => setSelectedView('month' as CalendarView)}
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Month
            </Button>
            <Button 
              variant="ghost"
              className={getViewButtonClassName('week', true)}
              onClick={() => setSelectedView('week' as CalendarView)}
            >
              <CalendarRange className="h-4 w-4 mr-2" />
              Week
            </Button>
            <Button 
              variant="ghost"
              className={getViewButtonClassName('day', true)}
              onClick={() => setSelectedView('day' as CalendarView)}
            >
              <CalendarIcon2 className="h-4 w-4 mr-2" />
              Day
            </Button>
            <Button 
              variant="ghost"
              className={getViewButtonClassName('list')}
              onClick={() => setSelectedView('list' as CalendarView)}
            >
              <CalendarCheck className="h-4 w-4 mr-2" />
              List
            </Button>
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value={CampaignType.EMAIL}>Email</SelectItem>
              <SelectItem value={CampaignType.SOCIAL}>Social Media</SelectItem>
              <SelectItem value={CampaignType.PPC}>PPC/Search</SelectItem>
              <SelectItem value={CampaignType.DISPLAY}>Display Ads</SelectItem>
              <SelectItem value={CampaignType.CONTENT}>Content</SelectItem>
              <SelectItem value={CampaignType.EVENT}>Event</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value={CampaignStatus.DRAFT}>Draft</SelectItem>
              <SelectItem value={CampaignStatus.SCHEDULED}>Scheduled</SelectItem>
              <SelectItem value={CampaignStatus.ACTIVE}>Active</SelectItem>
              <SelectItem value={CampaignStatus.COMPLETED}>Completed</SelectItem>
              <SelectItem value={CampaignStatus.CANCELLED}>Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Month View */}
      {selectedView === 'month' && (
        <Card>
          <CardContent className="p-0">
            {/* Calendar Header - Weekday names */}
            <div className="grid grid-cols-7 border-b">
              {weekDays.map(day => (
                <div
                  key={day}
                  className="py-2 text-center font-medium text-sm border-r last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar Grid - Weeks and Days */}
            <div>
              {monthData.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0">
                  {week.days.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      className={`min-h-[120px] cursor-pointer border-r p-1 last:border-r-0 relative transition-colors ${
                        day.isCurrentMonth ? 'bg-background hover:bg-slate-50/70' : 'bg-muted/20'
                      } ${isSelectedDate(day.date) ? 'bg-sky-50 ring-2 ring-inset ring-sky-300' : ''} ${
                        day.isToday ? 'bg-sky-50/70' : ''
                      }`}
                      onClick={() => {
                        setSelectedDate(day.date);
                        if (selectedView !== 'day' as CalendarView) {
                          setSelectedView('day' as CalendarView);
                        }
                      }}
                    >
                      {/* Day number with indicator for events */}
                      <div className="flex justify-between items-center mb-1">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                          isSelectedDate(day.date)
                            ? 'border-sky-600 bg-sky-600 text-white shadow-sm'
                            : day.isToday
                            ? 'border-sky-300 bg-sky-100 text-sky-700'
                            : 'border-transparent text-slate-700'
                        }`}>
                          {day.date.getDate()}
                        </span>
                        
                        {day.events.length > 0 && (
                          <div className="flex -space-x-1">
                            {hasConflicts(day.date) && (
                              <div className="h-5 w-5 rounded-full bg-red-100 border border-red-500 flex items-center justify-center z-10">
                                <AlertCircle className="h-3 w-3 text-red-500" />
                              </div>
                            )}
                            <Popover>
                              <PopoverTrigger asChild>
                                <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/95 px-1.5 py-1 shadow-sm cursor-pointer">
                                  <div className="flex items-center gap-0.5">
                                    {day.events.slice(0, 3).map((event) => (
                                      <span
                                        key={event.id}
                                        className={`h-2.5 w-2.5 rounded-full ${getEventMarkerColor(event.type)}`}
                                      />
                                    ))}
                                  </div>
                                  <span className="text-[10px] font-medium text-muted-foreground">{day.events.length}</span>
                                </div>
                              </PopoverTrigger>
                              <PopoverContent className="w-80">
                                <div className="space-y-2">
                                  <h4 className="font-medium">
                                    Events on {formatDate(day.date)}
                                  </h4>
                                  <div className="max-h-60 overflow-auto space-y-1">
                                    {day.events.map(event => (
                                      <div 
                                        key={event.id} 
                                        className="p-2 rounded border hover:bg-muted cursor-pointer"
                                        onClick={() => {
                                          setSelectedEvent(event);
                                          openEditEventDialog(event);
                                        }}
                                      >
                                        <div className="flex items-center gap-1">
                                          {getEventTypeIcon(event.type)}
                                          <span className="font-medium text-sm">{event.title}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{event.status}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                      </div>
                      
                      {/* Event items (limited to 3 with overflow indicator) */}
                      <div className="space-y-1">
                        {day.events.slice(0, 3).map(event => (
                          <div 
                            key={event.id}
                            className={`text-xs px-1 py-0.5 rounded truncate cursor-pointer ${getEventTypeColor(event.type)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(event);
                              openEditEventDialog(event);
                            }}
                            title={event.title}
                          >
                            {event.title}
                          </div>
                        ))}
                        {day.events.length > 3 && (
                          <div className="text-xs text-muted-foreground px-1">
                            +{day.events.length - 3} more
                          </div>
                        )}
                      </div>
                      
                      {/* Quick add button (only shown on hover) */}
                      <div className="absolute bottom-1 right-1 opacity-0 hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCreateEventDialog(day.date);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Week View */}
      {selectedView === 'week' && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b">
              {getWeekDays().map((day, index) => (
                <div
                  key={index}
                  className={`border-r p-3 text-center last:border-r-0 transition-colors ${
                    isSelectedDate(day.date)
                      ? 'bg-sky-50'
                      : day.isToday
                      ? 'bg-sky-50/70'
                      : day.isCurrentMonth
                      ? 'bg-background'
                      : 'bg-muted/20'
                  }`}
                >
                  <div className="font-medium">{weekDays[index]}</div>
                  <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border text-2xl font-bold transition-colors ${
                    isSelectedDate(day.date)
                      ? 'border-sky-600 bg-sky-600 text-white shadow-sm'
                      : day.isToday
                      ? 'border-sky-300 bg-sky-100 text-sky-700'
                      : 'border-transparent text-slate-900'
                  }`}>
                    {day.date.getDate()}
                  </div>
                  <div className={`text-xs ${isSelectedDate(day.date) ? 'text-sky-700' : 'text-muted-foreground'}`}>
                    {day.date.toLocaleDateString('default', { month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7">
              {getWeekDays().map((day, dayIndex) => (
                <div 
                  key={dayIndex} 
                  className={`min-h-[400px] border-r p-2 last:border-r-0 transition-colors ${
                    isSelectedDate(day.date)
                      ? 'bg-sky-50/60'
                      : day.isToday
                      ? 'bg-sky-50/40'
                      : day.isCurrentMonth
                      ? 'bg-background'
                      : 'bg-muted/10'
                  }`}
                >
                  <div className="space-y-2">
                    {day.events.map(event => (
                      <div 
                        key={event.id}
                        className={`p-2 rounded border text-sm cursor-pointer ${getEventStatusColor(event.status)}`}
                        onClick={() => {
                          setSelectedEvent(event);
                          openEditEventDialog(event);
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1 font-medium">
                            {getEventTypeIcon(event.type)}
                            <span className="truncate max-w-[110px]">{event.title}</span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getEventStatusColor(event.status)}`}
                          >
                            {event.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {event.description}
                        </div>
                        <div className="flex justify-between items-center mt-1 text-xs">
                          <span>
                            {event.channel}
                          </span>
                          {event.budget && (
                            <span className="font-medium">
                              ${event.budget.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {day.events.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-8">
                        <span className="text-sm">No events</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => openCreateEventDialog(day.date)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Day View */}
      {selectedView === 'day' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <CardTitle>
                      {selectedDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </CardTitle>
                    {isSelectedDate(new Date()) && (
                      <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">
                        Today
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => openCreateEventDialog(selectedDate)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Event
                  </Button>
                </div>
                {getEventsForDate(selectedDate).length === 0 ? (
                  <CardDescription>No events scheduled for today</CardDescription>
                ) : (
                  <CardDescription>{getEventsForDate(selectedDate).length} events scheduled</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getEventsForDate(selectedDate).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <CalendarX className="h-10 w-10 mb-2" />
                      <h3 className="text-lg font-medium">No events scheduled</h3>
                      <p className="max-w-sm">
                        There are no marketing campaigns scheduled for this day. Click the "Add Event" button to create one.
                      </p>
                    </div>
                  ) : (
                    getEventsForDate(selectedDate).map(event => (
                      <Card key={event.id} className={`border-l-4 ${getEventStatusColor(event.status)}`}>
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="font-medium flex items-center gap-2">
                                    {getEventTypeIcon(event.type)}
                                    {event.title}
                                  </h3>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <Badge variant="outline" className={getEventStatusColor(event.status)}>
                                      {event.status}
                                    </Badge>
                                    <Badge className={getEventTypeColor(event.type)}>
                                      {event.type}
                                    </Badge>
                                    {getApprovalBadge(event.approvalStatus)}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => openEditEventDialog(event)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm">{event.description}</p>
                              <div className="flex flex-wrap gap-4 text-sm">
                                {event.segment && (
                                  <div className="flex items-center gap-1">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    <span>{event.segment}</span>
                                  </div>
                                )}
                                {event.channel && (
                                  <div className="flex items-center gap-1">
                                    <Tag className="h-4 w-4 text-muted-foreground" />
                                    <span>{event.channel}</span>
                                  </div>
                                )}
                                {event.budget && (
                                  <div className="flex items-center gap-1">
                                    <Landmark className="h-4 w-4 text-muted-foreground" />
                                    <span>${event.budget.toLocaleString()}</span>
                                  </div>
                                )}
                                {event.owner && (
                                  <div className="flex items-center gap-1">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    <span>{event.owner}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {event.tasks && event.tasks.length > 0 && (
                              <div className="border-l pl-4 space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-1">
                                  <Check className="h-4 w-4" />
                                  Tasks ({event.tasks.filter(t => t.completed).length}/{event.tasks.length})
                                </h4>
                                <div className="space-y-1">
                                  {event.tasks.map(task => (
                                    <div key={task.id} className="flex items-start gap-2 text-sm">
                                      <Checkbox checked={task.completed} />
                                      <div>
                                        <div className={task.completed ? 'line-through text-muted-foreground' : ''}>
                                          {task.title}
                                        </div>
                                        {task.assignee && (
                                          <div className="text-xs text-muted-foreground">
                                            {task.assignee} • {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Monthly Overview</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                  {weekDays.map(day => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthData.weeks.flatMap(week => 
                    week.days.map((day, index) => (
                      <button
                        key={`${day.date.getDate()}-${index}`}
                        type="button"
                        className={`relative h-8 w-8 p-0 ${
                          isSelectedDate(day.date)
                            ? 'rounded-full border border-sky-600 bg-sky-600 text-white shadow-sm'
                            : day.isCurrentMonth
                            ? day.isToday
                              ? 'rounded-full border border-sky-300 bg-sky-100 text-sky-700'
                              : 'rounded-full text-slate-700 hover:bg-slate-100'
                            : 'text-muted-foreground opacity-50'
                        } ${day.events.length > 0 ? 'font-bold' : ''}`}
                        onClick={() => setSelectedDate(day.date)}
                      >
                        <span>{day.date.getDate()}</span>
                        {day.events.length > 0 && (
                          <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5">
                            {day.events.slice(0, 3).map((event) => (
                              <span
                                key={event.id}
                                className={`h-1.5 w-1.5 rounded-full ${getEventMarkerColor(event.type)} ${
                                  isSelectedDate(day.date) ? 'ring-1 ring-white/80' : ''
                                }`}
                              />
                            ))}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Upcoming Campaigns</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {marketingEvents
                    .filter(event => {
                      const eventDate = new Date(event.startDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return (
                        (event.status === CampaignStatus.SCHEDULED || event.status === CampaignStatus.ACTIVE) &&
                        eventDate >= today
                      );
                    })
                    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                    .slice(0, 5)
                    .map(event => (
                      <div 
                        key={event.id} 
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                        onClick={() => {
                          const eventDate = new Date(event.startDate);
                          setSelectedDate(eventDate);
                          if (selectedView !== 'day' as CalendarView) {
                            setSelectedView('day' as CalendarView);
                          }
                        }}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getEventTypeColor(event.type)}`}>
                          {getEventTypeIcon(event.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{event.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(event.startDate).toLocaleDateString()}
                            {event.endDate ? ` - ${new Date(event.endDate).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <Badge variant="outline" className={getEventStatusColor(event.status)}>
                          {event.status}
                        </Badge>
                      </div>
                    ))}
                  
                  {marketingEvents.filter(event => 
                    (event.status === CampaignStatus.SCHEDULED || event.status === CampaignStatus.ACTIVE) &&
                    new Date(event.startDate) >= new Date()
                  ).length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      <p>No upcoming campaigns</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Workload Distribution</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Group tasks by assignee and count */}
                  {Object.entries(
                    marketingEvents
                      .flatMap(event => event.tasks || [])
                      .filter(task => !task.completed)
                      .reduce((acc, task) => {
                        const assignee = task.assignee || 'Unassigned';
                        acc[assignee] = (acc[assignee] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([assignee, count]) => (
                      <div key={assignee} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            {assignee.charAt(0)}
                          </div>
                          <span>{assignee}</span>
                        </div>
                        <Badge>{count} task{count === 1 ? '' : 's'}</Badge>
                      </div>
                    ))}
                  
                  {Object.keys(
                    marketingEvents
                      .flatMap(event => event.tasks || [])
                      .filter(task => !task.completed)
                      .reduce((acc, task) => {
                        const assignee = task.assignee || 'Unassigned';
                        acc[assignee] = (acc[assignee] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                  ).length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      <p>No active tasks</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      {/* List View */}
      {selectedView === 'list' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle>Campaign List</CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openCreateEventDialog()}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
            <CardDescription>All scheduled marketing campaigns and events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  className="max-w-sm"
                />
              </div>
              
              <div className="rounded-md border">
                <div className="grid grid-cols-12 p-3 border-b bg-muted/40">
                  <div className="col-span-4 font-medium">Campaign</div>
                  <div className="col-span-2 font-medium">Date</div>
                  <div className="col-span-2 font-medium">Type</div>
                  <div className="col-span-2 font-medium">Status</div>
                  <div className="col-span-2 font-medium text-right">Actions</div>
                </div>
                
                {marketingEvents.length > 0 ? (
                  marketingEvents
                    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                    .map(event => (
                      <div key={event.id} className="grid grid-cols-12 p-3 border-b hover:bg-muted/20">
                        <div className="col-span-4 font-medium flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getEventTypeColor(event.type)}`}>
                            {getEventTypeIcon(event.type)}
                          </div>
                          <div>
                            <div className="truncate">{event.title}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                              {event.description}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 flex items-center">
                          <div>
                            <div className="text-sm">{new Date(event.startDate).toLocaleDateString()}</div>
                            {event.endDate && (
                              <div className="text-xs text-muted-foreground">
                                to {new Date(event.endDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 flex items-center">
                          <Badge className={getEventTypeColor(event.type)}>
                            {event.type}
                          </Badge>
                        </div>
                        <div className="col-span-2 flex items-center">
                          <Badge variant="outline" className={getEventStatusColor(event.status)}>
                            {event.status}
                          </Badge>
                        </div>
                        <div className="col-span-2 flex justify-end items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              const eventDate = new Date(event.startDate);
                              setSelectedDate(eventDate);
                              setSelectedView('day' as CalendarView);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openEditEventDialog(event)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <p>No campaigns found matching the selected filters.</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper components
const Check = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 6 9 17l-5-5"/></svg>;
