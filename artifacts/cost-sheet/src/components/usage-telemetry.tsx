import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useRecordUsageEvent } from "@workspace/api-client-react";
import { getStoredToken } from "@/lib/auth";

const HEARTBEAT_MS = 60_000;
const IDLE_AFTER_MS = 5 * 60_000;

/**
 * Records only application routes and coarse activity estimates. It never
 * collects input values, keystrokes, pointer coordinates, or screen details.
 */
export function UsageTelemetry() {
  const [location] = useLocation();
  const recordUsageEvent = useRecordUsageEvent();
  const lastInteractionAt = useRef(Date.now());

  const send = (data: Parameters<typeof recordUsageEvent.mutate>[0]["data"]) => {
    if (!getStoredToken()) return;
    recordUsageEvent.mutate({ data });
  };

  useEffect(() => {
    const pagePath = location.split(/[?#]/, 1)[0] || "/";
    if (pagePath === "/login") return;
    send({ eventType: "page_view", pagePath });
    // Route changes are the only page-level detail retained.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    const markInteraction = () => {
      lastInteractionAt.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "mousemove", "keydown", "scroll", "touchstart", "focus"];
    events.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }));

    const interval = window.setInterval(() => {
      const now = Date.now();
      const isActive = document.visibilityState === "visible" && now - lastInteractionAt.current < IDLE_AFTER_MS;
      send({
        eventType: "heartbeat",
        pagePath: location.split(/[?#]/, 1)[0] || "/",
        activityState: isActive ? "active" : "idle",
      });
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
    };
    // The heartbeat uses the route active when this tracker initialized; route changes
    // are independently recorded above and are the authoritative navigation history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}