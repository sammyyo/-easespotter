import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installApiFetchShim } from "@/lib/runtime-config";
import App from "./App";
import "./index.css";

installApiFetchShim();

// Initialize theme based on local storage, system preference, or schedule
function initializeTheme() {
  // First check if there's a schedule active
  const themeSchedule = localStorage.getItem("themeSchedule");
  const manualOverride = localStorage.getItem("themeManualOverride");
  
  // If there's an active schedule and no manual override, apply the scheduled theme
  if (themeSchedule && !manualOverride) {
    const schedule = JSON.parse(themeSchedule);
    
    if (schedule.enabled) {
      // Check the current time against the schedule
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      const [darkStartHour, darkStartMinute] = schedule.darkModeStart.split(":").map(Number);
      const [darkEndHour, darkEndMinute] = schedule.darkModeEnd.split(":").map(Number);
      
      const darkStartTime = darkStartHour * 60 + darkStartMinute;
      const darkEndTime = darkEndHour * 60 + darkEndMinute;
      
      let scheduledTheme;
      
      // Check if dark mode spans midnight
      if (darkStartTime > darkEndTime) {
        // If current time is between dark start and midnight OR between midnight and dark end
        if (currentTime >= darkStartTime || currentTime < darkEndTime) {
          scheduledTheme = "dark";
        } else {
          scheduledTheme = "light";
        }
      } else {
        // Normal case
        if (currentTime >= darkStartTime && currentTime < darkEndTime) {
          scheduledTheme = "dark";
        } else {
          scheduledTheme = "light";
        }
      }
      
      // Apply the scheduled theme
      applyTheme(scheduledTheme);
      return;
    }
  }
  
  // If we reach here, either there's no active schedule or there's a manual override
  // Fall back to the normal theme handling
  const savedTheme = localStorage.getItem("theme") || "system";
  applyTheme(savedTheme);
}

// Apply the theme to the document
function applyTheme(theme: string) {
  const root = window.document.documentElement;
  
  // Remove existing class
  root.classList.remove("light", "dark");
  
  if (theme === "system") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }
}

// Run theme initialization immediately
initializeTheme();

// Set up an interval to check the theme schedule every minute
const ONE_MINUTE = 60 * 1000;
setInterval(initializeTheme, ONE_MINUTE);

function renderApp(container: HTMLElement) {
  const root = createRoot(container);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

function handleError(error: Error) {
  console.error("Application failed to start:", error);
  const errorContainer = document.createElement("div");
  errorContainer.innerHTML = `
    <div style="padding: 20px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="color: #ef4444; margin-bottom: 16px;">Application Error</h1>
      <p style="color: #374151; margin-bottom: 16px;">Sorry, the application failed to load. Please try reloading the page.</p>
      <pre style="background: #f3f4f6; padding: 16px; border-radius: 6px; text-align: left; overflow-x: auto;">
        ${error.message}
      </pre>
    </div>
  `;
  document.body.appendChild(errorContainer);
}

function initApp() {
  try {
    const container = document.getElementById("root");
    if (!container) {
      throw new Error("Could not find root element. Please check your HTML file.");
    }
    renderApp(container);
  } catch (error) {
    handleError(error as Error);
  }
}

// Wait for DOM to be fully loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  // If DOMContentLoaded has already fired, wait for a micro-task to ensure all scripts are loaded
  queueMicrotask(initApp);
}
