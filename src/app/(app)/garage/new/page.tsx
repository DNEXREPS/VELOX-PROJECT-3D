import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { BicycleForm } from "@/features/garage/bicycle-form";

export const metadata: Metadata = { title: "Add bicycle" };

export default function NewBikePage() {
  return (
    <Container>
      <PageHeader eyebrow="Garage" title="Add a bicycle" description="Create the digital identity first. You will add components in the 3D Studio next — every change is recorded as a build revision." />
      <div className="pt-6">
        <BicycleForm />
      </div>
    </Container>
  );
}
