import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { BicycleForm } from "@/features/garage/bicycle-form";
import { loadOwnedBike } from "@/server/bike-context";

export const metadata: Metadata = { title: "Edit bicycle" };

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function EditBikePage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { bike, privateDetails } = await loadOwnedBike(bikeId);
  return (
    <Container>
      <PageHeader title="Edit bicycle" description="Changes to identity and value. Component changes are made in the 3D Studio or Components tab and are recorded in the build history." />
      <div className="pt-6">
        <BicycleForm
          bikeId={bike.id}
          defaults={{
            name: bike.name,
            brand: str(bike.brand),
            model: str(bike.model),
            category: bike.category,
            frame_material: str(bike.frame_material),
            frame_size: str(bike.frame_size),
            model_year: str(bike.model_year),
            color: str(bike.color),
            color_hex: str(bike.color_hex),
            weight_kg: str(bike.weight_kg),
            estimated_value: str(bike.estimated_value),
            value_currency: bike.value_currency,
            description: str(bike.description),
            visibility: bike.visibility,
            is_primary: bike.is_primary,
            serial_number: str(privateDetails?.serial_number),
            purchase_price: str(privateDetails?.purchase_price),
            purchase_currency: privateDetails?.purchase_currency ?? "EUR",
            purchase_date: str(privateDetails?.purchase_date),
          }}
        />
      </div>
    </Container>
  );
}
