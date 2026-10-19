import * as React from "react"
import {
  CircularProgressbar,
  CircularProgressbarWithChildren,
  buildStyles
} from "react-circular-progressbar"
import "react-circular-progressbar/dist/styles.css"
import { cn } from "@/lib/utils"

// Define vibrant color palette for consistency with other charts
export const PROGRESS_COLORS = {
  cyan: "#00E4FF",     // Bright Cyan
  pink: "#FF2D55",     // Hot Pink
  purple: "#AF52DE",   // Bright Purple
  green: "#34C759",    // Bright Green
  orange: "#FF9500",   // Bright Orange
  // Rating colors for consistency
  excellent: "#34C759", // Same as green
  good: "#5856D6",     // Royal Blue
  average: "#FF9500",  // Same as orange
  poor: "#FF2D55"      // Same as pink
}

export interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The value to display, from 0-100
   */
  value: number
  /**
   * The maximum value
   */
  maxValue?: number
  /**
   * The size of the progress bar in pixels
   */
  size?: number
  /**
   * The color of the progress bar
   */
  color?: string
  /**
   * The color of the trail
   */
  trailColor?: string
  /**
   * Whether to show the text value
   */
  showValue?: boolean
  /**
   * Optional formatter for the value text
   */
  valueFormatter?: (value: number) => string
  /**
   * The thickness of the progress bar
   */
  strokeWidth?: number
  /**
   * Optional content to render inside the progress circle
   */
  children?: React.ReactNode
}

/**
 * A circular progress bar component
 */
export function CircularProgress({
  value,
  maxValue = 100,
  size = 150,
  color = PROGRESS_COLORS.cyan,
  trailColor = "rgba(0, 0, 0, 0.1)",
  showValue = true,
  valueFormatter = (value: number) => `${Math.round(value)}%`,
  strokeWidth = 8,
  className,
  children,
  ...props
}: CircularProgressProps) {
  const styles = buildStyles({
    // Colors
    pathColor: color,
    trailColor: trailColor,
    // Text
    textColor: "hsl(var(--foreground))",
    textSize: '16px',
    // Animation
    strokeLinecap: 'round',
    // Transitions
    pathTransition: 'stroke-dashoffset 0.5s ease 0s',
    // Others
    rotation: 0.25,
  })

  return (
    <div 
      className={cn("relative", className)} 
      style={{ width: size, height: size }}
      {...props}
    >
      {children ? (
        <CircularProgressbarWithChildren
          value={value}
          maxValue={maxValue}
          strokeWidth={strokeWidth}
          styles={styles}
        >
          {children}
        </CircularProgressbarWithChildren>
      ) : showValue ? (
        <CircularProgressbar
          value={value}
          maxValue={maxValue}
          text={valueFormatter(value)}
          strokeWidth={strokeWidth}
          styles={styles}
        />
      ) : (
        <CircularProgressbar
          value={value}
          maxValue={maxValue}
          strokeWidth={strokeWidth}
          styles={styles}
        />
      )}
    </div>
  )
}

/**
 * A variant with a gradient color
 */
export function GradientCircularProgress({
  startColor = PROGRESS_COLORS.cyan,
  endColor = PROGRESS_COLORS.purple,
  ...props
}: CircularProgressProps & {
  startColor?: string
  endColor?: string
}) {
  const idCSS = React.useId()
  const gradientId = `gradient-${idCSS}`

  return (
    <div className={cn("relative", props.className)} style={{ width: props.size || 150, height: props.size || 150 }}>
      <svg style={{ height: 0, width: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
        </defs>
      </svg>
      <CircularProgress {...props} color={`url(#${gradientId})`} />
    </div>
  )
}

/**
 * Multi-color circular progress that displays multiple segments
 */
export function MultiColorCircularProgress({
  segments,
  size = 150,
  strokeWidth = 8,
  className,
  percentage,
  backgroundColor,
  pathColor,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  segments?: Array<{
    value: number
    color: string
    label?: string
  }>
  size?: number
  strokeWidth?: number
  percentage?: number
  backgroundColor?: string
  pathColor?: string
}) {
  // If percentage is provided, show a single progress circle
  if (percentage !== undefined) {
    return (
      <div 
        className={cn("relative", className)} 
        style={{ width: size, height: size }}
        {...props}
      >
        <CircularProgressbar
          value={percentage}
          maxValue={100}
          strokeWidth={strokeWidth}
          styles={buildStyles({
            pathColor: pathColor || PROGRESS_COLORS.cyan,
            trailColor: backgroundColor || "rgba(0, 0, 0, 0.1)",
            strokeLinecap: 'round',
            rotation: 0,
          })}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold">{percentage}%</div>
          </div>
        </div>
      </div>
    );
  }
  
  // Check if segments is undefined or empty
  if (!segments || segments.length === 0) {
    return (
      <div 
        className={cn("relative", className)} 
        style={{ width: size, height: size }}
        {...props}
      >
        <CircularProgressbar
          value={0}
          maxValue={100}
          strokeWidth={strokeWidth}
          styles={buildStyles({
            pathColor: "#ccc",
            trailColor: "rgba(0, 0, 0, 0.1)",
            strokeLinecap: 'butt',
            rotation: 0,
          })}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-muted-foreground">No Data</div>
          </div>
        </div>
      </div>
    );
  }
  
  // Calculate total value and cumulative values for positioning
  const total = segments.reduce((sum, segment) => sum + (segment.value || 0), 0)
  let cumulativeValue = 0

  return (
    <div 
      className={cn("relative", className)} 
      style={{ width: size, height: size }}
      {...props}
    >
      {segments.map((segment, i) => {
        // Calculate rotation based on previous segments
        const rotation = cumulativeValue / total
        // Update cumulative value for next segment
        cumulativeValue += segment.value
        
        // Render segment
        return (
          <div 
            key={i}
            className="absolute inset-0"
            style={{ transform: `rotate(${rotation * 360}deg)` }}
          >
            <CircularProgressbar
              value={segment.value}
              maxValue={total}
              strokeWidth={strokeWidth}
              styles={buildStyles({
                pathColor: segment.color,
                trailColor: "transparent",
                strokeLinecap: 'butt',
                rotation: 0,
              })}
            />
          </div>
        )
      })}
      
      {/* Optional center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-sm text-muted-foreground">Total</div>
        </div>
      </div>
    </div>
  )
}