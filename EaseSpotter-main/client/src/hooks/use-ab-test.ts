import { useEffect, useMemo, useState } from "react";
import {
  getAssignedVariant,
  trackAbTestEvent,
  trackAssignedVariantVisit,
} from "@/lib/ab-testing";

interface UseAbTestVariant {
  id: string | number;
  traffic: number;
}

interface UseAbTestOptions {
  testId: string | number;
  vendorId: number;
  variants: UseAbTestVariant[];
  enabled?: boolean;
}

export function useAbTest({ testId, vendorId, variants, enabled = true }: UseAbTestOptions) {
  const [assignment, setAssignment] = useState<{
    testId: string;
    variantId: string;
    vendorId: number;
    visitorKey: string;
  } | null>(null);

  const stableVariants = useMemo(() => variants, [variants]);

  useEffect(() => {
    if (!enabled || stableVariants.length === 0 || typeof window === "undefined") return;

    const nextAssignment = getAssignedVariant({
      testId,
      vendorId,
      variants: stableVariants,
    });

    setAssignment(nextAssignment);
    trackAssignedVariantVisit(nextAssignment).catch((error) => {
      console.error("Failed to track A/B visit:", error);
    });
  }, [enabled, stableVariants, testId, vendorId]);

  return {
    assignment,
    variantId: assignment?.variantId,
    trackClick: (metadata?: Record<string, unknown>) =>
      assignment
        ? trackAbTestEvent({ ...assignment, eventType: "click", metadata })
        : Promise.resolve(null),
    trackConversion: (metadata?: Record<string, unknown>) =>
      assignment
        ? trackAbTestEvent({ ...assignment, eventType: "conversion", metadata })
        : Promise.resolve(null),
    trackRevenue: (eventValue: number, metadata?: Record<string, unknown>) =>
      assignment
        ? trackAbTestEvent({ ...assignment, eventType: "revenue", eventValue, metadata })
        : Promise.resolve(null),
  };
}
