import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Filter, Search, Mail, Share2, Tag, Eye, Calendar, FileDown, Download, ArrowUpRight, Edit, Loader2, DollarSign } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { CreateCampaignDialog } from "./CreateCampaignDialog";
import { EditCampaignDialog } from "./EditCampaignDialog";
import { useIsMobile } from "@/hooks/use-mobile";

interface Campaign {
  id: number;
  name: string;
  type: string;
  status: string;
  startDate: Date | string;
  endDate?: Date | string;
  targetSegment: string;
  channels: string[];
  budget: number | string; // Updated to handle both number and string types
  performance?: {
    engagement?: number;
    conversions?: number;
  };
  vendorId: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  description?: string;
  goals?: {
    sales?: string;
    engagement?: string;
    awareness?: string;
  };
}

export function MarketingCampaigns() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Fetch marketing campaigns from API
  const { data: campaigns = [], isLoading, error } = useQuery<Campaign[]>({
    queryKey: ["/api/marketing/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/marketing/campaigns");
      if (!res.ok) {
        throw new Error("Failed to fetch campaigns");
      }
      return res.json();
    },
  });

  // Apply filters
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesType = typeFilter === "all" || campaign.type === typeFilter;
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    const matchesSearch = searchTerm === "" || 
      campaign.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesType && matchesStatus && matchesSearch;
  });

  // Helper function to get campaign type icon
  const getCampaignTypeIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'social':
        return <Share2 className="h-4 w-4" />;
      case 'ppc':
        return <Tag className="h-4 w-4" />;
      case 'display':
        return <Eye className="h-4 w-4" />;
      case 'content':
        return <FileDown className="h-4 w-4" />;
      case 'event':
        return <Calendar className="h-4 w-4" />;
      default:
        return <Megaphone className="h-4 w-4" />;
    }
  };

  // Helper function to get campaign status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'draft':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Helper function to get channels display text
  const getChannelsText = (channels: string[]) => {
    if (!channels || channels.length === 0) return "No channels";
    if (channels.length <= 2) return channels.join(", ");
    return `${channels[0]}, ${channels[1]} +${channels.length - 2}`;
  };

  // Helper to format date
  const formatDate = (dateStr: string | Date) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch (e) {
      return "Invalid date";
    }
  };

  // Get mobile status
  const isMobile = useIsMobile();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Marketing Campaigns</h2>
        <CreateCampaignDialog />
      </div>
      
      {/* Responsive filter controls */}
      <div className={`${isMobile ? 'flex flex-col space-y-3' : 'flex items-center'} gap-4 mb-4`}>
        <div className="flex-1 flex items-center border rounded-md px-3 py-1">
          <Search className="h-4 w-4 text-muted-foreground mr-2" />
          <Input 
            placeholder="Search campaigns..." 
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className={`flex ${isMobile ? 'w-full' : ''} gap-2`}>
          <Select 
            defaultValue="all"
            onValueChange={(value) => setTypeFilter(value)}
          >
            <SelectTrigger className={isMobile ? "flex-1" : "w-[150px]"}>
              <SelectValue placeholder="Campaign type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="social">Social Media</SelectItem>
              <SelectItem value="ppc">PPC/Search</SelectItem>
              <SelectItem value="display">Display</SelectItem>
              <SelectItem value="content">Content</SelectItem>
              <SelectItem value="event">Event</SelectItem>
            </SelectContent>
          </Select>
          
          <Select 
            defaultValue="all"
            onValueChange={(value) => setStatusFilter(value)}
          >
            <SelectTrigger className={isMobile ? "flex-1" : "w-[150px]"}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Loading and error states */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-destructive">
          <p>Error loading campaigns. Please try again.</p>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          {!isMobile && (
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <div className="grid grid-cols-12 p-4 border-b bg-muted/40">
                    <div className="col-span-4 font-medium">Campaign</div>
                    <div className="col-span-2 font-medium">Date</div>
                    <div className="col-span-2 font-medium">Target Audience</div>
                    <div className="col-span-1 font-medium">Status</div>
                    <div className="col-span-2 font-medium">Budget</div>
                    <div className="col-span-1 font-medium text-right">Actions</div>
                  </div>
                  
                  {filteredCampaigns.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No campaigns found. Try adjusting your filters or create a new campaign.
                    </div>
                  ) : (
                    filteredCampaigns.map(campaign => (
                      <div key={campaign.id} className="grid grid-cols-12 p-4 border-b hover:bg-muted/20">
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {getCampaignTypeIcon(campaign.type)}
                          </div>
                          <div>
                            <div className="font-medium">{campaign.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {getChannelsText(campaign.channels)}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 flex flex-col justify-center">
                          <div className="text-sm">{formatDate(campaign.startDate)}</div>
                          {campaign.endDate && (
                            <div className="text-xs text-muted-foreground">
                              to {formatDate(campaign.endDate)}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 flex items-center">
                          {campaign.targetSegment}
                        </div>
                        <div className="col-span-1 flex items-center">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <div className="col-span-2 flex flex-col justify-center">
                          <div className="text-sm font-medium">
                            ${typeof campaign.budget === 'number' 
                              ? campaign.budget.toFixed(2) 
                              : parseFloat(campaign.budget as string).toFixed(2)}
                          </div>
                          {campaign.performance ? (
                            <div className="text-xs text-muted-foreground">
                              {campaign.performance.conversions || 0} conversions
                            </div>
                          ) : null}
                        </div>
                        <div className="col-span-1 flex justify-end items-center">
                          <EditCampaignDialog campaign={campaign} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Mobile card view */}
          {isMobile && (
            <div className="grid grid-cols-1 gap-4">
              {filteredCampaigns.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-md">
                  No campaigns found. Try adjusting your filters or create a new campaign.
                </div>
              ) : (
                filteredCampaigns.map(campaign => (
                  <Card key={campaign.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {getCampaignTypeIcon(campaign.type)}
                          </div>
                          <div>
                            <div className="font-medium">{campaign.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {getChannelsText(campaign.channels)}
                            </div>
                          </div>
                        </div>
                        <Badge className={getStatusColor(campaign.status)}>
                          {campaign.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pb-2">
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Dates:</span>
                        </div>
                        <div>
                          {formatDate(campaign.startDate)}
                          {campaign.endDate && (
                            <span className="text-xs text-muted-foreground"> to {formatDate(campaign.endDate)}</span>
                          )}
                        </div>
                        
                        <div>
                          <span className="text-muted-foreground">Target:</span>
                        </div>
                        <div>{campaign.targetSegment}</div>
                        
                        <div>
                          <span className="text-muted-foreground">Budget:</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">
                            {typeof campaign.budget === 'number' 
                              ? campaign.budget.toFixed(2) 
                              : parseFloat(campaign.budget as string).toFixed(2)}
                          </span>
                        </div>
                        
                        {campaign.performance && (
                          <>
                            <div>
                              <span className="text-muted-foreground">Conversions:</span>
                            </div>
                            <div>{campaign.performance.conversions || 0}</div>
                          </>
                        )}
                      </div>
                    </CardContent>
                    
                    <CardFooter className="flex justify-end pt-0">
                      <EditCampaignDialog campaign={campaign} />
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          )}
          
          <div className="flex justify-end mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {filteredCampaigns.length} of {campaigns.length} campaigns
            </div>
          </div>
        </>
      )}
    </div>
  );
}