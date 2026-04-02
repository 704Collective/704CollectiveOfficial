import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "rounded-[12px] bg-white px-4 py-2 text-sm text-black shadow-sm hover:bg-white/90",
        destructive:
          "rounded-[12px] bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "rounded-[12px] border border-[rgb(61,61,61)] bg-transparent px-4 py-2 text-sm text-[rgb(250,246,240)] shadow-none hover:bg-white/5",
        outlineSm:
          "h-8 rounded-[10px] border border-[rgb(61,61,61)] bg-transparent px-3 text-xs font-semibold text-[rgb(250,246,240)] hover:bg-white/5",
        secondary:
          "rounded-[12px] bg-secondary px-4 py-2 text-sm text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "rounded-[12px] hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        hero:
          "rounded-[12px] bg-[#C6A664] px-4 py-2 text-sm font-semibold text-black shadow-lg hover:bg-[#C6A664]/90",
        marketingPill:
          "h-12 rounded-full bg-white px-8 text-base font-semibold text-black hover:bg-white/90",
        filterActive:
          "rounded-[10px] bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-none border-0 hover:bg-white/90",
        filterInactive:
          "rounded-[10px] border border-[rgb(61,61,61)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[rgb(250,246,240)] shadow-none hover:bg-white/5",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        xl: "h-12 rounded-md px-10 text-base",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
