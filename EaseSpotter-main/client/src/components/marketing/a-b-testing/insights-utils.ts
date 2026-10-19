import type { ABTest, ABTestGoal, ABTestType } from "./types";

export const AB_TEST_CONFIDENCE_THRESHOLD = 95;

export const AB_TEST_TYPE_LABELS: Record<ABTestType, string> = {
  email: "Email",
  page: "Page",
  element: "Element",
  funnel: "Funnel",
};

export const AB_TEST_GOAL_LABELS: Record<ABTestGoal, string> = {
  conversion: "Conversion",
  engagement: "Engagement",
  retention: "Retention",
  revenue: "Revenue",
  other: "Other",
};

type InsightTone = "positive" | "warning" | "neutral";

export interface InsightItem {
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
}

export interface TypePerformance {
  type: ABTestType;
  label: string;
  totalTests: number;
  completedTests: number;
  wins: number;
  winRate: number;
  avgImprovement: number;
  avgConfidence: number;
  trafficShare: number;
}

export interface GoalDistribution {
  goal: ABTestGoal;
  label: string;
  count: number;
  share: number;
}

export interface TestSummary {
  totalTests: number;
  activeTests: number;
  pausedTests: number;
  draftTests: number;
  completedTests: number;
  completedWithResults: number;
  wins: number;
  winRate: number;
  avgImprovement: number;
  avgConfidence: number;
  totalVisitors: number;
  totalConversions: number;
  avgVisitorsPerCompletedTest: number;
  totalRevenueImpact: number;
  underpoweredActiveTests: number;
}

export interface ABTestingInsightsData {
  summary: TestSummary;
  typePerformance: TypePerformance[];
  goalDistribution: GoalDistribution[];
  strongestWinner: ABTest | null;
  recentWinners: ABTest[];
  topInsights: InsightItem[];
  recommendations: InsightItem[];
}

const TEST_TYPES: ABTestType[] = ["email", "page", "element", "funnel"];
const TEST_GOALS: ABTestGoal[] = ["conversion", "engagement", "retention", "revenue", "other"];

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasFiniteNumber(value: number | undefined | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getCompletedTests(tests: ABTest[]) {
  return tests.filter((test) => test.status === "completed");
}

function getCompletedTestsWithResults(tests: ABTest[]) {
  return getCompletedTests(tests).filter(
    (test) => test.results && hasFiniteNumber(test.results.totalVisitors) && test.results.totalVisitors > 0
  );
}

function getWinningTests(tests: ABTest[]) {
  return getCompletedTestsWithResults(tests).filter((test) => {
    const uplift = test.results?.uplift ?? 0;
    const confidence = test.results?.confidenceLevel ?? 0;

    return uplift > 0 && confidence >= AB_TEST_CONFIDENCE_THRESHOLD;
  });
}

function getTopInsights(tests: ABTest[], summary: TestSummary, typePerformance: TypePerformance[]): InsightItem[] {
  const winningTests = getWinningTests(tests);
  const insights: InsightItem[] = [];
  const strongestWinner = winningTests
    .slice()
    .sort((a, b) => (b.results?.uplift ?? 0) - (a.results?.uplift ?? 0))[0];

  if (strongestWinner?.results) {
    insights.push({
      id: "strongest-winner",
      title: `${strongestWinner.name} is the strongest validated winner`,
      description: `${(strongestWinner.results.uplift ?? 0).toFixed(1)}% uplift at ${(strongestWinner.results.confidenceLevel ?? 0).toFixed(1)}% confidence.`,
      tone: "positive",
    });
  }

  const bestType = typePerformance
    .filter((entry) => entry.completedTests > 0)
    .slice()
    .sort((a, b) => b.winRate - a.winRate || b.avgImprovement - a.avgImprovement)[0];

  if (bestType) {
    insights.push({
      id: "best-type",
      title: `${bestType.label} tests lead program performance`,
      description: `${bestType.winRate.toFixed(0)}% win rate across ${bestType.completedTests} completed ${bestType.label.toLowerCase()} tests.`,
      tone: "positive",
    });
  }

  if (summary.underpoweredActiveTests > 0) {
    insights.push({
      id: "underpowered-tests",
      title: "Some active tests need more traffic before a decision",
      description: `${summary.underpoweredActiveTests} active test${summary.underpoweredActiveTests === 1 ? "" : "s"} are still below 200 visitors or under ${AB_TEST_CONFIDENCE_THRESHOLD}% confidence.`,
      tone: "warning",
    });
  }

  if (!insights.length) {
    insights.push({
      id: "not-enough-data",
      title: "More completed tests are needed for reliable program insights",
      description: "Run additional tests to generate dependable win-rate and uplift trends.",
      tone: "neutral",
    });
  }

  return insights.slice(0, 4);
}

function getRecommendations(tests: ABTest[], summary: TestSummary, typePerformance: TypePerformance[]): InsightItem[] {
  const recommendations: InsightItem[] = [];
  const activeTests = tests.filter((test) => test.status === "active");
  const pausedTests = tests.filter((test) => test.status === "paused");
  const untestedTypes = typePerformance.filter((entry) => entry.totalTests === 0);
  const weakestType = typePerformance
    .filter((entry) => entry.completedTests > 0)
    .slice()
    .sort((a, b) => a.winRate - b.winRate || a.avgImprovement - b.avgImprovement)[0];

  if (!activeTests.length && summary.draftTests > 0) {
    recommendations.push({
      id: "launch-drafts",
      title: "Launch draft tests",
      description: `${summary.draftTests} draft test${summary.draftTests === 1 ? "" : "s"} can start generating evidence now.`,
      tone: "warning",
    });
  }

  if (pausedTests.length) {
    recommendations.push({
      id: "resume-paused",
      title: "Review paused tests",
      description: `${pausedTests.length} paused test${pausedTests.length === 1 ? "" : "s"} are holding back fresh data collection.`,
      tone: "warning",
    });
  }

  if (untestedTypes.length) {
    recommendations.push({
      id: "expand-coverage",
      title: "Expand test coverage",
      description: `No ${untestedTypes[0].label.toLowerCase()} tests have been run yet. Add one to broaden what the program can learn.`,
      tone: "neutral",
    });
  }

  if (weakestType) {
    recommendations.push({
      id: "improve-weakest-type",
      title: `Tighten ${weakestType.label.toLowerCase()} test hypotheses`,
      description: `${weakestType.label} tests are averaging ${weakestType.avgImprovement.toFixed(1)}% uplift with a ${weakestType.winRate.toFixed(0)}% win rate.`,
      tone: "neutral",
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "keep-iterating",
      title: "Maintain a steady test cadence",
      description: "The program is balanced enough to keep iterating on the strongest-performing channels and goals.",
      tone: "positive",
    });
  }

  return recommendations.slice(0, 4);
}

export function getABTestInsights(tests: ABTest[]): ABTestingInsightsData {
  const completedTests = getCompletedTests(tests);
  const completedWithResults = getCompletedTestsWithResults(tests);
  const winningTests = getWinningTests(tests);
  const totalVisitors = completedWithResults.reduce((sum, test) => sum + (test.results?.totalVisitors ?? 0), 0);
  const totalConversions = completedWithResults.reduce((sum, test) => sum + (test.results?.totalConversions ?? 0), 0);
  const totalRevenueImpact = completedWithResults.reduce((sum, test) => sum + (test.results?.revenueImpact ?? 0), 0);

  const summary: TestSummary = {
    totalTests: tests.length,
    activeTests: tests.filter((test) => test.status === "active").length,
    pausedTests: tests.filter((test) => test.status === "paused").length,
    draftTests: tests.filter((test) => test.status === "draft").length,
    completedTests: completedTests.length,
    completedWithResults: completedWithResults.length,
    wins: winningTests.length,
    winRate: completedWithResults.length ? (winningTests.length / completedWithResults.length) * 100 : 0,
    avgImprovement: average(winningTests.map((test) => test.results?.uplift ?? 0)),
    avgConfidence: average(completedWithResults.map((test) => test.results?.confidenceLevel ?? 0)),
    totalVisitors,
    totalConversions,
    avgVisitorsPerCompletedTest: completedWithResults.length ? totalVisitors / completedWithResults.length : 0,
    totalRevenueImpact,
    underpoweredActiveTests: tests.filter((test) => {
      if (test.status !== "active") return false;
      const visitors = test.results?.totalVisitors ?? 0;
      const confidence = test.results?.confidenceLevel ?? 0;
      return visitors < 200 || confidence < AB_TEST_CONFIDENCE_THRESHOLD;
    }).length,
  };

  const typePerformance: TypePerformance[] = TEST_TYPES.map((type) => {
    const testsByType = tests.filter((test) => test.type === type);
    const completedByType = completedWithResults.filter((test) => test.type === type);
    const winnersByType = winningTests.filter((test) => test.type === type);
    const visitorsByType = completedByType.reduce((sum, test) => sum + (test.results?.totalVisitors ?? 0), 0);

    return {
      type,
      label: AB_TEST_TYPE_LABELS[type],
      totalTests: testsByType.length,
      completedTests: completedByType.length,
      wins: winnersByType.length,
      winRate: completedByType.length ? (winnersByType.length / completedByType.length) * 100 : 0,
      avgImprovement: average(winnersByType.map((test) => test.results?.uplift ?? 0)),
      avgConfidence: average(completedByType.map((test) => test.results?.confidenceLevel ?? 0)),
      trafficShare: totalVisitors ? (visitorsByType / totalVisitors) * 100 : 0,
    };
  });

  const goalDistribution: GoalDistribution[] = TEST_GOALS.map((goal) => {
    const count = tests.filter((test) => test.goal === goal).length;
    return {
      goal,
      label: AB_TEST_GOAL_LABELS[goal],
      count,
      share: tests.length ? (count / tests.length) * 100 : 0,
    };
  }).filter((entry) => entry.count > 0);

  const strongestWinner = winningTests
    .slice()
    .sort((a, b) => (b.results?.uplift ?? 0) - (a.results?.uplift ?? 0))[0] ?? null;

  const recentWinners = winningTests
    .slice()
    .sort((a, b) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime())
    .slice(0, 5);

  return {
    summary,
    typePerformance,
    goalDistribution,
    strongestWinner,
    recentWinners,
    topInsights: getTopInsights(tests, summary, typePerformance),
    recommendations: getRecommendations(tests, summary, typePerformance),
  };
}
