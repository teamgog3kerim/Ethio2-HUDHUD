import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, AUTH_SESSION_QUERY_KEY } from "@/lib/auth";
import { advanceIdentityGeneration } from "@/lib/identity-generation";

export function AuthQueryCacheInvalidator() {
  const { userId, isLoaded } = useAuth();
  const qc = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    if (previous.current !== undefined && previous.current !== userId) {
      advanceIdentityGeneration(qc);
      qc.getMutationCache().clear();
      void qc.resetQueries({
        predicate: query => query.queryKey[0] !== AUTH_SESSION_QUERY_KEY[0],
      });
    }
    previous.current = userId;
  }, [isLoaded, userId, qc]);
  return null;
}
