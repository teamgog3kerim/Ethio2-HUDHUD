import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import {
  studyPushBinding, disableStudyPush, retryStudyRevocations, setStudyPushIdentity, refreshStudyPush,
} from "@/lib/study-push";

// This remains mounted outside the course gate: expired access and sign-out
// must never prevent local consent revocation.
export function StudyPushIdentityBoundary() {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    setStudyPushIdentity(userId ?? null);
    try {
      const initial = studyPushBinding();
      // Lost browser preferences must not leave an older identity bound in
      // the worker's separate IndexedDB. Do this only on identity change,
      // never on focus while a permission request is in progress.
      if (!initial.owner && !initial.consent) void disableStudyPush(false, true).catch(() => {});
    } catch { /* no notifications without durable consent */ }
    const synchronize = () => {
      try {
        const binding = studyPushBinding();
        if (binding.owner && binding.owner !== (userId ?? null)) void disableStudyPush(false, true).catch(() => {});
        else if (binding.consent && "Notification" in window && Notification.permission !== "granted")
          void disableStudyPush(!!userId, true).catch(() => {});
        else {
          void retryStudyRevocations().catch(() => {});
          if (userId && binding.consent) void refreshStudyPush(userId).catch(() => {});
        }
      } catch { /* unavailable storage disables the UI; do not break the app */ }
    };
    synchronize();
    window.addEventListener("online", synchronize);
    window.addEventListener("focus", synchronize);
    return () => {
      setStudyPushIdentity(null);
      window.removeEventListener("online", synchronize);
      window.removeEventListener("focus", synchronize);
    };
  }, [userId, isLoaded]);
  return null;
}
