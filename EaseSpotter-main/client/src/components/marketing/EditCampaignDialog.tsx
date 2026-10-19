import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Check, ChevronsUpDown, Pencil } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// Schema is the same as for creating campaigns
const campaignSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().optional(),
  type: z.string().min(1, "Please select a campaign type"),
  targetSegment: z.string().min(1, "Please select a target segment"),
  budget: z.string().refine(val => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Budget must be a positive number",
  }),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  channels: z.array(z.string()).min(1, "Select at least one channel"),
  goals: z.object({
    sales: z.string().optional(),
    engagement: z.string().optional(),
    awareness: z.string().optional(),
  }).optional(),
  active: z.boolean().optional().default(false),
}).refine(data => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type CampaignFormValues = z.infer<typeof campaignSchema>;

const campaignTypes = [
  { label: "Email", value: "email" },
  { label: "Social Media", value: "social" },
  { label: "Search/PPC", value: "ppc" },
  { label: "Display", value: "display" },
  { label: "Content", value: "content" },
  { label: "Event", value: "event" },
];

const targetSegments = [
  { label: "All Customers", value: "all_customers" },
  { label: "New Customers", value: "new_customers" },
  { label: "VIP Customers", value: "vip_customers" },
  { label: "Inactive Customers", value: "inactive_customers" },
  { label: "Social Followers", value: "social_followers" },
  { label: "Blog Subscribers", value: "blog_subscribers" },
];

const marketingChannels = [
  { id: "email", label: "Email" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google Ads" },
  { id: "bing", label: "Bing Ads" },
  { id: "display", label: "Display Ads" },
  { id: "blog", label: "Blog" },
  { id: "youtube", label: "YouTube" },
  { id: "sms", label: "SMS" },
  { id: "webinar", label: "Webinar" },
];

interface Campaign {
  id: number;
  name: string;
  description?: string;
  type: string;
  status: string;
  startDate: Date | string;
  endDate?: Date | string;
  targetSegment: string;
  channels: string[];
  budget: number | string;
  goals?: {
    sales?: string;
    engagement?: string;
    awareness?: string;
  };
  active: boolean;
  vendorId: number;
  createdAt: string;
  updatedAt: string;
}

interface EditCampaignDialogProps {
  campaign: Campaign;
  triggerButton?: React.ReactNode;
}

export function EditCampaignDialog({ campaign, triggerButton }: EditCampaignDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Initialize form with campaign data
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: campaign.name,
      description: campaign.description || "",
      type: campaign.type,
      targetSegment: campaign.targetSegment,
      budget: typeof campaign.budget === 'number' 
        ? campaign.budget.toString() 
        : campaign.budget.toString(),
      startDate: new Date(campaign.startDate),
      endDate: campaign.endDate ? new Date(campaign.endDate) : new Date(),
      channels: campaign.channels || [],
      goals: campaign.goals || {
        sales: "",
        engagement: "",
        awareness: "",
      },
      active: campaign.active || false,
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async (values: CampaignFormValues) => {
      console.log("Updating campaign with values:", values);
      
      // Format the dates to ISO strings for proper serialization
      const formattedValues = {
        ...values,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
        budget: parseFloat(values.budget),
      };
      
      console.log("Formatted values:", formattedValues);
      
      try {
        const response = await apiRequest("PATCH", `/api/marketing/campaigns/${campaign.id}`, formattedValues);
        console.log("API response status:", response.status);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("API error response:", errorData);
          throw new Error(errorData.message || `Failed to update campaign (${response.status})`);
        }
        
        const result = await response.json();
        console.log("Success response:", result);
        return result;
      } catch (err) {
        console.error("Campaign update error:", err);
        throw err;
      }
    },
    onSuccess: (data) => {
      console.log("Campaign updated successfully:", data);
      
      // Close dialog
      setOpen(false);
      
      // Invalidate campaigns query to refresh list
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
      
      toast({
        title: "Campaign updated",
        description: "Your campaign has been updated successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Mutation error:", error);
      
      toast({
        title: "Failed to update campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: CampaignFormValues) {
    updateCampaignMutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Campaign</DialogTitle>
          <DialogDescription>
            Update the details for this campaign.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Spring Sale 2025" {...field} />
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
                      <Textarea 
                        placeholder="Describe your campaign objectives and goals" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a campaign type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {campaignTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="budget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="1000.00"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="targetSegment"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Target Audience</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? targetSegments.find(
                                  (segment) => segment.value === field.value
                                )?.label
                              : "Select audience segment"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search segments..." />
                          <CommandEmpty>No segment found.</CommandEmpty>
                          <CommandGroup>
                            {targetSegments.map((segment) => (
                              <CommandItem
                                value={segment.label}
                                key={segment.value}
                                onSelect={() => {
                                  form.setValue("targetSegment", segment.value);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    segment.value === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {segment.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
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
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
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
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="channels"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base">Marketing Channels</FormLabel>
                      <FormDescription>
                        Select the channels where this campaign will run.
                      </FormDescription>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {marketingChannels.map((channel) => (
                        <FormField
                          key={channel.id}
                          control={form.control}
                          name="channels"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={channel.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(channel.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, channel.id])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== channel.id
                                            )
                                          );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {channel.label}
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="space-y-4">
                <FormLabel className="text-base">Campaign Goals</FormLabel>
                <FormDescription>
                  Define specific numeric goals for this campaign (optional).
                </FormDescription>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="goals.sales"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sales Goal</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 10000" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="goals.engagement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engagement Goal</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 5000 clicks" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="goals.awareness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Awareness Goal</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 50000 impressions" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={updateCampaignMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={updateCampaignMutation.isPending}
              >
                {updateCampaignMutation.isPending ? "Updating..." : "Update Campaign"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}