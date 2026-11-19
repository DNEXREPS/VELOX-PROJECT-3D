import type { Instrumentation } from "next";
import { captureError } from "@/lib/monitoring";
import { scrubPath } from "@/lib/monitoring/scrub";

/**
 * Server error capture for every route type (Server Components, Route Handlers,
 * Server Actions, Proxy). Only the route, method and request path (without query
 * string) are recorded — never headers, cookies or bodies.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await captureError(error, {
    area: context.routeType === "action" ? "action" : "server",
    op: `${context.routeType}:${context.routePath}`,
    tags: {
      method: request.method,
      path: scrubPath(request.path),
      routerKind: context.routerKind,
      renderSource: "renderSource" in context ? (context.renderSource as string | undefined) : undefined,
    },
  });
};
