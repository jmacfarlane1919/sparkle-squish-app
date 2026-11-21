import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full bg-[#e7dff8] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#5b4684]", className)}
      {...props}
    />
  );
}
