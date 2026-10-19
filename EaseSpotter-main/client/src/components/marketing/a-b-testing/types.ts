export type ABTestStatus = "active" | "paused" | "completed" | "draft";
export type ABTestType = "email" | "page" | "element" | "funnel";
export type ABTestGoal = "conversion" | "engagement" | "retention" | "revenue" | "other";

export interface ABTestVariant {
  id: string;
  name: string;
  isControl: boolean;
  description: string;
  screenshot?: string;
  traffic: number;
  visitors?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
  conversionRate?: number;
  confidence?: number;
}

export interface ABTestResults {
  startDate: string;
  endDate?: string;
  totalVisitors: number;
  totalConversions: number;
  winningVariant?: string;
  uplift?: number;
  confidenceLevel?: number;
  pValue?: number;
  revenueImpact?: number;
}

export interface ABTest {
  id: string;
  vendorId: number;
  name: string;
  status: ABTestStatus;
  type: ABTestType;
  dateCreated: string;
  dateModified: string;
  startDate?: string;
  endDate?: string;
  description: string;
  hypothesis: string;
  goal: ABTestGoal;
  goalMetric: string;
  trafficAllocation: number;
  variants: ABTestVariant[];
  results?: ABTestResults;
  tags: string[];
}
