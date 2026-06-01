import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--gold)] text-zinc-950 shadow-[0_10px_24px_rgba(242,193,78,0.22)] hover:bg-[#ffd76d] focus-visible:outline-[var(--gold)]",
        secondary:
          "border border-white/12 bg-white/8 text-white hover:bg-white/14 focus-visible:outline-white/50",
        danger:
          "bg-[var(--ruby)] text-white shadow-[0_10px_24px_rgba(239,71,111,0.2)] hover:bg-[#ff5d82] focus-visible:outline-[var(--ruby)]"
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-5"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
