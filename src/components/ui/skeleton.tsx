import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-[#2E2E2E]",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/[0.07] before:to-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
