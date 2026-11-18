"use client";
import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

type Side = "right" | "left" | "bottom";

const sideClass: Record<Side, string> = {
  right: "inset-y-0 right-0 h-full w-[min(92vw,420px)] border-l",
  left: "inset-y-0 left-0 h-full w-[min(86vw,320px)] border-r",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-lg border-t",
};

function SheetContent({
  side = "right",
  className,
  children,
  hideClose,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: Side; hideClose?: boolean }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <SheetPrimitive.Content
        className={cn("fixed z-50 flex flex-col overflow-y-auto border-border bg-surface shadow-2xl", sideClass[side], className)}
        {...props}
      >
        {side === "bottom" && <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />}
        {children}
        {!hideClose && (
          <SheetPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:text-foreground">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />;
}
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
