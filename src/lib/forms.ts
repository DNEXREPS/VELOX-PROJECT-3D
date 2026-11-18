import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionFailure } from "@/lib/action-result";

/** Push server-side field errors (from a failed action) into React Hook Form. */
export function applyServerErrors<T extends FieldValues>(result: ActionFailure, setError: UseFormSetError<T>) {
  for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
    if (field !== "_form") setError(field as Path<T>, { type: "server", message: messages[0] });
  }
}
