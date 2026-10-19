import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABTestingDashboard } from "./a-b-testing/ABTestingDashboard";
import { CustomerJourneyMap } from "./journey-mapping/CustomerJourneyMap";
import { PredictiveAnalytics } from "./predictive/PredictiveAnalytics";
import { PersonalizationEngine } from "./personalization/PersonalizationEngine";
import { CampaignROIDashboard } from "./roi-dashboard/CampaignROIDashboard";
import { MarketingCalendar } from "./calendar/MarketingCalendar";
import { MarketingCampaigns } from "./MarketingCampaigns";
import { EmailMarketing } from "./email/EmailMarketing";
import { Megaphone, Users, BarChart3, LineChart, Target, BarChart, PieChart, Calendar, Tag, Mail } from "lucide-react";

export function MarketingDashboard() {
  const [activeTab, setActiveTab] = useState("campaigns");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Marketing</h1>
        <p className="text-muted-foreground">
          Create, manage, and analyze your marketing campaigns and customer segments.
        </p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="border-b">
          <div className="flex overflow-x-auto pb-2">
            <TabsList className="mx-4 h-10">
              <TabsTrigger value="campaigns" className="flex items-center gap-2">
                <Megaphone className="w-4 h-4" />
                <span>Campaigns</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Customer Segments</span>
              </TabsTrigger>
              <TabsTrigger value="ab-testing" className="flex items-center gap-2">
                <LineChart className="w-4 h-4" />
                <span>A/B Testing</span>
              </TabsTrigger>
              <TabsTrigger value="journey" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                <span>Journey Map</span>
              </TabsTrigger>
              <TabsTrigger value="predictive" className="flex items-center gap-2">
                <BarChart className="w-4 h-4" />
                <span>Predictive</span>
              </TabsTrigger>
              <TabsTrigger value="personalization" className="flex items-center gap-2">
                <PieChart className="w-4 h-4" />
                <span>Personalization</span>
              </TabsTrigger>
              <TabsTrigger value="roi" className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <span>ROI</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Calendar</span>
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span>Analytics</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        
        <TabsContent value="campaigns" className="mt-0">
          <MarketingCampaigns />
        </TabsContent>
        
        <TabsContent value="customers" className="mt-0">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Customer Segments</h2>
            </div>
            {/* Customer Segments component is already in the original Marketing component */}
            <p className="text-center py-12 text-muted-foreground">
              This tab will continue to use the Customer Segments feature that is already 
              implemented in the main Marketing component.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="ab-testing" className="mt-0">
          <ABTestingDashboard />
        </TabsContent>

        <TabsContent value="journey" className="mt-0">
          <CustomerJourneyMap />
        </TabsContent>

        <TabsContent value="predictive" className="mt-0">
          <PredictiveAnalytics />
        </TabsContent>

        <TabsContent value="personalization" className="mt-0">
          <PersonalizationEngine />
        </TabsContent>

        <TabsContent value="roi" className="mt-0">
          <CampaignROIDashboard />
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <MarketingCalendar />
        </TabsContent>
        
        <TabsContent value="email" className="mt-0">
          <EmailMarketing />
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Marketing Analytics</h2>
            </div>
            {/* Analytics component is already in the original Marketing component */}
            <p className="text-center py-12 text-muted-foreground">
              This tab will continue to use the Marketing Analytics feature that is already 
              implemented in the main Marketing component.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}