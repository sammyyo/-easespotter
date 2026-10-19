import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell,
  Copy,
  Edit,
  Eye,
  FileText,
  Globe,
  LayoutGrid,
  Mail,
  Plus,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";

type PersonalizationTarget = "email" | "website" | "app" | "notification";
type PersonalizationStatus = "active" | "draft" | "paused";

interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  count: number;
}

interface Variation {
  id: string;
  ruleId: string;
  name: string;
  content: string;
  impressions: number;
  conversions: number;
}

interface PersonalizationTemplate {
  id: string;
  name: string;
  description: string;
  target: PersonalizationTarget;
  structure: string;
  thumbnail?: string | null;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface PersonalizationRule {
  id: string;
  vendorId: number;
  name: string;
  description: string;
  audience: string;
  status: PersonalizationStatus;
  target: PersonalizationTarget;
  priority: number;
  startDate?: string | null;
  endDate?: string | null;
  conditions: {
    segment?: string;
    behavior?: string;
    device?: string;
    location?: string;
    time?: string;
  };
  segmentId: string | null;
  segmentName: string;
  templateId: string | null;
  templateName: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  variations: Variation[];
}

const ruleSchema = z.object({
  name: z.string().min(3, "Rule name must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  audience: z.string().min(1, "Audience is required"),
  target: z.enum(["email", "website", "app", "notification"]),
  templateId: z.string().optional(),
  segmentId: z.string().optional(),
  status: z.enum(["active", "draft", "paused"]),
  priority: z.number().int().min(1).max(1000),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  conditions: z.object({
    segment: z.string().optional(),
    behavior: z.string().optional(),
    device: z.string().optional(),
    location: z.string().optional(),
    time: z.string().optional(),
  }).refine((value) => Object.values(value).some(Boolean), {
    message: "At least one condition is required",
  }),
});

const templateSchema = z.object({
  name: z.string().min(2, "Template name is required"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  target: z.enum(["email", "website", "app", "notification"]),
  structure: z.string().min(3, "Template structure is required"),
  tags: z.string().optional(),
});

const variationSchema = z.object({
  name: z.string().min(1, "Variation name is required"),
  content: z.string().min(1, "Variation content is required"),
});

type RuleFormValues = z.infer<typeof ruleSchema>;
type TemplateFormValues = z.infer<typeof templateSchema>;
type VariationFormValues = z.infer<typeof variationSchema>;

function getTargetIcon(target: PersonalizationTarget) {
  switch (target) {
    case "email":
      return <Mail className="h-4 w-4" />;
    case "app":
      return <Smartphone className="h-4 w-4" />;
    case "notification":
      return <Bell className="h-4 w-4" />;
    default:
      return <Globe className="h-4 w-4" />;
  }
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function PersonalizationEngine() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("rules");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [variationDialogOpen, setVariationDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PersonalizationRule | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PersonalizationTemplate | null>(null);
  const [editingVariation, setEditingVariation] = useState<Variation | null>(null);

  const ruleForm = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: "",
      description: "",
      audience: "",
      target: "website",
      templateId: "",
      segmentId: "",
      status: "draft",
      priority: 100,
      startDate: "",
      endDate: "",
      conditions: {
        segment: "",
        behavior: "",
        device: "",
        location: "",
        time: "",
      },
    },
  });

  const templateForm = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      target: "website",
      structure: "",
      tags: "",
    },
  });

  const variationForm = useForm<VariationFormValues>({
    resolver: zodResolver(variationSchema),
    defaultValues: {
      name: "",
      content: "",
    },
  });

  const [pendingVariations, setPendingVariations] = useState<VariationFormValues[]>([
    { name: "Variation A", content: "" },
  ]);

  const { data: segments = [] } = useQuery<CustomerSegment[]>({
    queryKey: ["/api/marketing/segments"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/segments");
      if (!response.ok) throw new Error("Failed to fetch customer segments");
      return response.json();
    },
    initialData: [],
  });

  const { data: templates = [] } = useQuery<PersonalizationTemplate[]>({
    queryKey: ["/api/marketing/personalization/templates"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/personalization/templates");
      if (!response.ok) throw new Error("Failed to fetch personalization templates");
      return response.json();
    },
    initialData: [],
  });

  const { data: rules = [] } = useQuery<PersonalizationRule[]>({
    queryKey: ["/api/marketing/personalization/rules"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/personalization/rules");
      if (!response.ok) throw new Error("Failed to fetch personalization rules");
      return response.json();
    },
    initialData: [],
  });

  useEffect(() => {
    if (rules.length && !rules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(rules[0].id);
    }
    if (!rules.length) {
      setSelectedRuleId("");
    }
  }, [rules, selectedRuleId]);

  useEffect(() => {
    if (templates.length && !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
    if (!templates.length) {
      setSelectedTemplateId("");
    }
  }, [templates, selectedTemplateId]);

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) || null;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;
  const selectedRuleConversionRate = selectedRule
    ? selectedRule.variations.reduce((sum, variation) => sum + variation.impressions, 0) > 0
      ? (selectedRule.variations.reduce((sum, variation) => sum + variation.conversions, 0) /
          selectedRule.variations.reduce((sum, variation) => sum + variation.impressions, 0)) *
        100
      : 0
    : 0;

  const filteredRules = rules.filter((rule) => {
    const matchesSearch =
      !searchTerm.trim() ||
      `${rule.name} ${rule.audience} ${rule.templateName}`.toLowerCase().includes(searchTerm.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || rule.status === statusFilter;
    const matchesTarget = targetFilter === "all" || rule.target === targetFilter;
    return matchesSearch && matchesStatus && matchesTarget;
  });

  const totalImpressions = rules.reduce(
    (sum, rule) => sum + rule.variations.reduce((variationSum, variation) => variationSum + variation.impressions, 0),
    0
  );
  const totalConversions = rules.reduce(
    (sum, rule) => sum + rule.variations.reduce((variationSum, variation) => variationSum + variation.conversions, 0),
    0
  );
  const globalConversionRate = totalImpressions ? (totalConversions / totalImpressions) * 100 : 0;

  const invalidatePersonalization = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/marketing/personalization/rules"] });
    queryClient.invalidateQueries({ queryKey: ["/api/marketing/personalization/templates"] });
  };

  const templateMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      const payload = {
        ...values,
        tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
      };
      const url = editingTemplate
        ? `/api/marketing/personalization/templates/${editingTemplate.id}`
        : "/api/marketing/personalization/templates";
      const method = editingTemplate ? "PATCH" : "POST";
      const response = await apiRequest(method, url, payload);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to save template");
      return data;
    },
    onSuccess: (template) => {
      invalidatePersonalization();
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      templateForm.reset();
      setSelectedTemplateId(template.id);
      toast({ title: "Template saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save template", description: error.message, variant: "destructive" });
    },
  });

  const ruleMutation = useMutation({
    mutationFn: async (values: RuleFormValues) => {
      const payload = {
        ...values,
      templateId: values.templateId ? Number(values.templateId) : null,
      segmentId: values.segmentId ? Number(values.segmentId) : null,
      priority: values.priority,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      variations: editingRule ? undefined : pendingVariations.filter((variation) => variation.name && variation.content),
      };
      const url = editingRule
        ? `/api/marketing/personalization/rules/${editingRule.id}`
        : "/api/marketing/personalization/rules";
      const method = editingRule ? "PATCH" : "POST";
      const response = await apiRequest(method, url, payload);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to save rule");
      return data;
    },
    onSuccess: (rule) => {
      invalidatePersonalization();
      setRuleDialogOpen(false);
      setEditingRule(null);
      setPendingVariations([{ name: "Variation A", content: "" }]);
      ruleForm.reset();
      setSelectedRuleId(rule.id);
      toast({ title: "Rule saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save rule", description: error.message, variant: "destructive" });
    },
  });

  const variationMutation = useMutation({
    mutationFn: async (values: VariationFormValues) => {
      if (!selectedRule) throw new Error("Select a rule first");
      const url = editingVariation
        ? `/api/marketing/personalization/variations/${editingVariation.id}`
        : `/api/marketing/personalization/rules/${selectedRule.id}/variations`;
      const method = editingVariation ? "PATCH" : "POST";
      const response = await apiRequest(method, url, values);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to save variation");
      return data;
    },
    onSuccess: (rule) => {
      invalidatePersonalization();
      setVariationDialogOpen(false);
      setEditingVariation(null);
      variationForm.reset();
      setSelectedRuleId(rule.id);
      toast({ title: "Variation saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save variation", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      const response = await apiRequest("DELETE", url);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Delete failed");
      return data;
    },
    onSuccess: () => {
      invalidatePersonalization();
      toast({ title: "Deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const trackMutation = useMutation({
    mutationFn: async ({ variationId, eventType }: { variationId: string; eventType: "impression" | "conversion" }) => {
      if (!selectedRule) throw new Error("Select a rule first");
      const response = await apiRequest("POST", `/api/marketing/personalization/rules/${selectedRule.id}/track`, {
        vendorId: selectedRule.vendorId,
        variationId: Number(variationId),
        eventType,
        visitorKey: `preview-${Date.now()}`,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Tracking failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/personalization/rules"] });
    },
  });

  const openCreateRule = () => {
    setEditingRule(null);
    setPendingVariations([{ name: "Variation A", content: "" }]);
    ruleForm.reset({
      name: "",
      description: "",
      audience: "",
      target: "website",
      templateId: "",
      segmentId: "",
      status: "draft",
      priority: 100,
      startDate: "",
      endDate: "",
      conditions: {
        segment: "",
        behavior: "",
        device: "",
        location: "",
        time: "",
      },
    });
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule: PersonalizationRule) => {
    setEditingRule(rule);
    ruleForm.reset({
      name: rule.name,
      description: rule.description,
      audience: rule.audience,
      target: rule.target,
      templateId: rule.templateId || "",
      segmentId: rule.segmentId || "",
      status: rule.status,
      priority: rule.priority,
      startDate: rule.startDate ? String(rule.startDate).slice(0, 10) : "",
      endDate: rule.endDate ? String(rule.endDate).slice(0, 10) : "",
      conditions: {
        segment: rule.conditions.segment || "",
        behavior: rule.conditions.behavior || "",
        device: rule.conditions.device || "",
        location: rule.conditions.location || "",
        time: rule.conditions.time || "",
      },
    });
    setRuleDialogOpen(true);
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    templateForm.reset({
      name: "",
      description: "",
      target: "website",
      structure: "",
      tags: "",
    });
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (template: PersonalizationTemplate) => {
    setEditingTemplate(template);
    templateForm.reset({
      name: template.name,
      description: template.description,
      target: template.target,
      structure: template.structure,
      tags: template.tags.join(", "),
    });
    setTemplateDialogOpen(true);
  };

  const openVariationDialog = (variation?: Variation) => {
    setEditingVariation(variation || null);
    variationForm.reset({
      name: variation?.name || "",
      content: variation?.content || "",
    });
    setVariationDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Personalization Engine</h2>
          <p className="text-muted-foreground">Live personalization rules, templates, and tracked performance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openCreateTemplate}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Create Template
          </Button>
          <Button onClick={openCreateRule}>
            <Plus className="mr-2 h-4 w-4" />
            Create Personalization Rule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rules</CardDescription>
            <CardTitle>{rules.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Active, draft, and paused personalization rules.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Impressions</CardDescription>
            <CardTitle>{totalImpressions.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Live tracked impressions across all variations.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conversion Rate</CardDescription>
            <CardTitle>{formatPercent(globalConversionRate)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Conversions divided by impressions across tracked rules.</CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Personalization Rules</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            <span>Content Templates</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span>Preview & Test</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-3">
          <Input placeholder="Search rules" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="max-w-sm" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={targetFilter} onValueChange={setTargetFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Targets</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="app">Mobile App</SelectItem>
              <SelectItem value="notification">Notifications</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="rules" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Rules</CardTitle>
                  <CardDescription>Select a rule to inspect live configuration and performance.</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {filteredRules.length ? (
                    filteredRules.map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        className={`flex w-full items-center justify-between px-6 py-3 text-left ${selectedRuleId === rule.id ? "bg-primary/10" : "hover:bg-muted"}`}
                        onClick={() => setSelectedRuleId(rule.id)}
                      >
                        <div>
                          <div className="flex items-center gap-2 font-medium">
                            {getTargetIcon(rule.target)}
                            <span>{rule.name}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{rule.audience}</div>
                        </div>
                        <Badge variant="outline">{rule.status}</Badge>
                      </button>
                    ))
                  ) : (
                    <div className="px-6 py-8 text-sm text-muted-foreground">No personalization rules match the current filters.</div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button variant="ghost" className="w-full" onClick={openCreateRule}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Rule
                  </Button>
                </CardFooter>
              </Card>
            </div>

            <div className="space-y-4 md:col-span-2">
              {selectedRule ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>{selectedRule.name}</CardTitle>
                        <CardDescription className="mt-1">{selectedRule.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{selectedRule.status}</Badge>
                        <Button variant="outline" size="sm" onClick={() => openEditRule(selectedRule)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Rule
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Audience</div>
                          <div className="font-semibold">{selectedRule.audience}</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Segment</div>
                          <div className="font-semibold">{selectedRule.segmentName}</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Impressions</div>
                          <div className="font-semibold">
                            {selectedRule.variations.reduce((sum, variation) => sum + variation.impressions, 0).toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Conversion Rate</div>
                          <div className="font-semibold">{formatPercent(selectedRuleConversionRate)}</div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="mb-3 text-sm font-medium">Rule Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Target</span><span className="font-medium capitalize">{selectedRule.target}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Template</span><span className="font-medium">{selectedRule.templateName}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className="font-medium">{selectedRule.priority}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span className="font-medium">{selectedRule.startDate ? new Date(selectedRule.startDate).toLocaleDateString() : "Immediate"}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">End</span><span className="font-medium">{selectedRule.endDate ? new Date(selectedRule.endDate).toLocaleDateString() : "No end date"}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span className="font-medium">{selectedRule.createdBy}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span className="font-medium">{selectedRule.updatedAt ? new Date(selectedRule.updatedAt).toLocaleDateString() : "N/A"}</span></div>
                        </div>
                        <h4 className="mb-3 mt-6 text-sm font-medium">Conditions</h4>
                        <div className="space-y-2">
                          {Object.entries(selectedRule.conditions).filter(([, value]) => value).length ? (
                            Object.entries(selectedRule.conditions).map(([key, value]) =>
                              value ? (
                                <div key={key} className="rounded-md border p-3 text-sm">
                                  <div className="text-xs capitalize text-muted-foreground">{key}</div>
                                  <div>{value}</div>
                                </div>
                              ) : null
                            )
                          ) : (
                            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No conditions stored.</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-sm font-medium">Variations</h4>
                          <Button size="sm" variant="outline" onClick={() => openVariationDialog()}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Variation
                          </Button>
                        </div>
                        <div className="space-y-4">
                          {selectedRule.variations.map((variation, index) => {
                            const rate = variation.impressions ? (variation.conversions / variation.impressions) * 100 : 0;
                            return (
                              <Card key={variation.id}>
                                <CardContent className="space-y-3 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <Badge variant="outline">Variation {index + 1}</Badge>
                                      <div className="mt-2 font-medium">{variation.name}</div>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="icon" onClick={() => openVariationDialog(variation)}>
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          deleteMutation.mutate({ url: `/api/marketing/personalization/variations/${variation.id}` })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="rounded-md bg-muted/40 p-3 text-sm">{variation.content}</div>
                                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                    <div className="flex gap-4">
                                      <span><span className="text-muted-foreground">Impressions:</span> {variation.impressions.toLocaleString()}</span>
                                      <span><span className="text-muted-foreground">Conversions:</span> {variation.conversions.toLocaleString()}</span>
                                    </div>
                                    <span className="font-medium">{formatPercent(rate)}</span>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap justify-between gap-2 border-t pt-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setActiveTab("preview")}>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        <FileText className="mr-2 h-4 w-4" />
                        View Report
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600"
                      onClick={() => deleteMutation.mutate({ url: `/api/marketing/personalization/rules/${selectedRule.id}` })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Rule
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">Select a personalization rule to inspect it.</CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="md:col-span-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Template Library</CardTitle>
                  <CardDescription>Stored content templates used by personalization rules.</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {templates.length ? (
                    templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`w-full px-6 py-3 text-left ${selectedTemplateId === template.id ? "bg-primary/10" : "hover:bg-muted"}`}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          {getTargetIcon(template.target)}
                          <span>{template.name}</span>
                        </div>
                        <div className="mt-1 text-xs capitalize text-muted-foreground">{template.target}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-6 py-8 text-sm text-muted-foreground">No templates created yet.</div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full" onClick={openCreateTemplate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Template
                  </Button>
                </CardFooter>
              </Card>
            </div>

            <div className="md:col-span-3">
              {selectedTemplate ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>{selectedTemplate.name}</CardTitle>
                        <CardDescription className="mt-1">{selectedTemplate.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditTemplate(selectedTemplate)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Template
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            templateMutation.mutate({
                              name: `${selectedTemplate.name} (Copy)`,
                              description: selectedTemplate.description,
                              target: selectedTemplate.target,
                              structure: selectedTemplate.structure,
                              tags: selectedTemplate.tags.join(", "),
                            })
                          }
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Target</div>
                          <div className="font-semibold capitalize">{selectedTemplate.target}</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Rules Using Template</div>
                          <div className="font-semibold">{rules.filter((rule) => rule.templateId === selectedTemplate.id).length}</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-muted/40">
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Tags</div>
                          <div className="font-semibold">{selectedTemplate.tags.length || 0}</div>
                        </CardContent>
                      </Card>
                    </div>

                    <div>
                      <h4 className="mb-3 text-sm font-medium">Structure</h4>
                      <pre className="overflow-x-auto rounded-md border bg-muted/30 p-4 text-xs">{selectedTemplate.structure}</pre>
                    </div>

                    <div>
                      <h4 className="mb-3 text-sm font-medium">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplate.tags.length ? (
                          selectedTemplate.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)
                        ) : (
                          <div className="text-sm text-muted-foreground">No tags added.</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="justify-between border-t pt-4">
                    <Button variant="outline" onClick={() => {
                      ruleForm.reset({
                        name: "",
                        description: "",
                        audience: "",
                        target: selectedTemplate.target,
                        templateId: selectedTemplate.id,
                        segmentId: "",
                        status: "draft",
                        priority: 100,
                        startDate: "",
                        endDate: "",
                        conditions: {
                          segment: "",
                          behavior: "",
                          device: "",
                          location: "",
                          time: "",
                        },
                      });
                      setEditingRule(null);
                      setPendingVariations([{ name: "Variation A", content: "" }]);
                      setActiveTab("rules");
                      setRuleDialogOpen(true);
                    }}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Use In Rule
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-600"
                      onClick={() => deleteMutation.mutate({ url: `/api/marketing/personalization/templates/${selectedTemplate.id}` })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Template
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">Select a template to inspect it.</CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          {selectedRule ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Live Preview Context</CardTitle>
                  <CardDescription>Current rule, template, and segment context using stored data.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border p-4">
                    <div className="text-sm text-muted-foreground">Rule</div>
                    <div className="font-medium">{selectedRule.name}</div>
                  </div>
                  <div className="rounded-md border p-4">
                    <div className="text-sm text-muted-foreground">Template</div>
                    <div className="font-medium">{selectedRule.templateName}</div>
                  </div>
                  <div className="rounded-md border p-4">
                    <div className="text-sm text-muted-foreground">Segment</div>
                    <div className="font-medium">{selectedRule.segmentName}</div>
                  </div>
                  <div className="rounded-md border p-4">
                    <div className="text-sm text-muted-foreground">Target</div>
                    <div className="font-medium capitalize">{selectedRule.target}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Track Test Events</CardTitle>
                  <CardDescription>Use these controls to record real impressions and conversions against a variation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRule.variations.map((variation) => (
                    <div key={variation.id} className="rounded-md border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{variation.name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{variation.content}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => trackMutation.mutate({ variationId: variation.id, eventType: "impression" })}>
                            Record Impression
                          </Button>
                          <Button size="sm" onClick={() => trackMutation.mutate({ variationId: variation.id, eventType: "conversion" })}>
                            Record Conversion
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-4 text-sm">
                        <span><span className="text-muted-foreground">Impressions:</span> {variation.impressions.toLocaleString()}</span>
                        <span><span className="text-muted-foreground">Conversions:</span> {variation.conversions.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Select a rule in the Rules tab to preview and test it.</CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Personalization Rule" : "Create Personalization Rule"}</DialogTitle>
            <DialogDescription>Store a real rule configuration backed by the database.</DialogDescription>
          </DialogHeader>
          <Form {...ruleForm}>
            <form onSubmit={ruleForm.handleSubmit((values) => ruleMutation.mutate(values))} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField control={ruleForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Rule Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="audience" render={({ field }) => (
                  <FormItem><FormLabel>Audience</FormLabel><FormControl><Input {...field} placeholder="Returning Customers" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={ruleForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <FormField control={ruleForm.control} name="target" render={({ field }) => (
                  <FormItem><FormLabel>Target</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="website">Website</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="app">Mobile App</SelectItem><SelectItem value="notification">Notification</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="status" render={({ field }) => (
                  <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="segmentId" render={({ field }) => (
                  <FormItem><FormLabel>Segment</FormLabel><Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}><FormControl><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">No segment</SelectItem>{segments.map((segment) => <SelectItem key={segment.id} value={segment.id}>{segment.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="templateId" render={({ field }) => (
                  <FormItem><FormLabel>Template</FormLabel><Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}><FormControl><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">No template</SelectItem>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField control={ruleForm.control} name="priority" render={({ field }) => (
                  <FormItem><FormLabel>Priority</FormLabel><FormControl><Input type="number" min={1} max={1000} value={field.value} onChange={(event) => field.onChange(Number(event.target.value || 100))} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="endDate" render={({ field }) => (
                  <FormItem><FormLabel>End Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField control={ruleForm.control} name="conditions.segment" render={({ field }) => (
                  <FormItem><FormLabel>Condition Segment</FormLabel><FormControl><Input {...field} placeholder="High-Value Customers" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="conditions.behavior" render={({ field }) => (
                  <FormItem><FormLabel>Behavior</FormLabel><FormControl><Input {...field} placeholder="Cart Abandoned" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="conditions.device" render={({ field }) => (
                  <FormItem><FormLabel>Device</FormLabel><FormControl><Input {...field} placeholder="Mobile" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ruleForm.control} name="conditions.location" render={({ field }) => (
                  <FormItem><FormLabel>Location</FormLabel><FormControl><Input {...field} placeholder="United States" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={ruleForm.control} name="conditions.time" render={({ field }) => (
                <FormItem><FormLabel>Time</FormLabel><FormControl><Input {...field} placeholder="3 Hours After Abandonment" /></FormControl><FormMessage /></FormItem>
              )} />
              {!editingRule ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Initial Variations</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingVariations((current) => [...current, { name: `Variation ${String.fromCharCode(65 + current.length)}`, content: "" }])}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Variation
                    </Button>
                  </div>
                  {pendingVariations.map((variation, index) => (
                    <div key={`${variation.name}-${index}`} className="grid grid-cols-1 gap-3 rounded-md border p-3">
                      <Input
                        value={variation.name}
                        onChange={(event) => {
                          const next = [...pendingVariations];
                          next[index] = { ...next[index], name: event.target.value };
                          setPendingVariations(next);
                        }}
                        placeholder="Variation name"
                      />
                      <Textarea
                        value={variation.content}
                        onChange={(event) => {
                          const next = [...pendingVariations];
                          next[index] = { ...next[index], content: event.target.value };
                          setPendingVariations(next);
                        }}
                        placeholder="Variation content"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={ruleMutation.isPending}>{editingRule ? "Update Rule" : "Create Rule"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>Store a reusable content template for personalization rules.</DialogDescription>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit((values) => templateMutation.mutate(values))} className="space-y-4">
              <FormField control={templateForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={templateForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={templateForm.control} name="target" render={({ field }) => (
                <FormItem><FormLabel>Target</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="website">Website</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="app">Mobile App</SelectItem><SelectItem value="notification">Notification</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={templateForm.control} name="structure" render={({ field }) => (
                <FormItem><FormLabel>Structure</FormLabel><FormControl><Textarea {...field} className="min-h-[140px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={templateForm.control} name="tags" render={({ field }) => (
                <FormItem><FormLabel>Tags</FormLabel><FormControl><Input {...field} placeholder="homepage, hero, banner" /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={templateMutation.isPending}>{editingTemplate ? "Update Template" : "Create Template"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={variationDialogOpen} onOpenChange={setVariationDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingVariation ? "Edit Variation" : "Create Variation"}</DialogTitle>
            <DialogDescription>Store live variation content under the selected personalization rule.</DialogDescription>
          </DialogHeader>
          <Form {...variationForm}>
            <form onSubmit={variationForm.handleSubmit((values) => variationMutation.mutate(values))} className="space-y-4">
              <FormField control={variationForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={variationForm.control} name="content" render={({ field }) => (
                <FormItem><FormLabel>Content</FormLabel><FormControl><Textarea {...field} className="min-h-[140px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={variationMutation.isPending || !selectedRule}>{editingVariation ? "Update Variation" : "Create Variation"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
