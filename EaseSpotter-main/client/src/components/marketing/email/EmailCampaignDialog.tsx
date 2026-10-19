import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Define the campaign schema for form validation
const emailCampaignSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  templateId: z.number({
    required_error: "Please select a template",
  }),
  listIds: z.array(z.number()).min(1, "Please select at least one contact list"),
  subject: z.string().optional(),
  scheduledAt: z.date().optional(),
});

type EmailCampaignFormValues = z.infer<typeof emailCampaignSchema>;

interface EmailCampaignDialogProps {
  trigger?: React.ReactNode;
}

interface EmailTemplate {
  id: number;
  name: string;
}

interface ContactList {
  id: number;
  name: string;
}

export function EmailCampaignDialog({ trigger }: EmailCampaignDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/marketing/email/templates"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/marketing/email/templates");
        const data = await response.json();
        
        if (!data.success) {
          console.error("Error fetching templates:", data.error);
          return [];
        }
        
        // Make sure templates is an array and each template has the expected properties
        return Array.isArray(data.templates) 
          ? data.templates.map((template: any) => ({
              id: template.id || 0,
              name: template.name || "Unnamed Template"
            }))
          : [];
      } catch (error) {
        console.error("Error fetching templates:", error);
        return [];
      }
    },
    enabled: open, // Only fetch when dialog is open
  });

  // Fetch contact lists
  const { data: contactLists = [] } = useQuery<ContactList[]>({
    queryKey: ["/api/marketing/email/lists"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/marketing/email/lists");
        const data = await response.json();
        
        if (!data.success) {
          console.error("Error fetching contact lists:", data.error);
          return [];
        }
        
        // Make sure lists is an array and each list has the expected properties
        return Array.isArray(data.lists) 
          ? data.lists.map((list: any) => ({
              id: list.id || 0,
              name: list.name || "Unnamed List"
            }))
          : [];
      } catch (error) {
        console.error("Error fetching contact lists:", error);
        return [];
      }
    },
    enabled: open, // Only fetch when dialog is open
  });

  const form = useForm<EmailCampaignFormValues>({
    resolver: zodResolver(emailCampaignSchema),
    defaultValues: {
      name: "",
      subject: "",
      listIds: [],
      templateId: undefined,
      scheduledAt: undefined
    },
  });
  
  // Reset form when dialog is closed
  useEffect(() => {
    if (!open) {
      // Reset form when dialog is closed
      setTimeout(() => {
        form.reset({
          name: "",
          subject: "",
          listIds: [],
          templateId: undefined,
          scheduledAt: undefined
        });
      }, 300);
    }
  }, [open, form]);

  const createCampaignMutation = useMutation({
    mutationFn: async (values: EmailCampaignFormValues) => {
      try {
        // Format the data for the API
        const formattedValues = {
          ...values,
          scheduledAt: values.scheduledAt ? values.scheduledAt.toISOString() : undefined,
        };
        
        console.log('Submitting campaign with values:', formattedValues);
        
        const response = await apiRequest("POST", "/api/marketing/email/campaigns", formattedValues);
        const data = await response.json();
        
        console.log('Campaign creation response:', data);
        
        if (!response.ok) {
          throw new Error(data.error || data.message || `Failed to create campaign (${response.status})`);
        }
        
        // Check for success based on the API response format
        if (data && data.success === false) {
          throw new Error(data.error || 'Failed to create campaign');
        }
        
        return data;
      } catch (error) {
        console.error('Error creating campaign:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Campaign created successfully:', data);
      
      // Reset form and close dialog
      form.reset();
      setOpen(false);
      
      // Invalidate campaigns query to refresh list
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/email/campaigns"] });
      
      toast({
        title: "Campaign created",
        description: "Your email campaign has been created successfully",
      });
    },
    onError: (error: Error) => {
      console.error('Campaign creation error:', error);
      
      toast({
        title: "Failed to create campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: EmailCampaignFormValues) {
    // Log the values being submitted to help with debugging
    console.log('Submitting campaign form with values:', values);
    
    // Check if templateId and listIds are valid before submitting
    if (!values.templateId) {
      toast({
        title: "Template required",
        description: "Please select an email template",
        variant: "destructive",
      });
      return;
    }
    
    if (!values.listIds || values.listIds.length === 0) {
      toast({
        title: "Contact lists required",
        description: "Please select at least one contact list",
        variant: "destructive",
      });
      return;
    }
    
    createCampaignMutation.mutate(values);
  }

  const handleOpenChange = (newOpen: boolean) => {
    // If closing the dialog and a submission is not in progress
    if (!newOpen && !createCampaignMutation.isPending) {
      setOpen(newOpen);
    } else if (newOpen) {
      // If opening the dialog
      setOpen(true);
    }
    // Don't close if submission is in progress
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || <Button>Create Email Campaign</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Email Campaign</DialogTitle>
          <DialogDescription>
            Create a new email campaign to send to your contacts.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Campaign Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Monthly Newsletter" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email Template */}
            <FormField
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Template</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem
                          key={template.id}
                          value={template.id.toString()}
                        >
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contact Lists */}
            <FormField
              control={form.control}
              name="listIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Lists</FormLabel>
                  <div className="space-y-2">
                    {contactLists.map((list) => (
                      <div key={list.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`list-${list.id}`}
                          checked={field.value?.includes(list.id)}
                          onChange={(e) => {
                            const currentValues = [...(field.value || [])];
                            if (e.target.checked) {
                              field.onChange([...currentValues, list.id]);
                            } else {
                              field.onChange(currentValues.filter(id => id !== list.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor={`list-${list.id}`} className="text-sm">
                          {list.name}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email Subject */}
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject Line (Optional)</FormLabel>
                  <FormDescription>
                    Leave empty to use the template's subject
                  </FormDescription>
                  <FormControl>
                    <Input placeholder="Our Monthly Newsletter" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Schedule Date */}
            <FormField
              control={form.control}
              name="scheduledAt"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Schedule for later (Optional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={"w-full pl-3 text-left font-normal"}
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
                    Select a future date to schedule this campaign
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createCampaignMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createCampaignMutation.isPending}
              >
                {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
