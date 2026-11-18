import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Reminder, MaintenanceLike } from "@/lib/maintenance";
import { MAINTENANCE_TYPE_LABEL, type MaintenanceType } from "@/lib/domain/bicycle";
import { slotLabel } from "@/lib/domain/slots";
import { formatDate } from "@/lib/format";

export function ReminderList<T extends MaintenanceLike & { bikeName?: string }>({ reminders, linkBase }: { reminders: Reminder<T>[]; linkBase?: (r: T) => string }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {reminders.map(({ record, status, daysUntil, dueOn }) => (
        <li key={record.id} className="flex items-start gap-3 py-2.5">
          {status === "overdue" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          ) : status === "due_soon" ? (
            <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
          ) : (
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {linkBase ? <Link href={linkBase(record)} className="hover:text-accent">{record.title}</Link> : record.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[record.bikeName, MAINTENANCE_TYPE_LABEL[record.maintenance_type as MaintenanceType] ?? record.maintenance_type, record.slot ? slotLabel(record.slot) : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={status === "overdue" ? "danger" : status === "due_soon" ? "warning" : "neutral"}>
              {status === "overdue" ? `${-daysUntil}d overdue` : daysUntil === 0 ? "Due today" : `in ${daysUntil}d`}
            </Badge>
            <span className="figure text-[11px] text-subtle-foreground">{formatDate(dueOn)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
