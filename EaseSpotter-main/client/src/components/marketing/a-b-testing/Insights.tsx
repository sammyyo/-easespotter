import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, LineChart, Rocket, TrendingUp } from "lucide-react";
import { getABTestInsights } from "./insights-utils";
import type { ABTest } from "./types";

interface ABTestingInsightsProps {
  abTests: ABTest[];
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatSignedPercent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function getToneStyles(tone: "positive" | "warning" | "neutral") {
  switch (tone) {
    case "positive":
      return {
        card: "bg-green-50 border-green-200",
        icon: <CheckCircle className="h-4 w-4 text-green-600" />,
      };
    case "warning":
      return {
        card: "bg-amber-50 border-amber-200",
        icon: <AlertCircle className="h-4 w-4 text-amber-600" />,
      };
    default:
      return {
        card: "bg-blue-50 border-blue-200",
        icon: <LineChart className="h-4 w-4 text-blue-600" />,
      };
  }
}

export function ABTestingInsights({ abTests }: ABTestingInsightsProps) {
  const insights = getABTestInsights(abTests);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed Tests</CardDescription>
            <CardTitle>{insights.summary.completedTests}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {insights.summary.completedWithResults} with measurable results
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Program Win Rate</CardDescription>
            <CardTitle>{formatPercent(insights.summary.winRate, 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {insights.summary.wins} validated winners
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Improvement</CardDescription>
            <CardTitle>{formatSignedPercent(insights.summary.avgImprovement)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across confidence-qualified wins
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Confidence</CardDescription>
            <CardTitle>{formatPercent(insights.summary.avgConfidence)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across completed tests with results
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Type Performance</CardTitle>
              <CardDescription>Live effectiveness by A/B test type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.typePerformance.map((entry) => (
                <div key={entry.type} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{entry.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {entry.totalTests} total, {entry.completedTests} completed
                      </div>
                    </div>
                    <Badge variant="outline">{formatPercent(entry.winRate, 0)} win rate</Badge>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Win Rate</span>
                        <span>{formatPercent(entry.winRate, 0)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(entry.winRate, 100)}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-muted-foreground">Wins</div>
                        <div className="font-semibold">{entry.wins}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-muted-foreground">Avg. Uplift</div>
                        <div className="font-semibold">{formatSignedPercent(entry.avgImprovement)}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-muted-foreground">Traffic Share</div>
                        <div className="font-semibold">{formatPercent(entry.trafficShare, 0)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Winning Tests</CardTitle>
              <CardDescription>Highest-confidence recent winners in your program</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.recentWinners.length ? (
                insights.recentWinners.map((test) => (
                  <div key={test.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div>
                      <div className="font-medium">{test.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {test.goalMetric} on {new Date(test.dateModified).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatSignedPercent(test.results?.uplift ?? 0)}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPercent(test.results?.confidenceLevel ?? 0)} confidence
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No completed tests have reached the confidence threshold yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Program Health</CardTitle>
              <CardDescription>Current testing posture from live A/B data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <span className="text-muted-foreground">Active Tests</span>
                <span className="font-medium">{insights.summary.activeTests}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <span className="text-muted-foreground">Draft Tests</span>
                <span className="font-medium">{insights.summary.draftTests}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <span className="text-muted-foreground">Paused Tests</span>
                <span className="font-medium">{insights.summary.pausedTests}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <span className="text-muted-foreground">Visitors Analyzed</span>
                <span className="font-medium">{insights.summary.totalVisitors.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <span className="text-muted-foreground">Revenue Impact</span>
                <span className="font-medium">${insights.summary.totalRevenueImpact.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goal Mix</CardTitle>
              <CardDescription>How tests are distributed by objective</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.goalDistribution.length ? (
                insights.goalDistribution.map((goal) => (
                  <div key={goal.goal}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{goal.label}</span>
                      <span className="text-muted-foreground">
                        {goal.count} test{goal.count === 1 ? "" : "s"} • {formatPercent(goal.share, 0)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/80" style={{ width: `${Math.min(goal.share, 100)}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No goal distribution is available until tests are created.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Strongest Winner</CardTitle>
              <CardDescription>Best validated result across completed tests</CardDescription>
            </CardHeader>
            <CardContent>
              {insights.strongestWinner?.results ? (
                <div className="space-y-3">
                  <div className="font-medium">{insights.strongestWinner.name}</div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    <span>{formatSignedPercent(insights.strongestWinner.results.uplift ?? 0)} uplift</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Rocket className="h-4 w-4" />
                    <span>{formatPercent(insights.strongestWinner.results.confidenceLevel ?? 0)} confidence</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Updated {new Date(insights.strongestWinner.dateModified).toLocaleDateString()}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No winning test is available yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Insights</CardTitle>
            <CardDescription>Generated from current A/B testing performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.topInsights.map((item) => {
              const styles = getToneStyles(item.tone);
              return (
                <div key={item.id} className={`rounded-md border p-3 ${styles.card}`}>
                  <div className="flex items-center gap-2 font-medium">
                    {styles.icon}
                    <span>{item.title}</span>
                  </div>
                  <p className="mt-1 text-sm">{item.description}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommended Actions</CardTitle>
            <CardDescription>Next moves based on program gaps and momentum</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.recommendations.map((item) => {
              const styles = getToneStyles(item.tone);
              return (
                <div key={item.id} className={`rounded-md border p-3 ${styles.card}`}>
                  <div className="flex items-center gap-2 font-medium">
                    {styles.icon}
                    <span>{item.title}</span>
                  </div>
                  <p className="mt-1 text-sm">{item.description}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
