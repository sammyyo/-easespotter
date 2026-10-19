import { apiRequest } from "@/lib/queryClient";

export type PersonalizationTarget = "email" | "website" | "app" | "notification";

export interface PersonalizationContext {
  target: PersonalizationTarget;
  segmentId?: number;
  segment?: string;
  behavior?: string;
  device?: string;
  location?: string;
  time?: string;
}

export interface EvaluatedPersonalizationVariation {
  id: string;
  ruleId: string;
  name: string;
  content: string;
  impressions: number;
  conversions: number;
}

export interface EvaluatedPersonalizationRule {
  id: string;
  vendorId: number;
  name: string;
  description: string;
  audience: string;
  target: PersonalizationTarget;
  priority: number;
  templateId: string | null;
  templateName: string;
  segmentId: string | null;
  segmentName: string;
  conditions: {
    segment?: string;
    behavior?: string;
    device?: string;
    location?: string;
    time?: string;
  };
  variations: EvaluatedPersonalizationVariation[];
}

export interface PersonalizationEvaluationResult {
  matched: boolean;
  rule: EvaluatedPersonalizationRule | null;
  variation: EvaluatedPersonalizationVariation | null;
}

const VISITOR_STORAGE_KEY = "easespotter_personalization_visitor";

export function getPersonalizationVisitorKey() {
  if (typeof window === "undefined") {
    return `server-${Date.now()}`;
  }

  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;

  const generated = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(VISITOR_STORAGE_KEY, generated);
  return generated;
}

export async function evaluatePersonalization(context: PersonalizationContext) {
  const response = await apiRequest("POST", "/api/marketing/personalization/evaluate", context);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Failed to evaluate personalization");
  }
  return data as PersonalizationEvaluationResult;
}

export async function trackPersonalizationEvent(params: {
  ruleId: string;
  vendorId: number;
  variationId?: string | null;
  eventType: "impression" | "conversion";
  visitorKey?: string;
}) {
  const response = await apiRequest("POST", `/api/marketing/personalization/rules/${params.ruleId}/track`, {
    vendorId: params.vendorId,
    variationId: params.variationId ? Number(params.variationId) : null,
    eventType: params.eventType,
    visitorKey: params.visitorKey || getPersonalizationVisitorKey(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Failed to track personalization event");
  }
  return data;
}

export async function resolvePersonalization(context: PersonalizationContext) {
  const evaluation = await evaluatePersonalization(context);
  if (!evaluation.matched || !evaluation.rule || !evaluation.variation) {
    return evaluation;
  }

  await trackPersonalizationEvent({
    ruleId: evaluation.rule.id,
    vendorId: evaluation.rule.vendorId,
    variationId: evaluation.variation.id,
    eventType: "impression",
  });

  return evaluation;
}
