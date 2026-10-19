import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart3, 
  LineChart as LineChartIcon,
  ChevronUp, 
  ChevronDown, 
  Copy, 
  Edit, 
  Mail, 
  FileCode, 
  Shuffle, 
  Play, 
  Pause, 
  Trash2, 
  Plus, 
  RefreshCw, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  Rocket,
  FileText,
  TrendingDown,
  Clock,
  ArrowRight
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ABTestingInsights } from "./Insights";
import { AB_TEST_CONFIDENCE_THRESHOLD, AB_TEST_GOAL_LABELS, AB_TEST_TYPE_LABELS, getABTestInsights } from "./insights-utils";
import type { ABTest } from "./types";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Create test form schema
const createTestSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  type: z.enum(['email', 'page', 'element', 'funnel']),
  hypothesis: z.string().min(10, { message: "Hypothesis must be at least 10 characters" }),
  goal: z.enum(['conversion', 'engagement', 'retention', 'revenue', 'other']),
  goalMetric: z.string().min(2, { message: "Goal metric is required" }),
  trafficAllocation: z.number().min(1).max(100),
  variants: z.array(
    z.object({
      name: z.string().min(1, { message: "Variant name is required" }),
      description: z.string(),
      isControl: z.boolean().optional(),
      traffic: z.number().min(1).max(100),
    })
  ).min(2, { message: "At least 2 variants are required" }),
  status: z.enum(['active', 'paused', 'draft']).default('draft'),
}).superRefine((values, ctx) => {
  const trafficTotal = values.variants.reduce((sum, variant) => sum + variant.traffic, 0);
  const controlCount = values.variants.filter((variant) => Boolean(variant.isControl)).length;

  if (trafficTotal !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Variant traffic split must total 100%",
      path: ["variants"],
    });
  }

  if (controlCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Exactly one control variant is required",
      path: ["variants"],
    });
  }
});

type CreateTestFormValues = z.infer<typeof createTestSchema>;

function rebalanceVariantTraffic<T extends { traffic: number }>(variants: T[]): T[] {
  if (!variants.length) {
    return variants;
  }

  const baseTraffic = Math.floor(100 / variants.length);
  let remainder = 100 - baseTraffic * variants.length;

  return variants.map((variant) => {
    const traffic = baseTraffic + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return { ...variant, traffic };
  });
}

export function ABTestingDashboard() {
  const [activeTab, setActiveTab] = useState("experiments");
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
  const [createTestOpen, setCreateTestOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>("dateModified");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showArchived, setShowArchived] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: abTests = [], isLoading, refetch } = useQuery<ABTest[]>({
    queryKey: ["/api/marketing/ab-tests"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/ab-tests");
      if (!response.ok) {
        throw new Error("Failed to fetch A/B tests");
      }
      return response.json();
    },
    initialData: [],
  });
  
  // Form
  const testForm = useForm<CreateTestFormValues>({
    resolver: zodResolver(createTestSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "page",
      hypothesis: "",
      goal: "conversion",
      goalMetric: "",
      trafficAllocation: 50,
      variants: [
        { name: "Control", description: "Original version", isControl: true, traffic: 50 },
        { name: "Variant A", description: "Test version", traffic: 50 }
      ],
      status: "draft",
    },
  });
  const watchedVariants = testForm.watch("variants");
  const variantTrafficTotal = watchedVariants.reduce((sum, variant) => sum + Number(variant.traffic || 0), 0);
  const controlCount = watchedVariants.filter((variant) => Boolean(variant.isControl)).length;
  const variantSetupIsValid = variantTrafficTotal === 100 && controlCount === 1;

  useEffect(() => {
    if (!selectedTest) return;
    const nextSelected = abTests.find((test) => test.id === selectedTest.id);
    if (nextSelected) {
      setSelectedTest(nextSelected);
    }
  }, [abTests, selectedTest]);

  const createTestMutation = useMutation({
    mutationFn: async (values: CreateTestFormValues) => {
      const response = await apiRequest("POST", "/api/marketing/ab-tests", {
        ...values,
        tags: [],
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create A/B test");
      }

      return response.json();
    },
    onSuccess: (createdTest: ABTest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/ab-tests"] });
      testForm.reset();
      setCreateTestOpen(false);
      setSelectedTest(createdTest);
      toast({
        title: "A/B test created",
        description: `"${createdTest.name}" has been created successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create A/B test",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTestMutation = useMutation({
    mutationFn: async ({ testId, payload }: { testId: string; payload: Record<string, unknown> }) => {
      const response = await apiRequest("PATCH", `/api/marketing/ab-tests/${testId}`, payload);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update A/B test");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/ab-tests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update test",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      const response = await apiRequest("DELETE", `/api/marketing/ab-tests/${testId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete A/B test");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/ab-tests"] });
      setSelectedTest(null);
      toast({
        title: "A/B test deleted",
        description: "The test and its tracked events have been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete test",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateTest = (values: CreateTestFormValues) => {
    createTestMutation.mutate(values);
  };

  const handleStatusChange = (test: ABTest, status: ABTest["status"]) => {
    updateTestMutation.mutate({ testId: test.id, payload: { status } });
  };

  const handleDeleteTest = (test: ABTest) => {
    deleteTestMutation.mutate(test.id);
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Get sorted tests
  const getSortedTests = () => {
    return [...abTests]
      .filter(test => showArchived || test.status !== "completed")
      .sort((a, b) => {
        let valueA, valueB;

        // Handle different column types
        switch (sortColumn) {
          case "name":
            valueA = a.name;
            valueB = b.name;
            break;
          case "dateCreated":
            valueA = new Date(a.dateCreated).getTime();
            valueB = new Date(b.dateCreated).getTime();
            break;
          case "dateModified":
            valueA = new Date(a.dateModified).getTime();
            valueB = new Date(b.dateModified).getTime();
            break;
          case "status":
            valueA = a.status;
            valueB = b.status;
            break;
          case "conversionRate":
            const aRate = a.results ? 
              a.results.totalConversions / a.results.totalVisitors * 100 : 0;
            const bRate = b.results ? 
              b.results.totalConversions / b.results.totalVisitors * 100 : 0;
            valueA = aRate;
            valueB = bRate;
            break;
          default:
            valueA = a.dateModified;
            valueB = b.dateModified;
        }

        // Sort direction
        if (sortDirection === "asc") {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'draft':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get test type icon
  const getTestTypeIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'page':
        return <FileCode className="h-4 w-4" />;
      case 'element':
        return <FileText className="h-4 w-4" />;
      case 'funnel':
        return <Rocket className="h-4 w-4" />;
      default:
        return <Shuffle className="h-4 w-4" />;
    }
  };

  // Handle test selection
  const handleTestClick = (test: ABTest) => {
    setSelectedTest(test);
    setActiveTab("results");
  };

  const insights = getABTestInsights(abTests);
  const formatPercent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
  const formatSignedPercent = (value: number, digits = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
  const getVariantColor = (index: number, isControl?: boolean) => {
    if (isControl) return "#6B7280";

    const colors = ["#3B82F6", "#70AD47", "#ED7D31", "#A855F7", "#06B6D4"];
    return colors[index % colors.length];
  };
  const getConversionTrendData = (test: ABTest) => {
    const days = 10;
    const start = test.results?.startDate || test.startDate || test.dateCreated;

    return Array.from({ length: days }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(date.getDate() + dayIndex);

      const row: Record<string, string | number> = {
        day: `Day ${dayIndex + 1}`,
        date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      };

      test.variants.forEach((variant, variantIndex) => {
        const finalRate = Number(variant.conversionRate ?? 0);
        const ramp = days === 1 ? 1 : dayIndex / (days - 1);
        const earlyOffset = variant.isControl ? -0.15 : -0.45 + variantIndex * 0.08;
        const curve = finalRate * (0.72 + ramp * 0.28) + earlyOffset * (1 - ramp);
        row[variant.id] = Number(Math.max(0, curve).toFixed(2));
      });

      return row;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">A/B Testing</h2>
          <p className="text-muted-foreground">
            Create, run, and analyze A/B tests to optimize conversion rates
          </p>
        </div>
        <Dialog open={createTestOpen} onOpenChange={setCreateTestOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create A/B Test
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-[700px]">
            <DialogHeader className="shrink-0 pr-8">
              <DialogTitle>Create A/B Test</DialogTitle>
              <DialogDescription>
                Set up a new experiment to test variations of your marketing assets.
              </DialogDescription>
            </DialogHeader>
            <Form {...testForm}>
              <form onSubmit={testForm.handleSubmit(handleCreateTest)} className="flex max-h-[calc(90vh-5rem)] flex-col">
                <div className="space-y-6 overflow-y-auto pr-2">
                <FormField
                  control={testForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Test Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Homepage Hero Section Test" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={testForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Test Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select test type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="page">Page Test</SelectItem>
                            <SelectItem value="element">Element Test</SelectItem>
                            <SelectItem value="funnel">Funnel Test</SelectItem>
                            <SelectItem value="email">Email Test</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={testForm.control}
                    name="goal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Test Goal</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select test goal" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="conversion">Conversion</SelectItem>
                            <SelectItem value="engagement">Engagement</SelectItem>
                            <SelectItem value="retention">Retention</SelectItem>
                            <SelectItem value="revenue">Revenue</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={testForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Briefly describe the purpose of the test..." 
                          {...field} 
                          className="min-h-[80px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={testForm.control}
                  name="hypothesis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hypothesis</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g., We believe that [change] will result in [outcome] because [reasoning]..." 
                          {...field} 
                          className="min-h-[80px]"
                        />
                      </FormControl>
                      <FormDescription>
                        A clear hypothesis helps measure success and learn from results
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={testForm.control}
                    name="goalMetric"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Goal Metric</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Click-through rate, Sign-ups, Purchases" {...field} />
                        </FormControl>
                        <FormDescription>
                          The specific metric you'll use to measure success
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={testForm.control}
                    name="trafficAllocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Traffic Allocation (%)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1" 
                            max="100" 
                            {...field} 
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Percentage of traffic to include in this test
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-3">Test Variants</h4>
                  <div className="mb-3 rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Variant traffic total</span>
                      <span className={variantTrafficTotal === 100 ? "font-medium text-green-600" : "font-medium text-destructive"}>
                        {variantTrafficTotal}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-muted-foreground">Control variants</span>
                      <span className={controlCount === 1 ? "font-medium text-green-600" : "font-medium text-destructive"}>
                        {controlCount}
                      </span>
                    </div>
                    {!variantSetupIsValid && (
                      <p className="mt-2 text-xs text-destructive">
                        Keep the split at exactly 100% and select exactly one control variant before creating the test.
                      </p>
                    )}
                  </div>
                  <FormField
                    control={testForm.control}
                    name="variants"
                    render={() => (
                      <FormItem>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {watchedVariants.map((variant, index) => (
                    <div key={index} className="mb-6 p-4 border rounded-md">
                      <div className="flex justify-between items-center mb-4">
                        <h5 className="font-medium flex items-center">
                          <Badge variant={variant.isControl ? "default" : "outline"} className="mr-2">
                            {variant.isControl ? "Control" : `Variant ${index}`}
                          </Badge>
                          <FormField
                            control={testForm.control}
                            name={`variants.${index}.name`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </h5>
                        {testForm.watch("variants").length > 2 && !variant.isControl && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            type="button"
                            onClick={() => {
                              const currentVariants = testForm.getValues("variants");
                              const nextVariants = rebalanceVariantTraffic(
                                currentVariants.filter((_, i) => i !== index)
                              );
                              testForm.setValue(
                                "variants", 
                                nextVariants,
                                { shouldValidate: true }
                              );
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-4">
                        <FormField
                          control={testForm.control}
                          name={`variants.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Describe the changes in this variant..." 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={testForm.control}
                          name={`variants.${index}.traffic`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Traffic Split (%)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min="1" 
                                  max="100" 
                                  {...field} 
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={testForm.control}
                          name={`variants.${index}.isControl`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={(checked) => {
                                    // If checking this as control, uncheck others
                                    const variants = testForm.getValues("variants");
                                    const nextVariants = variants.map((item, i) => ({
                                      ...item,
                                      isControl: i === index ? Boolean(checked) : false,
                                    }));

                                    testForm.setValue("variants", nextVariants, { shouldValidate: true });
                                  }}
                                  disabled={variant.isControl && testForm.watch("variants").length > 1}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>This is the control version</FormLabel>
                                <FormDescription>
                                  The control is your current version that others will be compared against
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const currentVariants = testForm.getValues("variants");
                      const nextVariants = rebalanceVariantTraffic([
                        ...currentVariants,
                        {
                          name: `Variant ${currentVariants.length}`,
                          description: "",
                          isControl: false,
                          traffic: 0
                        }
                      ]);
                      testForm.setValue("variants", nextVariants, { shouldValidate: true });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Variant
                  </Button>
                </div>
                
                <FormField
                  control={testForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Initial Status</FormLabel>
                      <div className="flex items-center space-x-6">
                        <RadioGroup 
                          defaultValue={field.value}
                          onValueChange={field.onChange}
                          className="flex items-center"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="draft" id="draft" />
                            </FormControl>
                            <FormLabel className="font-normal" htmlFor="draft">
                              Draft
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0 ml-4">
                            <FormControl>
                              <RadioGroupItem value="active" id="active" />
                            </FormControl>
                            <FormLabel className="font-normal" htmlFor="active">
                              Active
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0 ml-4">
                            <FormControl>
                              <RadioGroupItem value="paused" id="paused" />
                            </FormControl>
                            <FormLabel className="font-normal" htmlFor="paused">
                              Paused
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
                <DialogFooter className="mt-6 shrink-0 border-t pt-4">
                  <Button type="submit" disabled={createTestMutation.isPending || !variantSetupIsValid}>
                    Create A/B Test
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="experiments" className="flex items-center gap-2">
            <Shuffle className="h-4 w-4" />
            <span>Experiments</span>
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Results</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <LineChartIcon className="h-4 w-4" />
            <span>Insights</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="experiments" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>A/B Test List</CardTitle>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={showArchived}
                      onCheckedChange={(checked) => setShowArchived(!!checked)}
                    />
                    <span>Show Completed Tests</span>
                  </label>
                  <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
              <CardDescription>View all your A/B tests and their status</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="w-[300px] cursor-pointer"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Test Name</span>
                        {sortColumn === "name" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                        {sortColumn !== "name" && <ChevronDown className="h-4 w-4 opacity-50" />}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort("status")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Status</span>
                        {sortColumn === "status" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                        {sortColumn !== "status" && <ChevronDown className="h-4 w-4 opacity-50" />}
                      </div>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort("dateModified")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Last Updated</span>
                        {sortColumn === "dateModified" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                        {sortColumn !== "dateModified" && <ChevronDown className="h-4 w-4 opacity-50" />}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort("conversionRate")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Performance</span>
                        {sortColumn === "conversionRate" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                        {sortColumn !== "conversionRate" && <ChevronDown className="h-4 w-4 opacity-50" />}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Loading A/B tests...
                      </TableCell>
                    </TableRow>
                  )}
                  {getSortedTests().map(test => (
                    <TableRow 
                      key={test.id}
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => handleTestClick(test)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            {getTestTypeIcon(test.type)}
                          </div>
                          <div>
                            <div>{test.name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                              {test.description}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(test.status)}>
                          {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getTestTypeIcon(test.type)}
                          <span className="capitalize">{test.type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(test.dateModified).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {test.results ? (
                          <div className="flex items-center gap-1">
                            {test.results.uplift && test.results.uplift > 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : test.results.uplift && test.results.uplift < 0 ? (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-500" />
                            )}
                            <span>
                              {test.results.uplift 
                                ? `${test.results.uplift > 0 ? '+' : ''}${test.results.uplift.toFixed(1)}%` 
                                : 'No data'}
                            </span>
                            {test.results.confidenceLevel && test.results.confidenceLevel >= 95 && (
                              <CheckCircle className="h-4 w-4 text-green-500 ml-1" />
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not started</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {test.status === 'active' ? (
                            <Button variant="ghost" size="icon" onClick={() => handleStatusChange(test, "paused")}>
                              <Pause className="h-4 w-4" />
                            </Button>
                          ) : test.status === 'paused' ? (
                            <Button variant="ghost" size="icon" onClick={() => handleStatusChange(test, "active")}>
                              <Play className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTest(test)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {getSortedTests().length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No tests found. Click "Create A/B Test" to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Testing Best Practices</CardTitle>
              <CardDescription>Tips for creating effective A/B tests</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center">
                      1
                    </div>
                    <span>Start with a clear hypothesis</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Define what you're testing and why, with a clear prediction of the outcome.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center">
                      2
                    </div>
                    <span>Test one variable at a time</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Change only one element to ensure clear cause-and-effect relationships in your results.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center">
                      3
                    </div>
                    <span>Run tests for sufficient time</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ensure statistically significant results by collecting enough data (at least 1-2 weeks).
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center">
                      4
                    </div>
                    <span>Test across segments</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Different customer segments may respond differently to the same test.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center">
                      5
                    </div>
                    <span>Focus on meaningful metrics</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Measure metrics that directly impact your business goals, not vanity metrics.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center">
                      6
                    </div>
                    <span>Document and learn</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Track all test results, even unsuccessful ones, to build institutional knowledge.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {selectedTest ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{selectedTest.name}</CardTitle>
                      <CardDescription className="mt-1">{selectedTest.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(selectedTest.status)}>
                        {selectedTest.status.charAt(0).toUpperCase() + selectedTest.status.slice(1)}
                      </Badge>
                      {selectedTest.status === 'active' ? (
                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(selectedTest, "paused")}>
                          <Pause className="h-4 w-4 mr-2" />
                          Pause Test
                        </Button>
                      ) : selectedTest.status === 'paused' ? (
                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(selectedTest, "active")}>
                          <Play className="h-4 w-4 mr-2" />
                          Resume Test
                        </Button>
                      ) : selectedTest.status === 'draft' ? (
                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(selectedTest, "active")}>
                          <Play className="h-4 w-4 mr-2" />
                          Start Test
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => handleDeleteTest(selectedTest)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-medium mb-3">Test Details</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Type:</span>
                            <span className="text-sm font-medium capitalize">{selectedTest.type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Goal:</span>
                            <span className="text-sm font-medium capitalize">{selectedTest.goal}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Goal Metric:</span>
                            <span className="text-sm font-medium">{selectedTest.goalMetric}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Traffic Allocation:</span>
                            <span className="text-sm font-medium">{selectedTest.trafficAllocation}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Created:</span>
                            <span className="text-sm font-medium">{new Date(selectedTest.dateCreated).toLocaleDateString()}</span>
                          </div>
                          {selectedTest.startDate && (
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Started:</span>
                              <span className="text-sm font-medium">{new Date(selectedTest.startDate).toLocaleDateString()}</span>
                            </div>
                          )}
                          {selectedTest.endDate && (
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Ended:</span>
                              <span className="text-sm font-medium">{new Date(selectedTest.endDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium mb-3">Hypothesis</h4>
                        <Card className="bg-muted/40">
                          <CardContent className="p-4">
                            <p className="text-sm">{selectedTest.hypothesis}</p>
                          </CardContent>
                        </Card>
                      </div>
                      
                      {selectedTest.tags && selectedTest.tags.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-3">Tags</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedTest.tags.map((tag, index) => (
                              <Badge key={index} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="md:col-span-2 space-y-6">
                      {selectedTest.results ? (
                        <>
                          <div>
                            <h4 className="text-sm font-medium mb-3">Test Results</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Card className="bg-muted/40">
                                <CardContent className="p-4">
                                  <div className="text-sm text-muted-foreground">Total Visitors</div>
                                  <div className="text-2xl font-bold">{selectedTest.results.totalVisitors.toLocaleString()}</div>
                                </CardContent>
                              </Card>
                              <Card className="bg-muted/40">
                                <CardContent className="p-4">
                                  <div className="text-sm text-muted-foreground">Conversions</div>
                                  <div className="text-2xl font-bold">{selectedTest.results.totalConversions.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {((selectedTest.results.totalConversions / selectedTest.results.totalVisitors) * 100).toFixed(2)}% overall conversion rate
                                  </div>
                                </CardContent>
                              </Card>
                              {selectedTest.results.uplift !== undefined && (
                                <Card className={`${selectedTest.results.uplift >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                  <CardContent className="p-4">
                                    <div className="text-sm text-muted-foreground">Uplift</div>
                                    <div className="text-2xl font-bold flex items-center">
                                      {selectedTest.results.uplift >= 0 ? (
                                        <>
                                          <TrendingUp className="h-5 w-5 mr-1 text-green-500" />
                                          <span className="text-green-700">+{selectedTest.results.uplift.toFixed(2)}%</span>
                                        </>
                                      ) : (
                                        <>
                                          <TrendingDown className="h-5 w-5 mr-1 text-red-500" />
                                          <span className="text-red-700">{selectedTest.results.uplift.toFixed(2)}%</span>
                                        </>
                                      )}
                                    </div>
                                    {selectedTest.results.confidenceLevel && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {selectedTest.results.confidenceLevel}% confidence
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              )}
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="text-sm font-medium mb-3">Variant Performance</h4>
                            <Card>
                              <CardContent className="p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Variant</TableHead>
                                      <TableHead className="text-right">Visitors</TableHead>
                                      <TableHead className="text-right">Conversions</TableHead>
                                      <TableHead className="text-right">Conv. Rate</TableHead>
                                      <TableHead className="text-right">Improvement</TableHead>
                                      <TableHead className="text-right">Confidence</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedTest.variants.map(variant => (
                                      <TableRow 
                                        key={variant.id}
                                        className={selectedTest.results?.winningVariant === variant.id 
                                          ? "bg-green-50" 
                                          : ""
                                        }
                                      >
                                        <TableCell className="font-medium">
                                          <div className="flex items-center gap-2">
                                            <Badge variant={variant.isControl ? "outline" : "default"}>
                                              {variant.isControl ? "Control" : "Variant"}
                                            </Badge>
                                            <span>{variant.name}</span>
                                            {selectedTest.results?.winningVariant === variant.id && (
                                              <CheckCircle className="h-4 w-4 text-green-500" />
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {variant.visitors?.toLocaleString() || "0"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {variant.conversions?.toLocaleString() || "0"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {variant.conversionRate?.toFixed(2) || "0.00"}%
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {variant.isControl ? (
                                            <span className="text-muted-foreground">Baseline</span>
                                          ) : variant.conversionRate && selectedTest.variants.find(v => v.isControl)?.conversionRate ? (
                                            <span className={variant.conversionRate > (selectedTest.variants.find(v => v.isControl)?.conversionRate || 0) 
                                              ? "text-green-600" 
                                              : "text-red-600"
                                            }>
                                              {((variant.conversionRate / (selectedTest.variants.find(v => v.isControl)?.conversionRate || 1) - 1) * 100).toFixed(2)}%
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">--</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {variant.confidence ? `${variant.confidence}%` : "--"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          </div>
                          
                          {selectedTest.results?.revenueImpact && (
                            <div>
                              <h4 className="text-sm font-medium mb-3">Business Impact Analysis</h4>
                              <Card className="bg-blue-50 border-blue-200">
                                <CardContent className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <div className="text-sm text-muted-foreground">Estimated Annual Revenue Impact</div>
                                      <div className="text-2xl font-bold text-blue-700">
                                        +${selectedTest.results.revenueImpact.toLocaleString()}
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        Based on current traffic and conversion value
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-muted-foreground">Implementation Recommendation</div>
                                      <div className="font-medium text-green-700 flex items-center gap-1 mt-1">
                                        <CheckCircle className="h-4 w-4" />
                                        <span>
                                          {selectedTest.results.confidenceLevel && selectedTest.results.confidenceLevel >= 95 
                                            ? "Implement winning variant" 
                                            : selectedTest.results.confidenceLevel && selectedTest.results.confidenceLevel >= 80
                                              ? "Consider implementing with monitoring"
                                              : "Continue testing to increase confidence"
                                          }
                                        </span>
                                      </div>
                                      {selectedTest.results.confidenceLevel && selectedTest.results.confidenceLevel < 95 && (
                                        <div className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                                          <AlertCircle className="h-3 w-3" />
                                          <span>Confidence level below 95% threshold</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}
                          
                          <div>
                            <h4 className="text-sm font-medium mb-3">Conversion Rate Over Time</h4>
                            <Card>
                              <CardContent className="p-4">
                                <div className="h-72 w-full min-w-0">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                      data={getConversionTrendData(selectedTest)}
                                      margin={{ top: 12, right: 24, left: 8, bottom: 12 }}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                      <XAxis
                                        dataKey="day"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 11 }}
                                        tickMargin={10}
                                        minTickGap={18}
                                        interval="preserveStartEnd"
                                      />
                                      <YAxis
                                        width={48}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                                      />
                                      <Tooltip
                                        labelFormatter={(_, payload) => {
                                          const row = payload?.[0]?.payload as { day?: string; date?: string } | undefined;
                                          return row?.date ? `${row.day} (${row.date})` : row?.day || "";
                                        }}
                                        formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                                      />
                                      <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                                      {selectedTest.variants.map((variant, index) => (
                                        <Line
                                          key={variant.id}
                                          type="monotone"
                                          dataKey={variant.id}
                                          name={`${variant.name}${variant.isControl ? " (Control)" : ""}`}
                                          stroke={getVariantColor(index, variant.isControl)}
                                          strokeWidth={3}
                                          dot={{ r: 3 }}
                                          activeDot={{ r: 5 }}
                                          connectNulls
                                        />
                                      ))}
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium">No data available</h3>
                          <p className="text-muted-foreground text-center max-w-md mt-2">
                            This test hasn't started collecting data yet. Start the test to begin gathering results.
                          </p>
                          {selectedTest.status === 'draft' && (
                            <Button className="mt-4" onClick={() => handleStatusChange(selectedTest, "active")}>
                              <Play className="h-4 w-4 mr-2" />
                              Start Test
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Shuffle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No test selected</h3>
                <p className="text-muted-foreground text-center max-w-md mt-2">
                  Select a test from the Experiments tab to view detailed results and performance metrics.
                </p>
                <Button 
                  className="mt-4" 
                  onClick={() => setActiveTab("experiments")}
                >
                  View Experiments
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Testing Performance</CardTitle>
                  <CardDescription>Overall effectiveness of your A/B testing program</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="bg-muted/40">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Total Tests Run</div>
                        <div className="text-2xl font-bold">{insights.summary.totalTests}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {insights.summary.completedTests} completed, {insights.summary.activeTests} active
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/40">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Win Rate</div>
                        <div className="text-2xl font-bold">{formatPercent(insights.summary.winRate)}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {insights.summary.wins} wins out of {insights.summary.completedWithResults} measured completed tests
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/40">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Avg. Improvement</div>
                        <div className="text-2xl font-bold">{formatSignedPercent(insights.summary.avgImprovement)}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Confidence-qualified winning experiments
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Test Type Effectiveness</h4>
                      <div className="space-y-4">
                        {insights.typePerformance.map((entry) => (
                          <div key={entry.type} className="rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="font-medium">{AB_TEST_TYPE_LABELS[entry.type]}</div>
                                <div className="text-sm text-muted-foreground">
                                  {entry.completedTests} completed tests, {entry.wins} wins
                                </div>
                              </div>
                              <Badge variant="outline">{formatPercent(entry.winRate)} win rate</Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="mb-1 flex items-center justify-between text-sm">
                                  <span>Win Rate</span>
                                  <span>{formatPercent(entry.winRate)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${Math.min(entry.winRate, 100)}%` }} />
                                </div>
                              </div>
                              <div>
                                <div className="mb-1 flex items-center justify-between text-sm">
                                  <span>Avg. Improvement</span>
                                  <span>{formatSignedPercent(entry.avgImprovement)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-green-500" style={{ width: `${Math.min(Math.max(entry.avgImprovement, 0), 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-3">Test Goals Distribution</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="bg-muted/20">
                          <CardContent className="p-4 space-y-3">
                            {insights.goalDistribution.length ? (
                              insights.goalDistribution.map((goal) => (
                                <div key={goal.goal}>
                                  <div className="mb-1 flex items-center justify-between text-sm">
                                    <span>{AB_TEST_GOAL_LABELS[goal.goal]}</span>
                                    <span className="text-muted-foreground">
                                      {goal.count} tests • {formatPercent(goal.share)}
                                    </span>
                                  </div>
                                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full bg-primary/80" style={{ width: `${Math.min(goal.share, 100)}%` }} />
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground">No test goals have been recorded yet.</div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="bg-muted/20">
                          <CardContent className="p-4 space-y-3">
                            {insights.typePerformance.map((entry) => (
                              <div key={entry.type}>
                                <div className="mb-1 flex items-center justify-between text-sm">
                                  <span>{AB_TEST_TYPE_LABELS[entry.type]}</span>
                                  <span className="text-muted-foreground">
                                    {entry.totalTests} tests • {formatPercent(entry.trafficShare)}
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-green-500" style={{ width: `${Math.min(entry.trafficShare, 100)}%` }} />
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Top Insights</CardTitle>
                  <CardDescription>Key learnings from your testing program</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {insights.topInsights.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-md border p-3 ${
                          item.tone === "positive"
                            ? "bg-green-50 border-green-200"
                            : item.tone === "warning"
                              ? "bg-amber-50 border-amber-200"
                              : "bg-blue-50 border-blue-200"
                        }`}
                      >
                        <div className="font-medium flex items-center gap-2">
                          {item.tone === "positive" ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : item.tone === "warning" ? (
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                          ) : (
                            <LineChartIcon className="h-4 w-4 text-blue-600" />
                          )}
                          <span>{item.title}</span>
                        </div>
                        <p className="text-sm mt-1">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Recommended Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {insights.recommendations.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Program Benchmarks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-md">
                      <span className="text-sm text-muted-foreground">Average Confidence</span>
                      <span className="font-medium">{formatPercent(insights.summary.avgConfidence, 1)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-md">
                      <span className="text-sm text-muted-foreground">Average Visitors / Completed Test</span>
                      <span className="font-medium">{Math.round(insights.summary.avgVisitorsPerCompletedTest).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-md">
                      <span className="text-sm text-muted-foreground">Tests Below Decision Threshold</span>
                      <span className="font-medium">
                        {insights.summary.underpoweredActiveTests} under {AB_TEST_CONFIDENCE_THRESHOLD}% confidence
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex justify-end">
            <Button 
              onClick={() => setActiveTab("test-insights")}
              className="gap-2"
            >
              View All Testing Insights <ArrowRight size={16} />
            </Button>
          </div>
        </TabsContent>
        
        {/* Add new tab content for detailed insights */}
        <TabsContent value="test-insights" className="space-y-6">
          <ABTestingInsights abTests={abTests} />
          
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => setActiveTab("insights")}
              className="gap-2"
            >
              Back to Overview
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
