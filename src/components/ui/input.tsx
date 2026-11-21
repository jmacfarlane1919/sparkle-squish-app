import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base text-[#2c2640] outline-none placeholder:text-[#b3adc0] focus-visible:ring-2 focus-visible:ring-[#2f6fe0]",
        className,
      )}
      {...props}
    />
  );
}
