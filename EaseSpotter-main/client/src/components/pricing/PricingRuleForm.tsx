import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConditionBuilder } from "./ConditionBuilder";
import { RulePreview } from "./RulePreview";
import { AlertCircle, Pencil, CalendarIcon, ShieldCheck, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const pricingRuleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  priority: z.number().min(1, "Priority must be at least 1"),
  isActive: z.boolean().default(true),
  adjustmentType: z.enum(["percentage", "fixed"]),
  adjustmentValue: z.string().refine(
    (val) => !isNaN(Number(val)) && Number(val) !== 0,
    "Must be a non-zero number"
  ),
  category: z.string().optional(),
  applyTo: z.enum(["all", "selected"]).default("all"),
  conditions: z.any().optional(),
  advancedMode: z.boolean().default(false),
  // New scheduling fields
  startDate: z.date().optional(),
  endDate: z.date().optional().refine(
    (date, ctx) => {
      const startDate = ctx.path[0] === 'endDate' 
        ? (ctx.parent as any).startDate 
        : undefined;
      if (date && startDate && date < startDate) {
        return false;
      }
      return true;
    },
    { message: "End date must be after start date" }
  ),
  // Customer segment targeting
  targetSegment: z.string().optional(),
  // Template fields
  isTemplate: z.boolean().default(false),
  templateCategory: z.string().optional(),
  // A/B testing fields
  isPartOfTest: z.boolean().default(false),
  testGroup: z.string().optional(),
  // Margin guardrails
  minimumMarginEnabled: z.boolean().default(false),
  minimumMarginPercent: z.string().optional().refine(
    (value) => {
      if (!value) return true;
      const percent = Number(value);
      return Number.isFinite(percent) && percent > 0 && percent < 95;
    },
    "Minimum margin must be between 0 and 95"
  ),
});

type PricingRuleFormValues = z.infer<typeof pricingRuleSchema>;

interface PricingRuleFormProps {
  onSubmit: (values: PricingRuleFormValues) => void;
  isLoading?: boolean;
  initialData?: Partial<PricingRuleFormValues> & { id?: number };
  mode?: 'create' | 'edit';
}

const RULE_CATEGORIES = [
  { value: "seasonal", label: "Seasonal Pricing" },
  { value: "competitive", label: "Competitive Response" },
  { value: "inventory", label: "Inventory Management" },
  { value: "promotional", label: "Promotional Offer" },
  { value: "loyalty", label: "Customer Loyalty" },
  { value: "clearance", label: "Clearance Sale" },
  { value: "bundle", label: "Bundle Pricing" },
  { value: "other", label: "Other" },
];

export function PricingRuleForm({ onSubmit, isLoading, initialData, mode = 'create' }: PricingRuleFormProps) {
  const [activeTab, setActiveTab] = useState("basic");
  const [conditions, setConditions] = useState<Record<string, unknown>>({});
  const [previewAdjustment, setPreviewAdjustment] = useState<{ type: string; value: number }>({ type: 'percentage', value: 0 });
  const [hasConditionsError, setHasConditionsError] = useState(false);

  const form = useForm<PricingRuleFormValues>({
    resolver: zodResolver(pricingRuleSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      priority: initialData?.priority || 1,
      isActive: initialData?.isActive ?? true,
      adjustmentType: initialData?.adjustmentType || "percentage",
      adjustmentValue: initialData?.adjustmentValue?.toString() || "",
      category: initialData?.category || "other",
      applyTo: initialData?.applyTo || "all",
      conditions: initialData?.conditions || {},
      advancedMode: initialData?.advancedMode || false,
      // New fields
      startDate: initialData?.startDate || undefined,
      endDate: initialData?.endDate || undefined,
      targetSegment: initialData?.targetSegment || "",
      isTemplate: initialData?.isTemplate || false,
      templateCategory: initialData?.templateCategory || "",
      isPartOfTest: initialData?.isPartOfTest || false,
      testGroup: initialData?.testGroup || "",
      minimumMarginEnabled: initialData?.minimumMarginEnabled || false,
      minimumMarginPercent: initialData?.minimumMarginPercent || "",
    },
  });

  // Initialize conditions from initial data
  useEffect(() => {
    if (initialData?.conditions) {
      try {
        if (typeof initialData.conditions === 'string') {
          const parsedConditions = JSON.parse(initialData.conditions);
          setConditions(parsedConditions);
        } else {
          setConditions(initialData.conditions as Record<string, unknown>);
        }
      } catch (error) {
        console.error("Failed to parse initial conditions:", error);
        setHasConditionsError(true);
      }
    }
  }, [initialData]);

  // Update preview adjustment values when form values change
  useEffect(() => {
    const adjustmentType = form.watch("adjustmentType");
    const adjustmentValue = Number(form.watch("adjustmentValue") || 0);
    
    setPreviewAdjustment(prev => {
      if (prev.type === adjustmentType && prev.value === adjustmentValue) {
        return prev;
      }
      return {
        type: adjustmentType === 'percentage' ? 'percentage' : 'fixed',
        value: adjustmentValue
      };
    });
  }, [form.watch("adjustmentType"), form.watch("adjustmentValue")]);

  // Handle condition builder changes
  const handleConditionsChange = (newConditions: Record<string, unknown>) => {
    setConditions(newConditions);
    form.setValue("conditions", newConditions);
  };

  // Handle JSON editor changes for advanced mode
  const handleJsonConditionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const parsedConditions = JSON.parse(e.target.value);
      setConditions(parsedConditions);
      setHasConditionsError(false);
      form.setValue("conditions", parsedConditions);
    } catch (error) {
      setHasConditionsError(true);
    }
  };

  // Submit handler
  const handleSubmit = (values: PricingRuleFormValues) => {
    // Insert conditions data
    const formattedValues = {
      ...values,
      conditions: conditions
    };
    
    // Pass to parent component
    onSubmit(formattedValues);
  };

  // Toggle advanced mode
  const toggleAdvancedMode = () => {
    const currentMode = form.getValues("advancedMode");
    form.setValue("advancedMode", !currentMode);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter rule name" {...field} />
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
                    <Textarea placeholder="Describe the pricing rule" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RULE_CATEGORIES.map(category => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Categorize this rule for better organization
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="adjustmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === "percentage" ? "Apply % change to price" : "Add/subtract fixed amount"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adjustmentValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Value</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step={form.watch("adjustmentType") === "percentage" ? "0.01" : "0.01"} 
                        placeholder={form.watch("adjustmentType") === "percentage" ? "10.00" : "5.00"} 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      {form.watch("adjustmentType") === "percentage" 
                        ? "Positive for price increase, negative for discount" 
                        : "Positive adds to price, negative subtracts"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1" 
                      step="1" 
                      {...field} 
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Higher priority rules are applied first (1 is lowest priority)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Active Status</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Enable or disable this pricing rule
                    </p>
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
          </TabsContent>

          {/* Conditions Tab */}
          <TabsContent value="conditions" className="space-y-4 py-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Rule Conditions</h3>
              <Button type="button" variant="outline" size="sm" onClick={toggleAdvancedMode}>
                <Pencil className="h-4 w-4 mr-2" />
                {form.watch("advancedMode") ? "Simple Mode" : "Advanced Mode"}
              </Button>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Inventory conditions can target stock level, low-stock threshold, reorder point, inventory status, and days since restock.
              </AlertDescription>
            </Alert>

            {form.watch("advancedMode") ? (
              // Advanced JSON mode
              <div className="space-y-2">
                <Textarea 
                  className="font-mono text-sm min-h-[200px]"
                  placeholder='{"category": "electronics", "currentPrice": {"greaterThan": 100}}'
                  value={JSON.stringify(conditions, null, 2)}
                  onChange={handleJsonConditionsChange}
                />
                
                {hasConditionsError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Invalid JSON format. Please check your conditions.
                    </AlertDescription>
                  </Alert>
                )}
                
                <p className="text-sm text-muted-foreground">
                  Advanced mode: Edit conditions directly in JSON format
                </p>
              </div>
            ) : (
              // Visual condition builder
              <ConditionBuilder 
                value={conditions} 
                onChange={handleConditionsChange} 
              />
            )}
          </TabsContent>

          {/* Advanced Features Tab */}
          <TabsContent value="advanced" className="space-y-6 py-4">
            {/* Margin Guardrails */}
            <div className="border rounded-md p-4">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-medium">Margin Guardrails</h3>
              </div>
              <FormField
                control={form.control}
                name="minimumMarginEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Protect minimum gross margin
                      </FormLabel>
                      <FormDescription>
                        Block automated price changes that would drop matching products below this margin.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("minimumMarginEnabled") && (
                <FormField
                  control={form.control}
                  name="minimumMarginPercent"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Minimum Margin Percent</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0.01"
                          max="94.99"
                          step="0.01"
                          placeholder="25.00"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Example: 25 means prices must stay high enough to keep at least 25% gross margin.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Scheduling section */}
            <div className="border rounded-md p-4">
              <h3 className="text-lg font-medium mb-4">Rule Scheduling</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When this rule should start applying. Leave blank for immediate start.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const startDate = form.watch("startDate");
                              return startDate ? date < startDate : false;
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When this rule should stop applying. Leave blank for no end date.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Customer Segment Targeting */}
            <div className="border rounded-md p-4">
              <h3 className="text-lg font-medium mb-4">Customer Segment Targeting</h3>
              <FormField
                control={form.control}
                name="targetSegment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apply to Customer Segment</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer segment (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        <SelectItem value="loyalty_program">Loyalty Program Members</SelectItem>
                        <SelectItem value="first_time">First-time Customers</SelectItem>
                        <SelectItem value="high_value">High-value Customers</SelectItem>
                        <SelectItem value="at_risk">At-risk Customers</SelectItem>
                        <SelectItem value="inactive">Inactive Customers</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Target specific customer segments with personalized pricing
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Template Settings */}
            <div className="border rounded-md p-4">
              <h3 className="text-lg font-medium mb-4">Template Settings</h3>
              <FormField
                control={form.control}
                name="isTemplate"
                render={({ field }) => (
                  <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Save as Template
                      </FormLabel>
                      <FormDescription>
                        Make this rule available as a template for future rules
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("isTemplate") && (
                <FormField
                  control={form.control}
                  name="templateCategory"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Template Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select template category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="seasonal">Seasonal Sale</SelectItem>
                          <SelectItem value="clearance">Clearance</SelectItem>
                          <SelectItem value="competitive">Competitor Matching</SelectItem>
                          <SelectItem value="promotional">Promotional</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Categorize this template for easier discovery
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* A/B Testing */}
            <div className="border rounded-md p-4">
              <h3 className="text-lg font-medium mb-4">A/B Testing</h3>
              <FormField
                control={form.control}
                name="isPartOfTest"
                render={({ field }) => (
                  <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Part of A/B Test
                      </FormLabel>
                      <FormDescription>
                        Include this rule in an A/B testing experiment
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("isPartOfTest") && (
                <FormField
                  control={form.control}
                  name="testGroup"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Test Group</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select test group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="group_a">Group A (Variant)</SelectItem>
                          <SelectItem value="group_b">Group B (Control)</SelectItem>
                          <SelectItem value="group_c">Group C (Optional)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Assign this rule to a test group for measuring performance
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="py-4">
            <RulePreview 
              conditions={conditions}
              adjustment={previewAdjustment}
            />

            <div className="mt-4 p-4 border rounded-md bg-muted/50">
              <h4 className="font-medium mb-2">Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rule Name:</span>
                  <span className="font-medium">{form.watch("name") || "(Not set)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category:</span>
                  <Badge variant="outline">
                    {RULE_CATEGORIES.find(c => c.value === form.watch("category"))?.label || "Other"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Priority:</span>
                  <span>{form.watch("priority") || 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adjustment:</span>
                  <span>
                    {form.watch("adjustmentType") === "percentage" 
                      ? `${form.watch("adjustmentValue") || 0}%` 
                      : `$${form.watch("adjustmentValue") || 0}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={form.watch("isActive") ? "default" : "secondary"}>
                    {form.watch("isActive") ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {/* Advanced features summary */}
                {(form.watch("startDate") || form.watch("endDate")) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule:</span>
                    <span>
                      {form.watch("startDate") 
                        ? format(form.watch("startDate") as Date, "MMM d, yyyy") 
                        : "Now"} 
                      {" → "} 
                      {form.watch("endDate") 
                        ? format(form.watch("endDate") as Date, "MMM d, yyyy") 
                        : "No end date"}
                    </span>
                  </div>
                )}
                
                {form.watch("targetSegment") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Targeted Segment:</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                      {form.watch("targetSegment") && form.watch("targetSegment").split("_").map((word: string) => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(" ")}
                    </Badge>
                  </div>
                )}
                
                {form.watch("isTemplate") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template:</span>
                    <Badge variant="outline" className="bg-purple-50 text-purple-600 dark:bg-purple-900 dark:text-purple-300">
                      {(() => {
                        const category = form.watch("templateCategory");
                        if (!category) return "Template";
                        if (typeof category !== 'string') return "Template";
                        return category.charAt(0).toUpperCase() + category.slice(1);
                      })()}
                    </Badge>
                  </div>
                )}
                
                {form.watch("isPartOfTest") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">A/B Test Group:</span>
                    <Badge variant="outline" className="bg-amber-50 text-amber-600 dark:bg-amber-900 dark:text-amber-300">
                      {form.watch("testGroup") === "group_a" 
                        ? "A (Variant)" 
                        : form.watch("testGroup") === "group_b" 
                          ? "B (Control)" 
                          : form.watch("testGroup") === "group_c" 
                            ? "C" 
                            : "Not specified"}
                    </Badge>
                  </div>
                )}

                {form.watch("minimumMarginEnabled") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margin Guardrail:</span>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Minimum {form.watch("minimumMarginPercent") || 0}%
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => {
            if (activeTab === "basic") setActiveTab("conditions");
            else if (activeTab === "conditions") setActiveTab("advanced");
            else if (activeTab === "advanced") setActiveTab("preview");
            else setActiveTab("basic");
          }}>
            {activeTab === "preview" ? "Back to Basic Info" 
              : activeTab === "advanced" ? "Preview" 
              : activeTab === "conditions" ? "Advanced Features" 
              : "Next: Conditions"}
          </Button>
          <Button type="submit" disabled={isLoading || hasConditionsError}>
            {isLoading 
              ? (mode === 'edit' ? "Updating..." : "Creating...") 
              : (mode === 'edit' ? "Update Rule" : "Create Rule")
            }
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
