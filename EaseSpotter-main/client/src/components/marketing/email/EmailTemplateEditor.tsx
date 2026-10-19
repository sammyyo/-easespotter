import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyCheck, Eye, Save, Sparkles, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

// Schema for email template
const templateSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(3, "Description must be at least 3 characters"),
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  content: z.string().min(10, "Content must be at least 10 characters"),
  category: z.string().min(1, "Please select a category"),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

const templateCategories = [
  { id: "onboarding", name: "Onboarding" },
  { id: "marketing", name: "Marketing" },
  { id: "notification", name: "Notification" },
  { id: "transactional", name: "Transactional" },
  { id: "newsletter", name: "Newsletter" },
];

// Sample template presets to start with
const templatePresets = [
  {
    id: "welcome_new_customer",
    name: "Welcome New Customer",
    description: "First email to new customers",
    category: "onboarding",
    subject: "Welcome to EaseSpotter!",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #4F46E5;">Welcome to EaseSpotter!</h1>
  <p>Hi {"{customer_name}"},</p>
  <p>Thank you for choosing EaseSpotter for your dynamic pricing needs. We're excited to have you on board!</p>
  <p>With EaseSpotter, you can:</p>
  <ul>
    <li>Monitor competitor prices in real-time</li>
    <li>Optimize your pricing strategy</li>
    <li>Increase profit margins with intelligent pricing</li>
    <li>Create targeted marketing campaigns</li>
  </ul>
  <p>If you need any assistance getting started, our support team is here to help.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{dashboard_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Go to Dashboard</a>
  </div>
  <p>Best regards,<br>The EaseSpotter Team</p>
</div>`
  },
  {
    id: "monthly_newsletter",
    name: "Monthly Newsletter",
    description: "Regular monthly updates and news",
    category: "newsletter",
    subject: "EaseSpotter Monthly Newsletter: {month} {year}",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #4F46E5;">EaseSpotter Monthly Update</h1>
  <p>Hi {"{customer_name}"},</p>
  
  <h2 style="color: #4F46E5; margin-top: 30px;">New Features</h2>
  <p>We've added several new capabilities to help you optimize your pricing strategy:</p>
  <ul>
    <li><strong>Feature 1:</strong> Description of new feature</li>
    <li><strong>Feature 2:</strong> Description of new feature</li>
    <li><strong>Feature 3:</strong> Description of new feature</li>
  </ul>
  
  <h2 style="color: #4F46E5; margin-top: 30px;">Customer Spotlight</h2>
  <p>Learn how {"{spotlight_company}"} increased their revenue by {"{percentage}"}% using our platform.</p>
  
  <h2 style="color: #4F46E5; margin-top: 30px;">Upcoming Events</h2>
  <p>Join our webinar on dynamic pricing strategies next week.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{dashboard_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Full Newsletter</a>
  </div>
  
  <p>Best regards,<br>The EaseSpotter Team</p>
</div>`
  },
  {
    id: "price_alert",
    name: "Price Alert",
    description: "Notify customers of price changes",
    category: "notification",
    subject: "Price Alert: {product_name} price has changed",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #4F46E5;">Price Alert</h1>
  <p>Hi {"{customer_name}"},</p>
  
  <p>We wanted to let you know that the price of <strong>{"{product_name}"}</strong> has changed.</p>
  
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Previous Price:</strong> ${"{previous_price}"}</p>
    <p style="margin: 10px 0 0 0;"><strong>New Price:</strong> ${"{new_price}"}</p>
  </div>
  
  <p>This price change was triggered based on your configured pricing rules and market conditions.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{product_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Product Details</a>
  </div>
  
  <p>Best regards,<br>The EaseSpotter Team</p>
</div>`
  },
  {
    id: "abandoned_cart",
    name: "Abandoned Cart Reminder",
    description: "Reminder for customers with abandoned carts",
    category: "marketing",
    subject: "Complete Your Pricing Configuration, {customer_name}",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #4F46E5;">Your Pricing Configuration Is Waiting</h1>
  <p>Hi {"{customer_name}"},</p>
  
  <p>We noticed that you started setting up a new pricing configuration but didn't complete it. Your progress has been saved, and you can pick up right where you left off.</p>
  
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
    <h3 style="color: #4F46E5; margin-top: 0;">Configuration Details</h3>
    <p><strong>Configuration Name:</strong> {"{config_name}"}</p>
    <p><strong>Products Included:</strong> {"{product_count}"}</p>
    <p><strong>Last Modified:</strong> {"{last_modified}"}</p>
  </div>
  
  <p>Complete your configuration to start leveraging dynamic pricing for these products.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{configuration_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Complete Configuration</a>
  </div>
  
  <p>Need help? Our team is available to assist you with completing your setup.</p>
  
  <p>Best regards,<br>The EaseSpotter Team</p>
</div>`
  },
  {
    id: "promotion_announcement",
    name: "Promotion Announcement",
    description: "Announce a new promotion or special offer",
    category: "marketing",
    subject: "Special Offer: {promotion_name} - Limited Time Only!",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #4F46E5;">Special Limited-Time Offer</h1>
  <p>Hi {"{customer_name}"},</p>
  
  <div style="background-color: #4F46E5; color: white; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
    <h2 style="margin-top: 0; margin-bottom: 10px;">Save {"{discount_amount}"}% on {"{plan_name}"}</h2>
    <p style="margin: 0; font-size: 18px;">Use code: <strong>{"{promotion_code}"}</strong></p>
    <p style="margin-top: 10px;">Offer expires: {"{expiration_date}"}</p>
  </div>
  
  <h2 style="color: #4F46E5; margin-top: 30px;">What's Included</h2>
  <ul>
    <li><strong>Premium Feature 1:</strong> Description of feature benefit</li>
    <li><strong>Premium Feature 2:</strong> Description of feature benefit</li>
    <li><strong>Premium Feature 3:</strong> Description of feature benefit</li>
    <li><strong>Premium Feature 4:</strong> Description of feature benefit</li>
  </ul>
  
  <p>This special offer is only available for a limited time. Upgrade now to take advantage of these powerful features.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{offer_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Claim Your Offer</a>
  </div>
  
  <p>Best regards,<br>The EaseSpotter Team</p>
</div>`
  },
  {
    id: "competitor_alert",
    name: "Competitor Price Alert",
    description: "Alert for competitor price changes",
    category: "notification",
    subject: "Competitor Alert: {competitor_name} changed prices",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #4F46E5;">Competitor Price Change Alert</h1>
  <p>Hi {"{customer_name}"},</p>
  
  <p>We've detected a significant price change from <strong>{"{competitor_name}"}</strong> that might affect your market position.</p>
  
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
    <h3 style="color: #4F46E5; margin-top: 0;">Price Change Details</h3>
    <p><strong>Product:</strong> {"{product_name}"}</p>
    <p><strong>Previous Price:</strong> ${"{comp_previous_price}"}</p>
    <p><strong>New Price:</strong> ${"{comp_new_price}"}</p>
    <p><strong>Change:</strong> <span style="color: {"{change_color}"}">{"{price_change_percentage}"}%</span></p>
    <p><strong>Your Current Price:</strong> ${"{your_price}"}</p>
  </div>
  
  <p>Based on your pricing rules, we recommend reviewing your pricing strategy for this product.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{product_analysis_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Price Analysis</a>
  </div>
  
  <p>Best regards,<br>The EaseSpotter Team</p>
</div>`
  }
];

interface EmailTemplateEditorProps {
  open: boolean;
  onClose: () => void;
  initialTemplate?: {
    id: string;
    name: string;
    description: string;
    subject: string;
    content: string;
    category: string;
  };
}

export function EmailTemplateEditor({ open, onClose, initialTemplate }: EmailTemplateEditorProps) {
  const [activeTab, setActiveTab] = useState("editor");
  const [previewVisible, setPreviewVisible] = useState(false);
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Initialize form with default values
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: initialTemplate ? {
      name: initialTemplate.name,
      description: initialTemplate.description,
      subject: initialTemplate.subject,
      content: initialTemplate.content,
      category: initialTemplate.category,
    } : {
      name: "",
      description: "",
      subject: "",
      content: "",
      category: "",
    },
  });

  useEffect(() => {
    if (initialTemplate) {
      form.reset({
        name: initialTemplate.name,
        description: initialTemplate.description,
        subject: initialTemplate.subject,
        content: initialTemplate.content,
        category: initialTemplate.category,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        subject: "",
        content: "",
        category: "",
      });
    }
  }, [initialTemplate, open, form]);

  // Real API mutation for saving template
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormValues) => {
      // Call the real API endpoint to create a template
      const response = await apiRequest(
        "POST", 
        "/api/marketing/email/templates", 
        {
          name: data.name,
          subject: data.subject,
          htmlContent: data.content
        }
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || "Failed to create email template");
      }
      
      return result.template;
    },
    onSuccess: () => {
      toast({
        title: "Template saved",
        description: initialTemplate ? "Template updated successfully" : "New template created successfully",
      });
      // Invalidate query cache to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/email/templates"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: TemplateFormValues) {
    saveTemplateMutation.mutate(values);
  }

  const handlePresetSelect = (presetId: string) => {
    const preset = templatePresets.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(presetId);
      form.setValue("name", preset.name);
      form.setValue("description", preset.description);
      form.setValue("subject", preset.subject);
      form.setValue("content", preset.content);
      form.setValue("category", preset.category);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialTemplate ? "Edit Email Template" : "Create Email Template"}</DialogTitle>
          <DialogDescription>
            {initialTemplate 
              ? "Update your email template for future use" 
              : "Create a reusable email template for your campaigns"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="presets">Template Presets</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-4 py-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Welcome Email" {...field} />
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
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <select
                            className={cn(
                              "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm",
                              "ring-offset-background file:border-0 file:bg-transparent",
                              "file:text-sm file:font-medium placeholder:text-muted-foreground",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            )}
                            value={field.value}
                            onChange={field.onChange}
                          >
                            <option value="">Select category</option>
                            {templateCategories.map(category => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Template description" {...field} />
                      </FormControl>
                      <FormDescription>
                        A short description of what this template is used for
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="Welcome to EaseSpotter!" {...field} />
                      </FormControl>
                      <FormDescription>
                        You can use placeholders like {"{customer_name}"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Email Content</FormLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewVisible(true)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder="Enter your HTML email content here..."
                          className="min-h-[300px] font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Use HTML for formatting. You can use placeholders like {"{customer_name}"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={saveTemplateMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveTemplateMutation.isPending}
                  >
                    {saveTemplateMutation.isPending ? (
                      <>Saving...</>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {initialTemplate ? "Update Template" : "Save Template"}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>

            {/* Email preview dialog */}
            <Dialog open={previewVisible} onOpenChange={setPreviewVisible}>
              <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Email Template Preview</DialogTitle>
                  <DialogDescription>
                    Here's how your email template will look
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label>Subject</Label>
                    <div className="p-3 border rounded-md text-sm mt-1">
                      {form.watch("subject") || "(No subject)"}
                    </div>
                  </div>

                  <div>
                    <Label>Content</Label>
                    <div className="border rounded-md p-4 mt-1 max-h-[50vh] overflow-auto">
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: form.watch("content") || "<p>(No content)</p>" }}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setPreviewVisible(false)}>
                    Close Preview
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="presets" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templatePresets.map(preset => (
                <div
                  key={preset.id}
                  className={cn(
                    "border rounded-md p-4 cursor-pointer hover:border-primary transition-all",
                    selectedPreset === preset.id && "border-primary ring-1 ring-primary"
                  )}
                  onClick={() => handlePresetSelect(preset.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{preset.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{preset.description}</p>
                    </div>
                    <div className="bg-primary/10 text-xs px-2 py-1 rounded-md text-primary">
                      {templateCategories.find(c => c.id === preset.category)?.name || preset.category}
                    </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="text-sm">
                    <strong>Subject: </strong>{preset.subject}
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Set up a draft copy
                        setSelectedPreset(preset.id);
                        form.setValue("name", `Copy of ${preset.name}`);
                        form.setValue("description", preset.description);
                        form.setValue("subject", preset.subject);
                        form.setValue("content", preset.content);
                        form.setValue("category", preset.category);
                        setActiveTab("editor");
                      }}
                    >
                      <CopyCheck className="mr-1 h-4 w-4" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePresetSelect(preset.id);
                        setActiveTab("editor");
                      }}
                    >
                      <Sparkles className="mr-1 h-4 w-4" />
                      Use Template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}