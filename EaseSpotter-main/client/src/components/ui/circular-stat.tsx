import * as React from "react"
import { CircularProgress, PROGRESS_COLORS } from "@/components/ui/circular-progress"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const circularStatVariants = cva(
  "flex flex-col items-center w-full",
  {
    variants: {
      size: {
        sm: "gap-1",
        md: "gap-2",
        lg: "gap-3"
      }
    },
    defaultVariants: {
      size: "md"
    }
  }
)

export interface CircularStatProps 
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof circularStatVariants> {
  /**
   * Value to display (0-100)
   */
  value: number
  /**
   * Main label for the stat
   */
  label: string
  /**
   * Optional subtitle
   */
  description?: string
  /**
   * Progress color
   */
  color?: string
  /**
   * Size of the progress circle
   */
  progressSize?: number
  /**
   * Custom value formatter
   */
  valueFormatter?: (value: number) => string
}

/**
 * Circular stat component for displaying a KPI or metric with a circular progress indicator
 */
export function CircularStat({
  value,
  label,
  description,
  color = PROGRESS_COLORS.cyan,
  progressSize,
  className,
  size,
  valueFormatter,
  ...props
}: CircularStatProps) {
  // Size presets
  const circleSizes = {
    sm: 80,
    md: 120,
    lg: 160
  }
  
  // Text size classes
  const labelSizes = {
    sm: "text-sm font-medium",
    md: "text-base font-medium",
    lg: "text-lg font-medium"
  }
  
  const descriptionSizes = {
    sm: "text-xs text-muted-foreground",
    md: "text-sm text-muted-foreground",
    lg: "text-base text-muted-foreground"
  }
  
  // Use size preset or custom size
  const circleSize = progressSize || circleSizes[size as keyof typeof circleSizes] || circleSizes.md
  
  return (
    <div
      className={cn(
        circularStatVariants({ size }),
        className
      )}
      {...props}
    >
      <CircularProgress
        value={value}
        color={color}
        size={circleSize}
        valueFormatter={valueFormatter}
      />
      
      <div className="text-center">
        <h3 className={labelSizes[size as keyof typeof labelSizes]}>{label}</h3>
        {description && <p className={descriptionSizes[size as keyof typeof descriptionSizes]}>{description}</p>}
      </div>
    </div>
  )
}

/**
 * A set of circular stats arranged horizontally
 */
export function CircularStatGroup({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6", className)}
      {...props}
    >
      {children}
    </div>
  )
}