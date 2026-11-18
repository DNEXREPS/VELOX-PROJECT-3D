"use client";
import * as React from "react";
import { AlertDialog as AD } from "radix-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

const AlertDialog = AD.Root;
const AlertDialogTrigger = AD.Trigger;

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AD.Content>) {
  return (
    <AD.Portal>
      <AD.Overlay className="fixed inset-0 z-50 bg-black/70" />
      <AD.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-surface p-5 shadow-2xl",
          className,
        )}
        {...props}
      />
    </AD.Portal>
  );
}
function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AD.Title>) {
  return <AD.Title className={cn("text-base font-semibold", className)} {...props} />;
}
function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AD.Description>) {
  return <AD.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof AD.Cancel>) {
  return <AD.Cancel className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />;
}
function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof AD.Action>) {
  return <AD.Action className={cn(buttonVariants({ variant: "danger" }), className)} {...props} />;
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
};
