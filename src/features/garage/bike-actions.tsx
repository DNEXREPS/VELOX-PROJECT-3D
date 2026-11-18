"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { deleteBicycle, setPrimaryBicycle } from "@/server/actions/bicycles";

export function BikeActions({ bikeId, name, isPrimary, passportHref }: { bikeId: string; name: string; isPrimary: boolean; passportHref: string | null }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {passportHref && (
        <Button asChild variant="outline" size="sm">
          <Link href={passportHref} target="_blank">
            <ExternalLink /> Passport
          </Link>
        </Button>
      )}
      <Button asChild variant="secondary" size="sm">
        <Link href={`/garage/${bikeId}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isPrimary || pending}
            onSelect={() =>
              start(async () => {
                const res = await setPrimaryBicycle(bikeId);
                if (!res.ok) setError(res.error);
                router.refresh();
              })
            }
          >
            <Star /> {isPrimary ? "Primary bicycle" : "Set as primary"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
            <Trash2 /> Delete bicycle
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); setTyped(""); setError(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the bicycle, its configuration, build history, maintenance records and photos. Community posts remain but lose their link. This cannot be undone.
          </AlertDialogDescription>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Type the bicycle name to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={typed.trim() !== name.trim() || pending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await deleteBicycle(bikeId);
                  if (!res.ok) return setError(res.error);
                  setConfirmOpen(false);
                  router.push("/garage");
                  router.refresh();
                });
              }}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
