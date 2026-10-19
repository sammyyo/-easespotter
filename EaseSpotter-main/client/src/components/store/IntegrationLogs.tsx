import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface IntegrationLog {
  id: number;
  vendorId: number;
  integrationType: string;
  action: string;
  status: string;
  details: string | null;
  errorMessage: string | null;
  timestamp: string;
}

export function IntegrationLogs() {
  const { data: logs, isLoading, error } = useQuery<IntegrationLog[]>({
    queryKey: ["/api/stores/integration-logs"],
    queryFn: getQueryFn(),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200 border-green-200";
      case "failed":
        return "bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200 border-red-200";
      case "in_progress":
        return "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200 border-blue-200";
      default:
        return "bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200";
    }
  };

  const formatDetails = (details: string | null) => {
    if (!details) return "None";
    try {
      const parsed = JSON.parse(details);
      return Object.entries(parsed)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
    } catch (e) {
      return details;
    }
  };

  const formatActionName = (action: string) => {
    return action
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatIntegrationType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integration Logs</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-52">
          <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integration Logs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-52 text-center gap-4">
          <AlertCircle className="h-12 w-12 text-destructive/70" />
          <p className="text-destructive">Failed to load integration logs</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Integration Logs</CardTitle>
        <CardDescription>Track your store's integration activities and events</CardDescription>
      </CardHeader>
      <CardContent>
        {(!logs || logs.length === 0) ? (
          <div className="text-center p-8 text-muted-foreground">
            No integration logs found
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>{formatIntegrationType(log.integrationType)}</TableCell>
                    <TableCell>{formatActionName(log.action)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusColor(log.status)}
                      >
                        {log.status === "in_progress" ? "In Progress" : log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {log.status === "failed" ? (
                        <span className="text-destructive">
                          {log.errorMessage || "Unknown error"}
                        </span>
                      ) : (
                        formatDetails(log.details)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}