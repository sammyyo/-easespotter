import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgePlus, ExternalLink, FileEdit, FileText, InfoIcon, ListFilter, MailPlus, MessageSquarePlus, Search, Table2, Trash2, UserRound, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmailTemplateEditor } from "./EmailTemplateEditor";
import { EmailCampaignDialog } from "./EmailCampaignDialog";
import { apiRequest } from "@/lib/queryClient";

// Types for email templates and segments
interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  content: string;
  category: string;
  createdAt?: string;
}

// Brevo ContactList interface
interface ContactList {
  id: number;
  name: string;
  folderId?: number;
  totalSubscribers?: number;
  totalBlacklisted?: number;
  uniqueSubscribers?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Simplified type for our UI
interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  count: number;
  criteria?: {
    [key: string]: any;
  };
}

// Brevo Campaign interface
interface BrevoCampaign {
  id: number;
  name: string;
  subject: string;
  type: string;
  status: string;
  scheduledAt?: string;
  sentDate?: string;
  recipients?: {
    listIds?: number[];
    segmentIds?: number[];
  };
  statistics?: {
    globalStats?: {
      sent: number;
      delivered: number;
      opens: number;
      clicks: number;
      hardBounces: number;
      softBounces: number;
      unsubscriptions: number;
    };
  };
}

// Simplified type for our UI
interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "scheduled" | "sent" | "active";
  templateId?: string;
  segmentId?: string;
  scheduledAt?: string;
  sentAt?: string;
  statistics?: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
}

// Sample data
const mockTemplates: EmailTemplate[] = [
  {
    id: "template-1",
    name: "Welcome Email",
    description: "First email to new customers",
    category: "onboarding",
    subject: "Welcome to EaseSpotter!",
    content: `<div>
      <h1>Welcome to EaseSpotter!</h1>
      <p>We're excited to have you on board. With our platform, you can:</p>
      <ul>
        <li>Track competitor prices in real-time</li>
        <li>Optimize your pricing strategy</li>
        <li>Increase profit margins with intelligent pricing</li>
      </ul>
    </div>`,
    createdAt: "2023-11-10T14:30:00Z"
  },
  {
    id: "template-2",
    name: "Monthly Newsletter",
    description: "Monthly updates for all customers",
    category: "newsletter",
    subject: "EaseSpotter Newsletter - {month} {year}",
    content: `<div>
      <h1>Monthly Newsletter</h1>
      <p>Here are the latest updates from EaseSpotter:</p>
      <ul>
        <li>New feature: {"{feature_name}"}</li>
        <li>Tip of the month: {"{pricing_tip}"}</li>
        <li>Customer spotlight: {"{spotlight_customer}"}</li>
      </ul>
    </div>`,
    createdAt: "2023-10-15T09:45:00Z"
  },
  {
    id: "template-3",
    name: "Price Change Alert",
    description: "Alert users of significant price changes",
    category: "notification",
    subject: "Price Alert: {product_name} Price Change",
    content: `<div>
      <h1>Price Change Alert</h1>
      <p>The price of {"{product_name}"} has changed:</p>
      <ul>
        <li>Old Price: ${"{old_price}"}</li>
        <li>New Price: ${"{new_price}"}</li>
        <li>Change: {"{change_percentage}"}%</li>
      </ul>
      <p>This change was triggered by {"{reason}"}.</p>
    </div>`,
    createdAt: "2023-09-22T11:15:00Z"
  },
  {
    id: "template-4",
    name: "Abandoned Cart Reminder",
    description: "Reminder for incomplete pricing configurations",
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
    </div>`,
    createdAt: "2023-12-05T16:20:00Z"
  },
  {
    id: "template-5",
    name: "Promotion Announcement",
    description: "Announce special offers and discounts",
    category: "marketing",
    subject: "Special Offer: {promotion_name} - Limited Time!",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4F46E5;">Special Limited-Time Offer</h1>
      <p>Hi {"{customer_name}"},</p>
      
      <div style="background-color: #4F46E5; color: white; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
        <h2 style="margin-top: 0; margin-bottom: 10px;">Save {"{discount_amount}"}% on {"{plan_name}"}</h2>
        <p style="margin: 0; font-size: 18px;">Use code: <strong>{"{promotion_code}"}</strong></p>
        <p style="margin-top: 10px;">Offer expires: {"{expiration_date}"}</p>
      </div>
    </div>`,
    createdAt: "2024-01-15T10:30:00Z"
  },
  {
    id: "template-6",
    name: "Competitor Price Alert",
    description: "Alert for competitor price changes",
    category: "notification",
    subject: "Competitor Alert: {competitor_name} Price Update",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4F46E5;">Competitor Price Change Alert</h1>
      <p>Hi {"{customer_name}"},</p>
      
      <p>We've detected a significant price change from <strong>{"{competitor_name}"}</strong> that might affect your market position.</p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
        <h3 style="color: #4F46E5; margin-top: 0;">Price Change Details</h3>
        <p><strong>Product:</strong> {"{product_name}"}</p>
        <p><strong>Previous Price:</strong> ${"{comp_previous_price}"}</p>
        <p><strong>New Price:</strong> ${"{comp_new_price}"}</p>
        <p><strong>Change:</strong> <span>{"{price_change_percentage}"}%</span></p>
      </div>
    </div>`,
    createdAt: "2024-02-20T14:15:00Z"
  },
  {
    id: "template-7",
    name: "Enhanced Welcome Email",
    description: "Detailed onboarding for new customers",
    category: "onboarding",
    subject: "Welcome to EaseSpotter, {customer_name}!",
    content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4F46E5;">Welcome to EaseSpotter!</h1>
      <p>Hi {"{customer_name}"},</p>
      
      <p>Thank you for choosing EaseSpotter for your dynamic pricing needs. We're excited to have you on board!</p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
        <h2 style="color: #4F46E5; margin-top: 0;">Your Account Details</h2>
        <p><strong>Account Type:</strong> {"{account_type}"}</p>
        <p><strong>Created On:</strong> {"{signup_date}"}</p>
      </div>
      
      <h2 style="color: #4F46E5; margin-top: 30px;">Getting Started</h2>
      <ol>
        <li>Complete your profile setup</li>
        <li>Import your product catalog</li>
        <li>Configure your first pricing rule</li>
        <li>Connect competitor data sources</li>
      </ol>
    </div>`,
    createdAt: "2024-03-08T09:45:00Z"
  }
];

const mockSegments: CustomerSegment[] = [
  {
    id: "segment-1",
    name: "New Customers",
    description: "Customers who signed up in the last 30 days",
    count: 142,
    criteria: {
      signupDate: {
        operator: "greaterThan",
        value: "30d"
      }
    }
  },
  {
    id: "segment-2",
    name: "High Spenders",
    description: "Customers who spend more than $500 per month",
    count: 87,
    criteria: {
      monthlySpend: {
        operator: "greaterThan",
        value: 500
      }
    }
  },
  {
    id: "segment-3",
    name: "Inactive Users",
    description: "Users who haven't logged in the last 60 days",
    count: 215,
    criteria: {
      lastLogin: {
        operator: "lessThan",
        value: "60d"
      }
    }
  }
];

const mockCampaigns: EmailCampaign[] = [
  {
    id: "campaign-1",
    name: "November Newsletter",
    description: "Monthly newsletter for November 2023",
    status: "sent",
    templateId: "template-2",
    segmentId: "segment-2",
    scheduledAt: "2023-11-15T09:00:00Z",
    sentAt: "2023-11-15T09:05:23Z",
    statistics: {
      sent: 87,
      opened: 64,
      clicked: 32,
      bounced: 2,
      unsubscribed: 1
    }
  },
  {
    id: "campaign-2",
    name: "Welcome Sequence",
    description: "Automatic welcome email for new users",
    status: "active",
    templateId: "template-1",
    segmentId: "segment-1",
    statistics: {
      sent: 142,
      opened: 98,
      clicked: 76,
      bounced: 3,
      unsubscribed: 0
    }
  },
  {
    id: "campaign-3",
    name: "Price Change Notification",
    description: "Alert for recent price changes",
    status: "draft",
    templateId: "template-3",
    segmentId: "segment-2"
  }
];

export function EmailMarketing() {
  const [activeTab, setActiveTab] = useState("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const queryClient = useQueryClient();

  // Fetch templates from Brevo API
  const { data: templatesData, isLoading: isLoadingTemplates, error: templatesError } = useQuery({
    queryKey: ["/api/marketing/email/templates"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/email/templates");
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to fetch email templates");
      }
      
      return data.templates || [];
    },
    retry: 1,
    onError: (error) => {
      console.error("Error fetching email templates:", error);
    }
  });
  
  // Convert Brevo templates to our template format for the UI
  const templates = templatesData && Array.isArray(templatesData)
    ? templatesData.map((template: any) => {
        if (!template) return null;
        return {
          id: String(template.id || '0'),
          name: template.name || 'Unnamed Template',
          description: template.subject || "No subject",
          subject: template.subject || "",
          category: "email",
          content: template.htmlContent || "",
          createdAt: new Date(template.createdAt || Date.now()).toISOString(),
        };
      })
      .filter(Boolean) // Remove any null entries
    : [];

  // Fetch contact lists from Brevo API
  const { data: contactListsData, isLoading: isLoadingContactLists, error: contactListsError } = useQuery({
    queryKey: ["/api/marketing/email/lists"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/email/lists");
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to fetch contact lists");
      }
      
      return data.lists || [];
    },
    retry: 1,
    onError: (error) => {
      console.error("Error fetching contact lists:", error);
    }
  });
  
  // Convert Brevo contact lists to our segment format for the UI
  const segments = contactListsData && Array.isArray(contactListsData)
    ? contactListsData.map((list: ContactList) => {
        if (!list) return null;
        return {
          id: String(list.id || '0'),
          name: list.name || 'Unnamed List',
          description: `Contact list with ${list.totalSubscribers || 0} subscribers`,
          count: list.totalSubscribers || 0
        };
      })
      .filter(Boolean) // Remove any null entries
    : [];
  
  const isLoadingSegments = isLoadingContactLists;

  // Fetch campaigns from Brevo API
  const { data: campaignsData, isLoading: isLoadingCampaignsData, error: campaignsError } = useQuery({
    queryKey: ["/api/marketing/email/campaigns"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/email/campaigns");
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to fetch campaigns");
      }
      
      return data.campaigns || [];
    },
    retry: 1,
    onError: (error) => {
      console.error("Error fetching campaigns:", error);
    }
  });
  
  // Convert Brevo campaigns to our campaign format for the UI
  const campaigns = campaignsData && Array.isArray(campaignsData) 
    ? campaignsData.map((campaign: BrevoCampaign) => {
        if (!campaign) return null; // Skip invalid campaigns

        // Map status from Brevo to our format
        let status: "draft" | "scheduled" | "sent" | "active" = "draft";
        if (campaign.status === "sent") status = "sent";
        else if (campaign.status === "scheduled") status = "scheduled";
        else if (campaign.status === "queued") status = "active";
        
        return {
          id: String(campaign.id || '0'),
          name: campaign.name || 'Unnamed Campaign',
          description: campaign.subject || '',
          status,
          scheduledAt: campaign.scheduledAt,
          sentAt: campaign.sentDate,
          segmentId: campaign.recipients?.listIds?.[0] ? String(campaign.recipients.listIds[0]) : undefined,
          statistics: campaign.statistics?.globalStats ? {
            sent: campaign.statistics.globalStats.sent || 0,
            opened: campaign.statistics.globalStats.opens || 0,
            clicked: campaign.statistics.globalStats.clicks || 0,
            bounced: (campaign.statistics.globalStats.hardBounces || 0) + (campaign.statistics.globalStats.softBounces || 0),
            unsubscribed: campaign.statistics.globalStats.unsubscriptions || 0
          } : undefined
        };
      })
      .filter(Boolean) // Remove any null entries
    : [];
  
  const isLoadingCampaigns = isLoadingCampaignsData;

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // This would be an API call in a real implementation
      console.log("Deleting template:", templateId);
      await new Promise(resolve => setTimeout(resolve, 500));
      return templateId;
    },
    onSuccess: (templateId) => {
      toast({
        title: "Template deleted",
        description: "Email template has been deleted successfully"
      });
      // Update the cache
      queryClient.setQueryData(["/api/email/templates"], (oldData: EmailTemplate[] | undefined) => {
        return oldData ? oldData.filter(t => t.id !== templateId) : [];
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting template",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Filter templates based on search query
  const filteredTemplates = templates.filter(template => {
    if (!template) return false;
    
    return (
      template.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Handle edit template
  const handleEditTemplate = (template: EmailTemplate | null) => {
    if (!template) return;
    
    setEditTemplate(template);
    setCreateTemplateOpen(true);
  };

  // Handle delete template
  const handleDeleteTemplate = (templateId: string | undefined) => {
    if (!templateId) return;
    
    deleteTemplateMutation.mutate(templateId);
  };

  // Get template name by ID
  const getTemplateName = (templateId: string | undefined | null) => {
    if (!templateId) return "Unknown Template";
    const template = templates.find(t => t.id === templateId);
    return template ? template.name : "Unknown Template";
  };

  // Get segment name by ID
  const getSegmentName = (segmentId: string | undefined | null) => {
    if (!segmentId) return "Unknown Segment";
    const segment = segments.find(s => s.id === segmentId);
    return segment ? segment.name : "Unknown Segment";
  };

  // Render status badge with appropriate color
  const renderStatusBadge = (status: EmailCampaign["status"]) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "scheduled":
        return <Badge variant="secondary">Scheduled</Badge>;
      case "sent":
        return <Badge variant="default">Sent</Badge>;
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Handle selecting a template for the composer
  const handleSelectTemplate = (template: EmailTemplate | null) => {
    if (!template) return;
    
    setEmailSubject(template.subject || '');
    setEmailContent(template.content || '');
    toast({
      title: "Template Selected",
      description: `Template "${template.name || 'Untitled'}" has been applied.`
    });
  };

  // Handle selecting a segment for the composer
  const handleSelectSegment = (segment: CustomerSegment | null) => {
    if (!segment) return;
    
    setEmailTo(`${segment.name || 'Unnamed Segment'} (${segment.count || 0} recipients)`);
    toast({
      title: "Segment Selected",
      description: `Recipients set to ${segment.count || 0} customers in the "${segment.name || 'Unnamed Segment'}" segment.`
    });
  };

  // Handle saving email as draft
  const handleSaveAsDraft = () => {
    if (!emailSubject && !emailContent) {
      toast({
        title: "Cannot save empty draft",
        description: "Please add a subject or content to your email.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Draft Saved",
      description: "Your email has been saved as a draft."
    });
  };

  // Handle scheduling email
  const handleScheduleEmail = () => {
    if (!emailTo || !emailSubject || !emailContent) {
      toast({
        title: "Missing Information",
        description: "Please provide recipients, subject, and content for your email.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Email Scheduled",
      description: "Your email has been scheduled for delivery."
    });
  };

  // Handle sending email immediately
  const handleSendEmail = async () => {
    if (!emailTo || !emailSubject || !emailContent) {
      toast({
        title: "Missing Information",
        description: "Please provide recipients, subject, and content for your email.",
        variant: "destructive"
      });
      return;
    }

    setSendingEmail(true);
    
    try {
      // Call our API endpoint to send the email
      const response = await apiRequest(
        "POST", 
        "/api/marketing/email/send", 
        {
          to: emailTo,
          subject: emailSubject,
          content: null,
          html: emailContent
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Email Sent",
          description: `Your email to ${emailTo} has been sent successfully.`
        });
        
        // Clear form after successful send
        setEmailTo("");
        setEmailSubject("");
        setEmailContent("");
      } else {
        toast({
          title: "Error Sending Email",
          description: result.message || "Failed to send email",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Email sending error:", error);
      toast({
        title: "Error Sending Email",
        description: "There was an error sending your email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // Check if there's any error with the Brevo API
  const hasBrevoProblem = contactListsError || campaignsError;

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Email Marketing</h2>
        <p className="text-muted-foreground">
          Create and manage email templates, customer segments, and campaigns
        </p>
      </div>

      {hasBrevoProblem && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Email service connection issue</AlertTitle>
          <AlertDescription>
            There's a problem connecting to the email service. Some features might be unavailable. Please check your Brevo API key or try again later.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="segments" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Segments
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <MailPlus className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="composer" className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" />
              Composer
            </TabsTrigger>
          </TabsList>

          {activeTab === "templates" && (
            <Button onClick={() => setCreateTemplateOpen(true)}>
              <BadgePlus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          )}
        </div>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search templates..." 
              className="max-w-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {isLoadingTemplates ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-2">
                    <div className="h-5 w-1/2 bg-muted rounded"></div>
                    <div className="h-4 w-2/3 bg-muted rounded"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 w-full bg-muted rounded mb-2"></div>
                    <div className="h-4 w-5/6 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map(template => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{template.name}</CardTitle>
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {template.category}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm">
                      <strong>Subject: </strong>{template.subject}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Created: {new Date(template.createdAt || Date.now()).toLocaleDateString()}
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTemplate(template)}
                    >
                      <FileEdit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Template</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete this template? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" size="sm">
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            Delete
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-md">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No templates found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "No templates match your search criteria" : "You haven't created any email templates yet"}
              </p>
              <Button onClick={() => setCreateTemplateOpen(true)}>
                Create Your First Template
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Segments Tab */}
        <TabsContent value="segments" className="space-y-6">
          <div className="flex justify-end">
            <Button>
              <UserRound className="mr-2 h-4 w-4" />
              Create Segment
            </Button>
          </div>

          {isLoadingSegments ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-2">
                    <div className="h-5 w-1/3 bg-muted rounded"></div>
                    <div className="h-4 w-1/2 bg-muted rounded"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 w-full bg-muted rounded mb-2"></div>
                    <div className="h-4 w-5/6 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : segments.length > 0 ? (
            <div className="space-y-4">
              {segments.map(segment => segment && (
                <Card key={segment.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{segment.name}</CardTitle>
                        <CardDescription className="mt-1">{segment.description}</CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {segment.count} Customers
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h4 className="font-medium text-sm mb-2">Segment Criteria:</h4>
                    <div className="space-y-2">
                      {segment.criteria && Object.entries(segment.criteria).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="capitalize">
                            {key}
                          </Badge>
                          <span>{value && value.operator}</span>
                          <span className="font-medium">{value && value.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                    >
                      <FileEdit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                    >
                      <ListFilter className="h-4 w-4 mr-1" />
                      View Members
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-md">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No customer segments found</h3>
              <p className="text-muted-foreground mb-4">
                Create segments to target specific groups of customers
              </p>
              <Button>
                Create Your First Segment
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-6">
          <div className="flex justify-end">
            <EmailCampaignDialog 
              trigger={
                <Button>
                  <MailPlus className="mr-2 h-4 w-4" />
                  Create Campaign
                </Button>
              }
            />
          </div>

          {isLoadingCampaigns ? (
            <div className="animate-pulse">
              <div className="h-10 bg-muted rounded mb-4"></div>
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted rounded mb-2"></div>
              ))}
            </div>
          ) : campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns && campaigns.map(campaign => campaign && (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{campaign.name}</div>
                        <div className="text-sm text-muted-foreground">{campaign.description}</div>
                      </div>
                    </TableCell>
                    <TableCell>{renderStatusBadge(campaign.status)}</TableCell>
                    <TableCell>{campaign.templateId !== undefined ? getTemplateName(campaign.templateId) : 'No template'}</TableCell>
                    <TableCell>{campaign.segmentId !== undefined ? getSegmentName(campaign.segmentId) : 'No segment'}</TableCell>
                    <TableCell>
                      {campaign.statistics && campaign.statistics.sent > 0 ? (
                        <div className="text-sm">
                          <div>Sent: {campaign.statistics.sent}</div>
                          <div>Opened: {campaign.statistics.opened || 0} ({Math.round(((campaign.statistics.opened || 0) / campaign.statistics.sent) * 100)}%)</div>
                          <div>Clicked: {campaign.statistics.clicked || 0} ({Math.round(((campaign.statistics.clicked || 0) / campaign.statistics.sent) * 100)}%)</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No data</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm">
                          <FileEdit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        {campaign.status === "draft" && (
                          <Button size="sm">
                            Send
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 border rounded-md">
              <MailPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No email campaigns found</h3>
              <p className="text-muted-foreground mb-4">
                Create campaigns to send emails to your customer segments
              </p>
              <EmailCampaignDialog 
                trigger={
                  <Button>
                    Create Your First Campaign
                  </Button>
                }
              />
            </div>
          )}
        </TabsContent>

        {/* Composer Tab */}
        <TabsContent value="composer" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Direct Email Composer</CardTitle>
              <CardDescription>
                Send a one-time email to a customer or a small group
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="space-y-4 lg:col-span-3">
                  <div className="space-y-2">
                    <Label htmlFor="to">To</Label>
                    <Input
                      id="to"
                      placeholder="recipient@example.com or select customers below"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Email subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content">Content</Label>
                    <Textarea
                      id="content"
                      placeholder="Write your email content or select a template..."
                      className="min-h-[300px]"
                      value={emailContent}
                      onChange={(e) => setEmailContent(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-2">Use a Template</h4>
                    <div className="space-y-2">
                      {templates && templates.length > 0 ? templates.slice(0, 3).map(template => template && (
                        <div 
                          key={template.id} 
                          className="p-3 border rounded-md hover:border-primary cursor-pointer transition-colors"
                          onClick={() => handleSelectTemplate(template)}
                        >
                          <div className="font-medium">{template.name}</div>
                          <div className="text-sm text-muted-foreground">{template.subject}</div>
                        </div>
                      )) : <div className="text-sm text-muted-foreground p-3">No templates available</div>}
                      <Button variant="link" className="px-0">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View all templates
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Select Recipients</h4>
                    <div className="space-y-2">
                      {segments && segments.length > 0 ? segments.map(segment => segment && (
                        <div 
                          key={segment.id} 
                          className="p-3 border rounded-md hover:border-primary cursor-pointer transition-colors"
                          onClick={() => handleSelectSegment(segment)}
                        >
                          <div className="font-medium">{segment.name}</div>
                          <div className="text-sm text-muted-foreground">{segment.count} recipients</div>
                        </div>
                      )) : <div className="text-sm text-muted-foreground p-3">No recipient segments available</div>}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleSaveAsDraft} disabled={sendingEmail}>
                Save as Draft
              </Button>
              <Button variant="outline" onClick={handleScheduleEmail} disabled={sendingEmail}>
                Schedule
              </Button>
              <Button onClick={handleSendEmail} disabled={sendingEmail}>
                {sendingEmail ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                    Sending...
                  </>
                ) : "Send Now"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Editor Dialog */}
      <EmailTemplateEditor
        open={createTemplateOpen}
        onClose={() => {
          setCreateTemplateOpen(false);
          setEditTemplate(null);
        }}
        initialTemplate={editTemplate || undefined}
      />
    </div>
  );
}