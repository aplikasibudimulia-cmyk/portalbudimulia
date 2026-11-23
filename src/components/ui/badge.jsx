import React from "react"
import { cn } from "../../lib/utils"

export const Badge = ({ className, variant = "default", ...props }) => {
  const variants = {
    default: "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900",
    secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50",
    outline: "text-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-50",
    success: "border-transparent bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
    warning: "border-transparent bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
    danger: "border-transparent bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
    info: "border-transparent bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  )
}
