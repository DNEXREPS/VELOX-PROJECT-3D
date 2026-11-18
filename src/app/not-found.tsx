import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="flex min-h-[50dvh] flex-col items-start justify-center gap-3">
      <span className="eyebrow figure">404</span>
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">This page doesn’t exist, or it is private.</p>
      <Button asChild variant="outline"><Link href="/">Back to VELOX</Link></Button>
    </Container>
  );
}
