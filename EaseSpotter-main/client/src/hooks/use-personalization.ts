import { useQuery } from "@tanstack/react-query";
import { type PersonalizationContext, resolvePersonalization } from "@/lib/personalization";

export function usePersonalization(context: PersonalizationContext, enabled = true) {
  return useQuery({
    queryKey: ["/api/marketing/personalization/evaluate", context],
    queryFn: () => resolvePersonalization(context),
    enabled,
    staleTime: 30000,
  });
}
