"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteMaintenance, uploadMaintenancePhoto } from "@/server/actions/maintenance";
import { MaintenanceDialog } from "./maintenance-form";

export function RecordActions({ bikeId, recordId, defaults }: { bikeId: string; recordId: string; defaults: Record<string, string> }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-0.5">
        <MaintenanceDialog bikeId={bikeId} recordId={recordId} defaults={defaults} trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit record"><Pencil /></Button>} />
        <Button variant="ghost" size="icon-sm" aria-label="Add photo" disabled={pending} onClick={() => fileRef.current?.click()}>
          <Camera />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete record"
          disabled={pending}
          onClick={() =>
            confirm("Delete this maintenance record?") &&
            start(async () => {
              const res = await deleteMaintenance(recordId);
              if (!res.ok) setError(res.error);
              router.refresh();
            })
          }
        >
          <Trash2 />
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("recordId", recordId);
          fd.set("file", file);
          start(async () => {
            const res = await uploadMaintenancePhoto(fd);
            if (!res.ok) setError(res.error);
            e.target.value = "";
            router.refresh();
          });
        }}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
