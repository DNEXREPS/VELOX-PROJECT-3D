"use client";
import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/monitoring/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // Server errors are already captured by instrumentation (matched by digest);
    // client-side render errors are only visible here.
    reportClientError("render", error.digest ? "Server render error" : error.message, { digest: error.digest });
  }, [error]);
  return (
    <Container className="flex min-h-[50dvh] flex-col items-start justify-center gap-3">
      <span className="eyebrow">Error</span>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">The request could not be completed. {error.digest && <span className="figure">Ref {error.digest}</span>}</p>
      <Button variant="outline" onClick={reset}>Try again</Button>
    </Container>
  );
}
