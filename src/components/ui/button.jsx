import React from "react"
import { cn } from "../../lib/utils"

export const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-slate-900 text-slate-50 hover:bg-slate-800 shadow-sm active:scale-[0.99]",
      primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[0.99]",
      destructive: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm active:scale-[0.99]",
      outline: "border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 text-slate-700 shadow-sm",
      secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200/80 shadow-none",
      ghost: "hover:bg-slate-100 hover:text-slate-900 text-slate-700",
      link: "text-blue-600 underline-offset-4 hover:underline"
    }

    const sizes = {
      default: "h-9 px-4 py-2 text-sm",
      sm: "h-8 rounded-lg px-3 text-xs",
      lg: "h-11 rounded-xl px-6 text-sm font-semibold",
      icon: "h-9 w-9 p-0"
    }

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 select-none",
          variants[variant] || variants.default,
          sizes[size] || sizes.default,
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
