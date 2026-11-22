"use client";

import { useActionState } from "react";
import type { ActionState } from "@/server/actions/accounting";

export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {state?.error ? <p className="rounded-2xl bg-[#fde8ef] px-4 py-3 text-sm font-semibold text-[#8d2d52]">{state.error}</p> : null}
      {children}
    </form>
  );
}
