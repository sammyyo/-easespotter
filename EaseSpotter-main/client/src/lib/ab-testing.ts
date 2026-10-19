import { apiRequest } from "@/lib/queryClient";

type AbEventType = "visit" | "click" | "conversion" | "revenue";

interface AbVariant {
  id: string | number;
  traffic: number;
}

interface AbTestAssignmentInput {
  testId: string | number;
  vendorId: number;
  variants: AbVariant[];
}

interface AbTrackPayload {
  testId: string | number;
  variantId: string | number;
  vendorId: number;
  eventType: AbEventType;
  visitorKey?: string;
  eventValue?: number;
  metadata?: Record<string, unknown>;
}

const VISITOR_STORAGE_KEY = "ab-test-visitor-key";
const ASSIGNMENT_STORAGE_PREFIX = "ab-test-assignment";
const TRACKED_URL_CLICK_PREFIX = "ab-test-url-click";
const TRACKED_VISIT_PREFIX = "ab-test-visit";

const getStorageKey = (prefix: string, suffix: string | number) => `${prefix}:${suffix}`;

export function getOrCreateAbVisitorKey() {
  const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;

  const visitorKey = crypto.randomUUID();
  localStorage.setItem(VISITOR_STORAGE_KEY, visitorKey);
  return visitorKey;
}

export function getAssignedVariant({ testId, vendorId, variants }: AbTestAssignmentInput) {
  const assignmentKey = getStorageKey(ASSIGNMENT_STORAGE_PREFIX, testId);
  const existingVariantId = localStorage.getItem(assignmentKey);
  const visitorKey = getOrCreateAbVisitorKey();

  if (existingVariantId) {
    const existingVariant = variants.find((variant) => String(variant.id) === existingVariantId);
    if (existingVariant) {
      return {
        testId: String(testId),
        vendorId,
        variantId: String(existingVariant.id),
        visitorKey,
      };
    }
  }

  const roll = Math.random() * 100;
  let runningTotal = 0;
  const selectedVariant = variants.find((variant) => {
    runningTotal += Number(variant.traffic || 0);
    return roll <= runningTotal;
  }) || variants[0];

  localStorage.setItem(assignmentKey, String(selectedVariant.id));

  return {
    testId: String(testId),
    vendorId,
    variantId: String(selectedVariant.id),
    visitorKey,
  };
}

export async function trackAbTestEvent({
  testId,
  variantId,
  vendorId,
  eventType,
  visitorKey,
  eventValue,
  metadata,
}: AbTrackPayload) {
  const resolvedVisitorKey = visitorKey || getOrCreateAbVisitorKey();

  const response = await apiRequest("POST", `/api/marketing/ab-tests/${testId}/track`, {
    variantId: Number(variantId),
    vendorId,
    eventType,
    visitorKey: resolvedVisitorKey,
    eventValue,
    metadata,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to track ${eventType} event`);
  }

  return response.json();
}

export async function trackAssignedVariantVisit(assignment: { testId: string; variantId: string; vendorId: number; visitorKey: string }) {
  const visitKey = getStorageKey(TRACKED_VISIT_PREFIX, `${assignment.testId}:${assignment.variantId}:${assignment.visitorKey}`);
  if (sessionStorage.getItem(visitKey)) return;

  await trackAbTestEvent({
    ...assignment,
    eventType: "visit",
  });

  sessionStorage.setItem(visitKey, "1");
}

export function buildAbTestUrl(
  url: string,
  assignment: { testId: string; variantId: string; vendorId: number; visitorKey: string }
) {
  const resolvedUrl = new URL(url, window.location.origin);
  resolvedUrl.searchParams.set("abt", assignment.testId);
  resolvedUrl.searchParams.set("abv", assignment.variantId);
  resolvedUrl.searchParams.set("abvd", String(assignment.vendorId));
  resolvedUrl.searchParams.set("abvk", assignment.visitorKey);
  return resolvedUrl.toString();
}

export async function trackAbTestClickFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const testId = params.get("abt");
  const variantId = params.get("abv");
  const vendorId = Number(params.get("abvd"));
  const visitorKey = params.get("abvk") || getOrCreateAbVisitorKey();

  if (!testId || !variantId || !Number.isFinite(vendorId) || vendorId <= 0) {
    return;
  }

  const clickKey = getStorageKey(TRACKED_URL_CLICK_PREFIX, `${testId}:${variantId}:${visitorKey}:${window.location.pathname}`);
  if (sessionStorage.getItem(clickKey)) return;

  await trackAbTestEvent({
    testId,
    variantId,
    vendorId,
    visitorKey,
    eventType: "click",
    metadata: {
      path: window.location.pathname,
      search: window.location.search,
      referrer: document.referrer || null,
    },
  });

  sessionStorage.setItem(clickKey, "1");
}
