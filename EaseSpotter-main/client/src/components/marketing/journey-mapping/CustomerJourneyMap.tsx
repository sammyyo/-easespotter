import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  Edit,
  Heart,
  Info,
  MailQuestion,
  Plus,
  PlusCircle,
  Share,
  ShoppingCart,
  Trash2,
  User,
} from "lucide-react";
import { MultiColorCircularProgress, PROGRESS_COLORS } from "@/components/ui/circular-progress";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CustomerSegment {
  id: string;
  name: string;
}

interface JourneyTouchpoint {
  id: string;
  stageId: string;
  name: string;
  channel: "email" | "website" | "social" | "phone" | "app" | "in-store" | "other";
  description: string;
  dropoff: number;
  sentiment: "positive" | "neutral" | "negative";
  metrics: {
    engagementRate?: number;
    conversionRate?: number;
    bounceRate?: number;
    responseTime?: string;
  };
}

interface JourneyStage {
  id: string;
  journeyId: string;
  name: string;
  description: string;
  duration: string;
  touchpoints: JourneyTouchpoint[];
  conversionRate: number;
  painPoints: string[];
  opportunities: string[];
}

interface CustomerJourney {
  id: string;
  vendorId: number;
  name: string;
  description: string;
  segment: string;
  segmentName: string;
  stages: JourneyStage[];
}

const journeySchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  segment: z.string().min(1, "Please select a segment"),
});

const stageSchema = z.object({
  name: z.string().min(2, "Stage name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  duration: z.string().min(1, "Duration is required"),
  conversionRate: z.number().min(0).max(100),
  painPoints: z.string().default(""),
  opportunities: z.string().default(""),
});

const touchpointSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  channel: z.enum(["email", "website", "social", "phone", "app", "in-store", "other"]),
  description: z.string().min(5, "Description must be at least 5 characters"),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  dropoff: z.number().min(0).max(100),
  engagementRate: z.number().min(0).max(100).optional(),
  conversionRate: z.number().min(0).max(100).optional(),
  bounceRate: z.number().min(0).max(100).optional(),
  responseTime: z.string().optional(),
});

type JourneyFormValues = z.infer<typeof journeySchema>;
type StageFormValues = z.infer<typeof stageSchema>;
type TouchpointFormValues = z.infer<typeof touchpointSchema>;

function Mail({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
}
function Globe({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
}
function ShareNetwork({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>;
}
function Phone({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}
function Smartphone({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>;
}
function Store({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2 2 0 0 1-2-2V7"/><path d="M18 12v0a2 2 0 0 1-2-2V7"/><path d="M14 12v0a2 2 0 0 1-2-2V7"/><path d="M10 12v0a2 2 0 0 1-2-2V7"/><path d="M6 12v0a2 2 0 0 1-2-2V7"/></svg>;
}
function Circle({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/></svg>;
}
function Tag({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.586 2.586A2 2 0 0 1 14 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-.586 1.414l-10 10a2 2 0 0 1-2.828 0l-6-6a2 2 0 0 1 0-2.828z"/><circle cx="17.5" cy="6.5" r=".5" fill="currentColor"/></svg>;
}

function parseList(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function listToText(items: string[]) {
  return items.join("\n");
}

function getChannelIcon(channel: JourneyTouchpoint["channel"]) {
  switch (channel) {
    case "email":
      return <Mail className="h-4 w-4" />;
    case "website":
      return <Globe className="h-4 w-4" />;
    case "social":
      return <ShareNetwork className="h-4 w-4" />;
    case "phone":
      return <Phone className="h-4 w-4" />;
    case "app":
      return <Smartphone className="h-4 w-4" />;
    case "in-store":
      return <Store className="h-4 w-4" />;
    default:
      return <Circle className="h-4 w-4" />;
  }
}

function getStageIcon(stageName: string) {
  switch (stageName.toLowerCase()) {
    case "discovery":
      return <User className="h-5 w-5" />;
    case "consideration":
      return <ShoppingCart className="h-5 w-5" />;
    case "purchase":
      return <CreditCard className="h-5 w-5" />;
    case "retention":
      return <Heart className="h-5 w-5" />;
    case "abandonment":
      return <ShoppingCart className="h-5 w-5" />;
    case "first reminder":
      return <Mail className="h-5 w-5" />;
    case "incentive offer":
      return <Tag className="h-5 w-5" />;
    case "final reminder":
      return <MailQuestion className="h-5 w-5" />;
    default:
      return <Circle className="h-5 w-5" />;
  }
}

function sentimentColor(sentiment: JourneyTouchpoint["sentiment"]) {
  switch (sentiment) {
    case "positive":
      return "bg-green-500";
    case "negative":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function ChannelTag({ channel }: { channel: JourneyTouchpoint["channel"] }) {
  const colors: Record<JourneyTouchpoint["channel"], string> = {
    email: "bg-blue-100 text-blue-800 border-blue-300",
    website: "bg-purple-100 text-purple-800 border-purple-300",
    social: "bg-pink-100 text-pink-800 border-pink-300",
    phone: "bg-green-100 text-green-800 border-green-300",
    app: "bg-orange-100 text-orange-800 border-orange-300",
    "in-store": "bg-yellow-100 text-yellow-800 border-yellow-300",
    other: "bg-gray-100 text-gray-800 border-gray-300",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[channel]}`}>
      {channel.charAt(0).toUpperCase() + channel.slice(1)}
    </span>
  );
}

function stageRetention(stage: JourneyStage) {
  if (!stage.touchpoints.length) return stage.conversionRate;
  return stage.touchpoints.reduce((sum, touchpoint) => sum + (100 - touchpoint.dropoff), 0) / stage.touchpoints.length;
}

export function CustomerJourneyMap() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedJourneyId, setSelectedJourneyId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedTouchpointId, setSelectedTouchpointId] = useState("");
  const [createJourneyOpen, setCreateJourneyOpen] = useState(false);
  const [editJourneyOpen, setEditJourneyOpen] = useState(false);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [editStageOpen, setEditStageOpen] = useState(false);
  const [addTouchpointOpen, setAddTouchpointOpen] = useState(false);
  const [editTouchpointOpen, setEditTouchpointOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const { data: segments = [] } = useQuery<CustomerSegment[]>({
    queryKey: ["/api/marketing/segments"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/segments");
      if (!response.ok) throw new Error("Failed to fetch customer segments");
      return response.json();
    },
    initialData: [],
  });

  const { data: journeys = [], isLoading } = useQuery<CustomerJourney[]>({
    queryKey: ["/api/marketing/journeys"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/journeys");
      if (!response.ok) throw new Error("Failed to fetch customer journeys");
      return response.json();
    },
    initialData: [],
  });

  const selectedJourney = journeys.find((journey) => journey.id === selectedJourneyId) || null;
  const selectedStage = selectedJourney?.stages.find((stage) => stage.id === selectedStageId) || selectedJourney?.stages[0] || null;
  const selectedTouchpoint = selectedStage?.touchpoints.find((touchpoint) => touchpoint.id === selectedTouchpointId) || null;

  useEffect(() => {
    if (!journeys.length) {
      setSelectedJourneyId("");
      setSelectedStageId("");
      setSelectedTouchpointId("");
      return;
    }

    const nextJourney = journeys.find((journey) => journey.id === selectedJourneyId) || journeys[0];
    const nextStage = nextJourney.stages.find((stage) => stage.id === selectedStageId) || nextJourney.stages[0] || null;
    const nextTouchpoint = nextStage?.touchpoints.find((touchpoint) => touchpoint.id === selectedTouchpointId) || null;

    if (nextJourney.id !== selectedJourneyId) setSelectedJourneyId(nextJourney.id);
    if (nextStage && nextStage.id !== selectedStageId) setSelectedStageId(nextStage.id);
    if (!nextTouchpoint && selectedTouchpointId) setSelectedTouchpointId("");
  }, [journeys, selectedJourneyId, selectedStageId, selectedTouchpointId]);

  const journeyForm = useForm<JourneyFormValues>({
    resolver: zodResolver(journeySchema),
    defaultValues: { name: "", description: "", segment: "" },
  });
  const stageForm = useForm<StageFormValues>({
    resolver: zodResolver(stageSchema),
    defaultValues: { name: "", description: "", duration: "", conversionRate: 0, painPoints: "", opportunities: "" },
  });
  const touchpointForm = useForm<TouchpointFormValues>({
    resolver: zodResolver(touchpointSchema),
    defaultValues: {
      name: "",
      channel: "website",
      description: "",
      sentiment: "neutral",
      dropoff: 0,
      engagementRate: undefined,
      conversionRate: undefined,
      bounceRate: undefined,
      responseTime: "",
    },
  });

  useEffect(() => {
    if (editJourneyOpen && selectedJourney) {
      journeyForm.reset({
        name: selectedJourney.name,
        description: selectedJourney.description,
        segment: selectedJourney.segment,
      });
    }
  }, [editJourneyOpen, selectedJourney, journeyForm]);

  useEffect(() => {
    if (editStageOpen && selectedStage) {
      stageForm.reset({
        name: selectedStage.name,
        description: selectedStage.description,
        duration: selectedStage.duration,
        conversionRate: selectedStage.conversionRate,
        painPoints: listToText(selectedStage.painPoints),
        opportunities: listToText(selectedStage.opportunities),
      });
    }
    if (addStageOpen) {
      stageForm.reset({
        name: "",
        description: "",
        duration: "",
        conversionRate: 0,
        painPoints: "",
        opportunities: "",
      });
    }
  }, [editStageOpen, addStageOpen, selectedStage, stageForm]);

  useEffect(() => {
    if (editTouchpointOpen && selectedTouchpoint) {
      touchpointForm.reset({
        name: selectedTouchpoint.name,
        channel: selectedTouchpoint.channel,
        description: selectedTouchpoint.description,
        sentiment: selectedTouchpoint.sentiment,
        dropoff: selectedTouchpoint.dropoff,
        engagementRate: selectedTouchpoint.metrics.engagementRate,
        conversionRate: selectedTouchpoint.metrics.conversionRate,
        bounceRate: selectedTouchpoint.metrics.bounceRate,
        responseTime: selectedTouchpoint.metrics.responseTime || "",
      });
    }
    if (addTouchpointOpen) {
      touchpointForm.reset({
        name: "",
        channel: "website",
        description: "",
        sentiment: "neutral",
        dropoff: 0,
        engagementRate: undefined,
        conversionRate: undefined,
        bounceRate: undefined,
        responseTime: "",
      });
    }
  }, [editTouchpointOpen, addTouchpointOpen, selectedTouchpoint, touchpointForm]);

  const channelSegments = useMemo(() => {
    const totals = selectedJourney?.stages.flatMap((stage) => stage.touchpoints).reduce<Record<string, number>>((acc, touchpoint) => {
      acc[touchpoint.channel] = (acc[touchpoint.channel] || 0) + 1;
      return acc;
    }, {}) || {};
    const totalTouchpoints = Object.values(totals).reduce((sum, count) => sum + count, 0);
    const channelColors: Record<string, string> = {
      website: PROGRESS_COLORS.purple,
      email: PROGRESS_COLORS.cyan,
      social: PROGRESS_COLORS.pink,
      phone: PROGRESS_COLORS.green,
      app: PROGRESS_COLORS.orange,
      "in-store": PROGRESS_COLORS.good,
      other: PROGRESS_COLORS.average,
    };
    return Object.entries(totals).map(([channel, count]) => ({
      value: totalTouchpoints ? Math.round((count / totalTouchpoints) * 100) : 0,
      color: channelColors[channel] || PROGRESS_COLORS.average,
      label: channel,
    }));
  }, [selectedJourney]);

  const createJourneyMutation = useMutation({
    mutationFn: async (values: JourneyFormValues) => {
      const response = await apiRequest("POST", "/api/marketing/journeys", {
        name: values.name,
        description: values.description,
        segmentId: Number(values.segment),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create journey");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setCreateJourneyOpen(false);
      setSelectedJourneyId(journey.id);
      toast({ title: "Journey created", description: `"${journey.name}" is now available in Journey Mapping.` });
    },
    onError: (error: Error) => toast({ title: "Failed to create journey", description: error.message, variant: "destructive" }),
  });

  const updateJourneyMutation = useMutation({
    mutationFn: async (values: JourneyFormValues) => {
      if (!selectedJourney) throw new Error("No journey selected");
      const response = await apiRequest("PATCH", `/api/marketing/journeys/${selectedJourney.id}`, {
        name: values.name,
        description: values.description,
        segmentId: Number(values.segment),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update journey");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setEditJourneyOpen(false);
      setSelectedJourneyId(journey.id);
      toast({ title: "Journey updated", description: "Journey details have been saved." });
    },
    onError: (error: Error) => toast({ title: "Failed to update journey", description: error.message, variant: "destructive" }),
  });

  const addStageMutation = useMutation({
    mutationFn: async (values: StageFormValues) => {
      if (!selectedJourney) throw new Error("No journey selected");
      const response = await apiRequest("POST", `/api/marketing/journeys/${selectedJourney.id}/stages`, {
        name: values.name,
        description: values.description,
        duration: values.duration,
        conversionRate: values.conversionRate,
        painPoints: parseList(values.painPoints),
        opportunities: parseList(values.opportunities),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to add stage");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setAddStageOpen(false);
      setSelectedJourneyId(journey.id);
      setSelectedStageId(journey.stages[journey.stages.length - 1]?.id || "");
      toast({ title: "Stage added", description: "The journey map has been updated." });
    },
    onError: (error: Error) => toast({ title: "Failed to add stage", description: error.message, variant: "destructive" }),
  });

  const updateStageMutation = useMutation({
    mutationFn: async (values: StageFormValues) => {
      if (!selectedStage) throw new Error("No stage selected");
      const response = await apiRequest("PATCH", `/api/marketing/journeys/stages/${selectedStage.id}`, {
        name: values.name,
        description: values.description,
        duration: values.duration,
        conversionRate: values.conversionRate,
        painPoints: parseList(values.painPoints),
        opportunities: parseList(values.opportunities),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update stage");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setEditStageOpen(false);
      setSelectedJourneyId(journey.id);
      toast({ title: "Stage updated", description: "Stage details have been saved." });
    },
    onError: (error: Error) => toast({ title: "Failed to update stage", description: error.message, variant: "destructive" }),
  });

  const reorderStageMutation = useMutation({
    mutationFn: async (orderedStageIds: string[]) => {
      if (!selectedJourney) throw new Error("No journey selected");
      const response = await apiRequest("PATCH", `/api/marketing/journeys/${selectedJourney.id}/stages/reorder`, {
        orderedStageIds: orderedStageIds.map(Number),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to reorder stages");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setSelectedJourneyId(journey.id);
    },
    onError: (error: Error) => toast({ title: "Failed to reorder stages", description: error.message, variant: "destructive" }),
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      const response = await apiRequest("DELETE", `/api/marketing/journeys/stages/${stageId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to remove stage");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setSelectedJourneyId(journey.id);
      setSelectedStageId(journey.stages[0]?.id || "");
      setSelectedTouchpointId("");
      toast({ title: "Stage removed", description: "The journey map has been updated." });
    },
    onError: (error: Error) => toast({ title: "Failed to remove stage", description: error.message, variant: "destructive" }),
  });

  const addTouchpointMutation = useMutation({
    mutationFn: async (values: TouchpointFormValues) => {
      if (!selectedJourney || !selectedStage) throw new Error("Select a journey stage before adding a touchpoint");
      const response = await apiRequest("POST", `/api/marketing/journeys/${selectedJourney.id}/touchpoints`, {
        stageId: Number(selectedStage.id),
        name: values.name,
        channel: values.channel,
        description: values.description,
        sentiment: values.sentiment,
        dropoff: values.dropoff,
        metrics: {
          engagementRate: values.engagementRate,
          conversionRate: values.conversionRate,
          bounceRate: values.bounceRate,
          responseTime: values.responseTime || undefined,
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to add touchpoint");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      const stage = journey.stages.find((item) => item.id === selectedStage?.id) || journey.stages[0];
      setAddTouchpointOpen(false);
      setSelectedJourneyId(journey.id);
      setSelectedStageId(stage?.id || "");
      setSelectedTouchpointId(stage?.touchpoints[stage.touchpoints.length - 1]?.id || "");
      toast({ title: "Touchpoint added", description: "The journey map has been updated." });
    },
    onError: (error: Error) => toast({ title: "Failed to add touchpoint", description: error.message, variant: "destructive" }),
  });

  const updateTouchpointMutation = useMutation({
    mutationFn: async (values: TouchpointFormValues) => {
      if (!selectedTouchpoint) throw new Error("No touchpoint selected");
      const response = await apiRequest("PATCH", `/api/marketing/journeys/touchpoints/${selectedTouchpoint.id}`, {
        name: values.name,
        channel: values.channel,
        description: values.description,
        sentiment: values.sentiment,
        dropoff: values.dropoff,
        metrics: {
          engagementRate: values.engagementRate,
          conversionRate: values.conversionRate,
          bounceRate: values.bounceRate,
          responseTime: values.responseTime || undefined,
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update touchpoint");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      setEditTouchpointOpen(false);
      setSelectedJourneyId(journey.id);
      toast({ title: "Touchpoint updated", description: "Touchpoint details have been saved." });
    },
    onError: (error: Error) => toast({ title: "Failed to update touchpoint", description: error.message, variant: "destructive" }),
  });

  const deleteJourneyMutation = useMutation({
    mutationFn: async (journeyId: string) => {
      const response = await apiRequest("DELETE", `/api/marketing/journeys/${journeyId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete journey");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      toast({ title: "Journey removed", description: "The customer journey has been deleted." });
    },
    onError: (error: Error) => toast({ title: "Failed to delete journey", description: error.message, variant: "destructive" }),
  });

  const deleteTouchpointMutation = useMutation({
    mutationFn: async (touchpointId: string) => {
      const response = await apiRequest("DELETE", `/api/marketing/journeys/touchpoints/${touchpointId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to remove touchpoint");
      }
      return response.json();
    },
    onSuccess: (journey: CustomerJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journeys"] });
      const stage = journey.stages.find((item) => item.id === selectedStage?.id) || journey.stages[0];
      setSelectedJourneyId(journey.id);
      setSelectedStageId(stage?.id || "");
      setSelectedTouchpointId("");
      toast({ title: "Touchpoint removed", description: "The journey map has been updated." });
    },
    onError: (error: Error) => toast({ title: "Failed to remove touchpoint", description: error.message, variant: "destructive" }),
  });

  const moveStage = (direction: "up" | "down") => {
    if (!selectedJourney || !selectedStage) return;
    const index = selectedJourney.stages.findIndex((stage) => stage.id === selectedStage.id);
    if ((direction === "up" && index <= 0) || (direction === "down" && index >= selectedJourney.stages.length - 1)) return;
    const reordered = [...selectedJourney.stages];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    reorderStageMutation.mutate(reordered.map((stage) => stage.id));
  };

  const exportJourney = (format: "json" | "csv") => {
    if (!selectedJourney) return;
    let content = "";
    let fileName = `${selectedJourney.name.toLowerCase().replace(/\s+/g, "-")}-journey.${format}`;
    let type = "application/json";

    if (format === "json") {
      content = JSON.stringify(selectedJourney, null, 2);
    } else {
      type = "text/csv";
      const rows = [
        ["Journey", "Stage", "Touchpoint", "Channel", "Dropoff", "Conversion Rate", "Engagement Rate", "Bounce Rate", "Sentiment"],
        ...selectedJourney.stages.flatMap((stage) =>
          stage.touchpoints.map((touchpoint) => [
            selectedJourney.name,
            stage.name,
            touchpoint.name,
            touchpoint.channel,
            String(touchpoint.dropoff),
            String(touchpoint.metrics.conversionRate ?? ""),
            String(touchpoint.metrics.engagementRate ?? ""),
            String(touchpoint.metrics.bounceRate ?? ""),
            touchpoint.sentiment,
          ])
        ),
      ];
      content = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Journey exported", description: `${selectedJourney.name} was exported as ${format.toUpperCase()}.` });
  };

  const shareJourney = async () => {
    if (!selectedJourney) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?journey=${selectedJourney.id}`;
    if (navigator.share) {
      await navigator.share({
        title: selectedJourney.name,
        text: selectedJourney.description,
        url: shareUrl,
      });
      toast({ title: "Journey shared", description: "Share sheet opened successfully." });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied", description: "Journey link copied to clipboard." });
  };

  const analyticsSummary = useMemo(() => {
    if (!selectedTouchpoint || !selectedStage || !selectedJourney) return null;
    const stageAverageDropoff = selectedStage.touchpoints.length
      ? selectedStage.touchpoints.reduce((sum, touchpoint) => sum + touchpoint.dropoff, 0) / selectedStage.touchpoints.length
      : 0;
    const allTouchpoints = selectedJourney.stages.flatMap((stage) => stage.touchpoints);
    const channelTouchpoints = allTouchpoints.filter((touchpoint) => touchpoint.channel === selectedTouchpoint.channel);
    const channelAverageDropoff = channelTouchpoints.length
      ? channelTouchpoints.reduce((sum, touchpoint) => sum + touchpoint.dropoff, 0) / channelTouchpoints.length
      : selectedTouchpoint.dropoff;
    const healthScore = Math.max(
      0,
      Math.min(
        100,
        100 -
          selectedTouchpoint.dropoff * 0.5 +
          (selectedTouchpoint.metrics.conversionRate ?? 0) * 0.6 +
          (selectedTouchpoint.metrics.engagementRate ?? 0) * 0.2 -
          (selectedTouchpoint.metrics.bounceRate ?? 0) * 0.2
      )
    );
    return { stageAverageDropoff, channelAverageDropoff, healthScore };
  }, [selectedTouchpoint, selectedStage, selectedJourney]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Customer Journey Mapping</h2>
          <p className="text-muted-foreground">Visualize and analyze customer experiences across all touchpoints</p>
        </div>
        <Dialog open={createJourneyOpen} onOpenChange={setCreateJourneyOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Journey Map
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Customer Journey Map</DialogTitle>
              <DialogDescription>Create a new journey map and attach it to a real customer segment.</DialogDescription>
            </DialogHeader>
            <Form {...journeyForm}>
              <form onSubmit={journeyForm.handleSubmit((values) => createJourneyMutation.mutate(values))} className="space-y-6">
                <FormField control={journeyForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Journey Name</FormLabel><FormControl><Input placeholder="New Customer Acquisition" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={journeyForm.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe the customer journey you want to map..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={journeyForm.control} name="segment" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Segment</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select customer segment" /></SelectTrigger></FormControl>
                      <SelectContent>{segments.map((segment) => <SelectItem key={segment.id} value={segment.id}>{segment.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormDescription>The customer segment this journey map applies to</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter><Button type="submit" disabled={createJourneyMutation.isPending}>Create Journey Map</Button></DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {journeys.length > 0 && (
        <div className="flex gap-4 items-center flex-wrap">
          <Select value={selectedJourneyId} onValueChange={(value) => {
            const journey = journeys.find((item) => item.id === value);
            setSelectedJourneyId(value);
            setSelectedStageId(journey?.stages[0]?.id || "");
            setSelectedTouchpointId("");
          }}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select journey map" /></SelectTrigger>
            <SelectContent>{journeys.map((journey) => <SelectItem key={journey.id} value={journey.id}>{journey.name}</SelectItem>)}</SelectContent>
          </Select>
          {selectedJourney && (
            <>
              <Dialog open={editJourneyOpen} onOpenChange={setEditJourneyOpen}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-2" />Edit Journey</Button></DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader><DialogTitle>Edit Journey</DialogTitle><DialogDescription>Update the journey name, description, or segment.</DialogDescription></DialogHeader>
                  <Form {...journeyForm}>
                    <form onSubmit={journeyForm.handleSubmit((values) => updateJourneyMutation.mutate(values))} className="space-y-6">
                      <FormField control={journeyForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Journey Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={journeyForm.control} name="description" render={({ field }) => <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={journeyForm.control} name="segment" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Segment</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select customer segment" /></SelectTrigger></FormControl>
                            <SelectContent>{segments.map((segment) => <SelectItem key={segment.id} value={segment.id}>{segment.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <DialogFooter><Button type="submit" disabled={updateJourneyMutation.isPending}>Save Journey</Button></DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              <Button variant="outline" size="sm" onClick={() => exportJourney("json")}><Download className="h-4 w-4 mr-2" />Export JSON</Button>
              <Button variant="outline" size="sm" onClick={() => exportJourney("csv")}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
              <Button variant="outline" size="sm" onClick={() => shareJourney().catch((error) => toast({ title: "Failed to share journey", description: error.message, variant: "destructive" }))}><Share className="h-4 w-4 mr-2" />Share</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteJourneyMutation.mutate(selectedJourney.id)} disabled={deleteJourneyMutation.isPending}><Trash2 className="h-4 w-4 mr-2" />Remove Journey</Button>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Loading customer journeys...</CardContent></Card>
      ) : !journeys.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium">No customer journeys yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create your first journey map to track how a segment moves from first touch to retention.</p>
          </CardContent>
        </Card>
      ) : selectedJourney && selectedStage ? (
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">{selectedJourney.name}</CardTitle>
                  <CardDescription className="mt-1">{selectedJourney.description}</CardDescription>
                </div>
                <Badge>{selectedJourney.segmentName}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="relative mb-8">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2" />
                <div className="relative flex justify-between gap-4">
                  {selectedJourney.stages.map((stage, index) => (
                    <div key={stage.id} className="flex flex-col items-center flex-1">
                      <div className={`z-10 flex flex-col items-center justify-center w-14 h-14 rounded-full ${selectedStage.id === stage.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"} cursor-pointer transition-colors duration-200`} onClick={() => { setSelectedStageId(stage.id); setSelectedTouchpointId(""); }}>
                        {getStageIcon(stage.name)}
                        <div className="text-[10px] font-medium mt-0.5 max-w-[40px] text-center truncate">{stage.name}</div>
                      </div>
                      {index < selectedJourney.stages.length - 1 && <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: "50%", transform: "translateY(-50%)" }}><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>}
                      <div className="mt-2 text-xs"><span className="font-medium">{stage.conversionRate.toFixed(1)}%</span><span className="text-muted-foreground"> conversion</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">{getStageIcon(selectedStage.name)}<span>{selectedStage.name} Stage</span></CardTitle>
                      <CardDescription className="mt-1">{selectedStage.description}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Duration</div>
                      <div className="font-medium">{selectedStage.duration}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
                      <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" />Add Stage</Button></DialogTrigger>
                      <DialogContent className="sm:max-w-[560px]">
                        <DialogHeader><DialogTitle>Add Stage</DialogTitle><DialogDescription>Add a new stage to the selected journey.</DialogDescription></DialogHeader>
                        <Form {...stageForm}>
                          <form onSubmit={stageForm.handleSubmit((values) => addStageMutation.mutate(values))} className="space-y-6">
                            <FormField control={stageForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Stage Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                            <FormField control={stageForm.control} name="description" render={({ field }) => <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField control={stageForm.control} name="duration" render={({ field }) => <FormItem><FormLabel>Duration</FormLabel><FormControl><Input placeholder="e.g. 2 days average" {...field} /></FormControl><FormMessage /></FormItem>} />
                              <FormField control={stageForm.control} name="conversionRate" render={({ field }) => <FormItem><FormLabel>Conversion Rate (%)</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
                            </div>
                            <FormField control={stageForm.control} name="painPoints" render={({ field }) => <FormItem><FormLabel>Pain Points</FormLabel><FormControl><Textarea placeholder="One item per line" {...field} /></FormControl><FormMessage /></FormItem>} />
                            <FormField control={stageForm.control} name="opportunities" render={({ field }) => <FormItem><FormLabel>Opportunities</FormLabel><FormControl><Textarea placeholder="One item per line" {...field} /></FormControl><FormMessage /></FormItem>} />
                            <DialogFooter><Button type="submit" disabled={addStageMutation.isPending}>Add Stage</Button></DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={editStageOpen} onOpenChange={setEditStageOpen}>
                      <DialogTrigger asChild><Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-2" />Edit Stage</Button></DialogTrigger>
                      <DialogContent className="sm:max-w-[560px]">
                        <DialogHeader><DialogTitle>Edit Stage</DialogTitle><DialogDescription>Update the selected stage details.</DialogDescription></DialogHeader>
                        <Form {...stageForm}>
                          <form onSubmit={stageForm.handleSubmit((values) => updateStageMutation.mutate(values))} className="space-y-6">
                            <FormField control={stageForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Stage Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                            <FormField control={stageForm.control} name="description" render={({ field }) => <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField control={stageForm.control} name="duration" render={({ field }) => <FormItem><FormLabel>Duration</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                              <FormField control={stageForm.control} name="conversionRate" render={({ field }) => <FormItem><FormLabel>Conversion Rate (%)</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
                            </div>
                            <FormField control={stageForm.control} name="painPoints" render={({ field }) => <FormItem><FormLabel>Pain Points</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                            <FormField control={stageForm.control} name="opportunities" render={({ field }) => <FormItem><FormLabel>Opportunities</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                            <DialogFooter><Button type="submit" disabled={updateStageMutation.isPending}>Save Stage</Button></DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                    <Button variant="outline" size="sm" onClick={() => moveStage("up")} disabled={reorderStageMutation.isPending || selectedJourney.stages[0]?.id === selectedStage.id}><ArrowUp className="h-4 w-4 mr-2" />Move Up</Button>
                    <Button variant="outline" size="sm" onClick={() => moveStage("down")} disabled={reorderStageMutation.isPending || selectedJourney.stages[selectedJourney.stages.length - 1]?.id === selectedStage.id}><ArrowDown className="h-4 w-4 mr-2" />Move Down</Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteStageMutation.mutate(selectedStage.id)} disabled={deleteStageMutation.isPending || selectedJourney.stages.length <= 1}><Trash2 className="h-4 w-4 mr-2" />Remove Stage</Button>
                  </div>

                  <h3 className="font-medium mb-3 flex items-center justify-between">
                    <span>Touchpoints</span>
                    <div className="flex gap-2">
                      <Dialog open={addTouchpointOpen} onOpenChange={setAddTouchpointOpen}>
                        <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" />Add Touchpoint</Button></DialogTrigger>
                        <DialogContent className="sm:max-w-[560px]">
                          <DialogHeader><DialogTitle>Add Touchpoint</DialogTitle><DialogDescription>Add a touchpoint to the selected stage.</DialogDescription></DialogHeader>
                          <Form {...touchpointForm}>
                            <form onSubmit={touchpointForm.handleSubmit((values) => addTouchpointMutation.mutate(values))} className="space-y-6">
                              <FormField control={touchpointForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField control={touchpointForm.control} name="channel" render={({ field }) => (
                                  <FormItem><FormLabel>Channel</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger></FormControl><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="social">Social Media</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="app">Mobile App</SelectItem><SelectItem value="in-store">In-Store</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                )} />
                                <FormField control={touchpointForm.control} name="sentiment" render={({ field }) => (
                                  <FormItem><FormLabel>Sentiment</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select sentiment" /></SelectTrigger></FormControl><SelectContent><SelectItem value="positive">Positive</SelectItem><SelectItem value="neutral">Neutral</SelectItem><SelectItem value="negative">Negative</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                )} />
                              </div>
                              <FormField control={touchpointForm.control} name="description" render={({ field }) => <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField control={touchpointForm.control} name="dropoff" render={({ field }) => <FormItem><FormLabel>Dropoff (%)</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
                                <FormField control={touchpointForm.control} name="responseTime" render={({ field }) => <FormItem><FormLabel>Response Time</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>} />
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <FormField control={touchpointForm.control} name="engagementRate" render={({ field }) => <FormItem><FormLabel>Engagement %</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                                <FormField control={touchpointForm.control} name="conversionRate" render={({ field }) => <FormItem><FormLabel>Conversion %</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                                <FormField control={touchpointForm.control} name="bounceRate" render={({ field }) => <FormItem><FormLabel>Bounce %</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                              </div>
                              <DialogFooter><Button type="submit" disabled={addTouchpointMutation.isPending}>Add Touchpoint</Button></DialogFooter>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>

                      {selectedTouchpoint && (
                        <Dialog open={editTouchpointOpen} onOpenChange={setEditTouchpointOpen}>
                          <DialogTrigger asChild><Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-2" />Edit Touchpoint</Button></DialogTrigger>
                          <DialogContent className="sm:max-w-[560px]">
                            <DialogHeader><DialogTitle>Edit Touchpoint</DialogTitle><DialogDescription>Update the selected touchpoint details.</DialogDescription></DialogHeader>
                            <Form {...touchpointForm}>
                              <form onSubmit={touchpointForm.handleSubmit((values) => updateTouchpointMutation.mutate(values))} className="space-y-6">
                                <FormField control={touchpointForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField control={touchpointForm.control} name="channel" render={({ field }) => (
                                    <FormItem><FormLabel>Channel</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger></FormControl><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="social">Social Media</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="app">Mobile App</SelectItem><SelectItem value="in-store">In-Store</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                  )} />
                                  <FormField control={touchpointForm.control} name="sentiment" render={({ field }) => (
                                    <FormItem><FormLabel>Sentiment</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select sentiment" /></SelectTrigger></FormControl><SelectContent><SelectItem value="positive">Positive</SelectItem><SelectItem value="neutral">Neutral</SelectItem><SelectItem value="negative">Negative</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                  )} />
                                </div>
                                <FormField control={touchpointForm.control} name="description" render={({ field }) => <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField control={touchpointForm.control} name="dropoff" render={({ field }) => <FormItem><FormLabel>Dropoff (%)</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
                                  <FormField control={touchpointForm.control} name="responseTime" render={({ field }) => <FormItem><FormLabel>Response Time</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>} />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                  <FormField control={touchpointForm.control} name="engagementRate" render={({ field }) => <FormItem><FormLabel>Engagement %</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                                  <FormField control={touchpointForm.control} name="conversionRate" render={({ field }) => <FormItem><FormLabel>Conversion %</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                                  <FormField control={touchpointForm.control} name="bounceRate" render={({ field }) => <FormItem><FormLabel>Bounce %</FormLabel><FormControl><Input type="number" min="0" max="100" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                                </div>
                                <DialogFooter><Button type="submit" disabled={updateTouchpointMutation.isPending}>Save Touchpoint</Button></DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </h3>

                  {selectedStage.touchpoints.length ? (
                    selectedStage.touchpoints.map((touchpoint) => (
                      <div key={touchpoint.id} className={`mb-3 p-4 border rounded-lg flex cursor-pointer transition-colors ${selectedTouchpoint?.id === touchpoint.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => setSelectedTouchpointId(touchpoint.id)}>
                        <div className="mr-4 flex flex-col items-center justify-center">
                          <div className={`p-2 rounded-full ${touchpoint.channel === "email" ? "bg-blue-100" : touchpoint.channel === "website" ? "bg-purple-100" : "bg-pink-100"}`}>{getChannelIcon(touchpoint.channel)}</div>
                          <div className={`mt-2 w-3 h-3 rounded-full ${sentimentColor(touchpoint.sentiment)}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div><div className="font-medium">{touchpoint.name}</div><div className="text-sm text-muted-foreground">{touchpoint.description}</div></div>
                            <ChannelTag channel={touchpoint.channel} />
                          </div>
                          <div className="flex mt-2 gap-6 text-sm flex-wrap">
                            <div><span className="text-muted-foreground">Dropoff:</span> <span className="font-medium">{touchpoint.dropoff}%</span></div>
                            {touchpoint.metrics.conversionRate !== undefined && <div><span className="text-muted-foreground">Conv. Rate:</span> <span className="font-medium">{touchpoint.metrics.conversionRate}%</span></div>}
                            {touchpoint.metrics.engagementRate !== undefined && <div><span className="text-muted-foreground">Engagement:</span> <span className="font-medium">{touchpoint.metrics.engagementRate}%</span></div>}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No touchpoints have been added to this stage yet.</div>
                  )}
                </CardContent>
              </Card>

              {selectedTouchpoint && analyticsSummary && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Touchpoint Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2"><h3 className="text-lg font-medium">{selectedTouchpoint.name}</h3><ChannelTag channel={selectedTouchpoint.channel} /></div>
                          <p className="text-muted-foreground">{selectedTouchpoint.description}</p>
                        </div>
                        <div className="flex items-center gap-2"><span>Customer Sentiment:</span><div className={`w-4 h-4 rounded-full ${sentimentColor(selectedTouchpoint.sentiment)}`} /><span className="capitalize">{selectedTouchpoint.sentiment}</span></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Dropoff Rate</div><div className="text-2xl font-bold">{selectedTouchpoint.dropoff}%</div><div className="text-xs text-muted-foreground mt-1">Users who abandon at this point</div></CardContent></Card>
                        {selectedTouchpoint.metrics.conversionRate !== undefined && <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Conversion Rate</div><div className="text-2xl font-bold">{selectedTouchpoint.metrics.conversionRate}%</div><div className="text-xs text-muted-foreground mt-1">Users who complete the desired action</div></CardContent></Card>}
                        {selectedTouchpoint.metrics.engagementRate !== undefined && <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Engagement Rate</div><div className="text-2xl font-bold">{selectedTouchpoint.metrics.engagementRate}%</div><div className="text-xs text-muted-foreground mt-1">Users who interact with this content</div></CardContent></Card>}
                        {selectedTouchpoint.metrics.bounceRate !== undefined && <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Bounce Rate</div><div className="text-2xl font-bold">{selectedTouchpoint.metrics.bounceRate}%</div><div className="text-xs text-muted-foreground mt-1">Users who leave without further action</div></CardContent></Card>}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t pt-4">
                    <div className="flex justify-between w-full">
                      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
                        <DialogTrigger asChild><Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-2" />View Analytics</Button></DialogTrigger>
                        <DialogContent className="sm:max-w-[700px]">
                          <DialogHeader><DialogTitle>Touchpoint Analytics</DialogTitle><DialogDescription>Derived from the live journey map data stored for this touchpoint.</DialogDescription></DialogHeader>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Health Score</div><div className="text-2xl font-bold">{analyticsSummary.healthScore.toFixed(0)}</div><div className="text-xs text-muted-foreground mt-1">Composite quality indicator</div></CardContent></Card>
                            <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Touchpoint Dropoff</div><div className="text-2xl font-bold">{selectedTouchpoint.dropoff}%</div><div className="text-xs text-muted-foreground mt-1">Current touchpoint dropoff</div></CardContent></Card>
                            <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Stage Avg. Dropoff</div><div className="text-2xl font-bold">{analyticsSummary.stageAverageDropoff.toFixed(1)}%</div><div className="text-xs text-muted-foreground mt-1">Across this stage</div></CardContent></Card>
                            <Card className="bg-muted/40"><CardContent className="p-4"><div className="text-sm text-muted-foreground">Channel Avg. Dropoff</div><div className="text-2xl font-bold">{analyticsSummary.channelAverageDropoff.toFixed(1)}%</div><div className="text-xs text-muted-foreground mt-1">Across {selectedTouchpoint.channel} touchpoints</div></CardContent></Card>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Interpretation</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>This touchpoint is {selectedTouchpoint.dropoff > analyticsSummary.stageAverageDropoff ? "underperforming" : "performing at or above"} the stage average for dropoff.</p><p>Channel benchmark suggests {selectedTouchpoint.dropoff > analyticsSummary.channelAverageDropoff ? "channel-specific friction" : "the issue is localized to this touchpoint"}.</p><p>Use health score to compare this touchpoint against others in the same journey.</p></CardContent></Card>
                            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Action Priorities</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>1. Reduce friction where dropoff is above stage average.</p><p>2. Improve message relevance if sentiment is neutral or negative.</p><p>3. Raise conversion and engagement before adding more traffic.</p></CardContent></Card>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditTouchpointOpen(true)}><Edit className="h-4 w-4 mr-2" />Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteTouchpointMutation.mutate(selectedTouchpoint.id)} disabled={deleteTouchpointMutation.isPending}><Trash2 className="h-4 w-4 mr-2" />Remove</Button>
                      </div>
                    </div>
                  </CardFooter>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center space-y-2">
                    {selectedJourney.stages.map((stage, index) => (
                      <div key={stage.id} className="w-full" style={{ opacity: stage.id === selectedStage.id ? 1 : 0.7 }}>
                        <div className="flex justify-between text-sm mb-1"><span className="font-medium">{stage.name}</span><span>{stageRetention(stage).toFixed(1)}%</span></div>
                        <div className="bg-primary/20 h-8 flex items-center justify-center font-medium rounded-sm" style={{ width: `${Math.max(30, 100 - index * 15)}%`, backgroundColor: stage.id === selectedStage.id ? "rgba(var(--primary), 0.2)" : "rgba(var(--muted), 0.2)" }}>{stage.conversionRate.toFixed(1)}%</div>
                        {index < selectedJourney.stages.length - 1 && <div className="flex justify-center my-1"><ChevronDown className="h-4 w-4 text-muted-foreground" /></div>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Pain Points</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {selectedStage.painPoints.map((point, index) => <li key={index} className="flex items-start gap-2"><Info className="h-4 w-4 text-amber-500 mt-0.5" /><span>{point}</span></li>)}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Opportunities</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {selectedStage.opportunities.map((opportunity, index) => <li key={index} className="flex items-start gap-2"><ChevronRight className="h-4 w-4 text-green-500 mt-0.5" /><span>{opportunity}</span></li>)}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Channel Distribution</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48 flex items-center justify-center">
                    <MultiColorCircularProgress segments={channelSegments.length ? channelSegments : [{ value: 100, color: PROGRESS_COLORS.average, label: "No Data" }]} size={160} />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3 mt-4">
                    {channelSegments.length ? channelSegments.map((segment) => (
                      <div key={segment.label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="text-xs">{segment.label.charAt(0).toUpperCase() + segment.label.slice(1)} ({segment.value}%)</span>
                      </div>
                    )) : <span className="text-xs text-muted-foreground">No channel distribution data available</span>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
