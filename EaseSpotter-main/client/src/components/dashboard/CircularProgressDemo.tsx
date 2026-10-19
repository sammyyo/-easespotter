import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  CircularProgress,
  GradientCircularProgress,
  MultiColorCircularProgress,
  PROGRESS_COLORS
} from "@/components/ui/circular-progress"
import type { DashboardSegmentDisplay, DashboardMetricDisplay } from "@/lib/dashboard-metrics"

interface CircularProgressDemoProps {
  metrics: {
    stockMetrics: DashboardMetricDisplay[];
    performanceMetrics: DashboardMetricDisplay[];
    inventorySegments: DashboardSegmentDisplay[];
    priceChangeSegments: DashboardSegmentDisplay[];
  };
}

export default function CircularProgressDemo({ metrics }: CircularProgressDemoProps) {
  const [activeTab, setActiveTab] = React.useState("stock")
  
  // Render the appropriate content based on active tab
  const renderTabContent = () => {
    switch(activeTab) {
      case "performance":
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4">
            {metrics.performanceMetrics.map((metric, index) => (
              <div key={metric.label} className="flex flex-col items-center gap-2">
                <GradientCircularProgress 
                  value={metric.value}
                  startColor={[
                    PROGRESS_COLORS.cyan,
                    PROGRESS_COLORS.pink,
                    PROGRESS_COLORS.green,
                  ][index]}
                  endColor={[
                    PROGRESS_COLORS.purple,
                    PROGRESS_COLORS.orange,
                    PROGRESS_COLORS.cyan,
                  ][index]}
                  valueFormatter={(value) => `${Math.round(value)}%`}
                />
                <div className="text-center mt-2">
                  <h3 className="font-medium">{metric.label}</h3>
                  <p className="text-sm text-muted-foreground">{metric.description}</p>
                </div>
              </div>
            ))}
          </div>
        );
      
      case "breakdown":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
            <div className="flex flex-col items-center gap-2">
              <MultiColorCircularProgress 
                segments={metrics.inventorySegments}
                size={200}
              />
              <div className="text-center mt-4">
                <h3 className="font-medium">Inventory Breakdown</h3>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {metrics.inventorySegments.map((segment) => (
                    <div key={segment.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></div>
                      <span className="text-sm">{segment.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <MultiColorCircularProgress 
                segments={metrics.priceChangeSegments}
                size={200}
              />
              <div className="text-center mt-4">
                <h3 className="font-medium">Price Change Mix</h3>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {metrics.priceChangeSegments.map((segment) => (
                    <div key={segment.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></div>
                      <span className="text-sm">{segment.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      
      // Default to basic tab
      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4">
            {metrics.stockMetrics.map((metric, index) => (
              <div key={metric.label} className="flex flex-col items-center gap-2">
                <CircularProgress 
                  value={metric.value}
                  color={[
                    PROGRESS_COLORS.green,
                    PROGRESS_COLORS.orange,
                    PROGRESS_COLORS.purple,
                  ][index]}
                  valueFormatter={(value) => `${Math.round(value)}%`} 
                />
                <div className="text-center mt-2">
                  <h3 className="font-medium">{metric.label}</h3>
                  <p className="text-sm text-muted-foreground">{metric.description}</p>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Progress Metrics</CardTitle>
        <CardDescription>
          Key performance indicators and completion metrics
        </CardDescription>
        
        <div className="flex items-center mt-2">
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-md w-full">
            <button
              onClick={() => setActiveTab("stock")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "stock" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Stock
            </button>
            <button
              onClick={() => setActiveTab("performance")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "performance" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Performance
            </button>
            <button
              onClick={() => setActiveTab("breakdown")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "breakdown" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Breakdown
            </button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 items-center py-4">
          {renderTabContent()}
        </div>
      </CardContent>
    </Card>
  )
}
