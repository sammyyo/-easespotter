import { useState, useEffect } from "react";
import { Clock, Moon, Sun, Monitor } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Type for theme
type Theme = "dark" | "light" | "system";

// Schedule settings type
interface ScheduleSettings {
  enabled: boolean;
  darkModeStart: string; // Time in 24hr format (HH:MM)
  darkModeEnd: string;   // Time in 24hr format (HH:MM)
}

const DEFAULT_SCHEDULE: ScheduleSettings = {
  enabled: false,
  darkModeStart: "18:00", // 6:00 PM
  darkModeEnd: "06:00",   // 6:00 AM
};

export function ThemeScheduler() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE);
  const [currentTheme, setCurrentTheme] = useState<Theme>("system");
  const [scheduledTheme, setScheduledTheme] = useState<Theme | null>(null);
  const [nextChangeTime, setNextChangeTime] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState<boolean>(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem("themeSchedule");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    const savedTheme = localStorage.getItem("theme") as Theme || "system";
    setCurrentTheme(savedTheme);

    // Check if there's a manual override
    const override = localStorage.getItem("themeManualOverride");
    if (override) {
      setManualOverride(JSON.parse(override));
    }

    // Start the scheduler
    return () => {
      // Cleanup
    };
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem("themeSchedule", JSON.stringify(settings));
    
    // If settings are enabled, calculate next change time
    if (settings.enabled) {
      updateScheduledTheme();
    }
  }, [settings]);

  // Update the scheduled theme based on current time
  const updateScheduledTheme = () => {
    if (!settings.enabled) {
      setScheduledTheme(null);
      setNextChangeTime(null);
      return;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [darkStartHour, darkStartMinute] = settings.darkModeStart.split(":").map(Number);
    const [darkEndHour, darkEndMinute] = settings.darkModeEnd.split(":").map(Number);
    
    const darkStartTime = darkStartHour * 60 + darkStartMinute;
    const darkEndTime = darkEndHour * 60 + darkEndMinute;
    
    let nextTheme: Theme;
    let nextChangeTimeStr: string;
    
    // Check if dark mode spans midnight (e.g., 8pm to 6am)
    if (darkStartTime > darkEndTime) {
      // If current time is between dark start and midnight OR between midnight and dark end
      if (currentTime >= darkStartTime || currentTime < darkEndTime) {
        nextTheme = "dark";
        
        // Next change is at dark end time
        const nextChangeDate = new Date(now);
        if (currentTime >= darkStartTime) {
          // If we're after dark start, the next change is tomorrow
          nextChangeDate.setDate(nextChangeDate.getDate() + 1);
        }
        nextChangeDate.setHours(darkEndHour, darkEndMinute, 0, 0);
        nextChangeTimeStr = nextChangeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        nextTheme = "light";
        
        // Next change is at dark start time
        const nextChangeDate = new Date(now);
        nextChangeDate.setHours(darkStartHour, darkStartMinute, 0, 0);
        nextChangeTimeStr = nextChangeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      // Normal case (e.g., 8am to 8pm)
      if (currentTime >= darkStartTime && currentTime < darkEndTime) {
        nextTheme = "dark";
        
        // Next change is at dark end time
        const nextChangeDate = new Date(now);
        nextChangeDate.setHours(darkEndHour, darkEndMinute, 0, 0);
        nextChangeTimeStr = nextChangeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        nextTheme = "light";
        
        // Next change is at dark start time
        const nextChangeDate = new Date(now);
        if (currentTime >= darkEndTime) {
          // If we're after dark end, the next change is tomorrow
          nextChangeDate.setDate(nextChangeDate.getDate() + 1);
        }
        nextChangeDate.setHours(darkStartHour, darkStartMinute, 0, 0);
        nextChangeTimeStr = nextChangeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    
    setScheduledTheme(nextTheme);
    setNextChangeTime(nextChangeTimeStr);
    
    // Apply the theme if not manually overridden
    if (!manualOverride) {
      applyTheme(nextTheme);
    }
  };

  // Apply theme function
  const applyTheme = (theme: Theme) => {
    const root = window.document.documentElement;
    
    // First update localStorage
    localStorage.setItem("theme", theme);
    
    // Remove existing class
    root.classList.remove("light", "dark");
    
    // Get system preference if necessary
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    
    // Update the current theme state
    setCurrentTheme(theme);
  };

  // Handle toggle for schedule
  const handleToggleSchedule = (enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      enabled
    }));
    
    if (enabled) {
      // When enabling, clear any manual override
      setManualOverride(false);
      localStorage.removeItem("themeManualOverride");
      
      // Update immediately
      updateScheduledTheme();
      
      toast({
        title: "Theme Schedule Enabled",
        description: "Your theme will now automatically switch based on the time of day.",
      });
    } else {
      toast({
        title: "Theme Schedule Disabled",
        description: "Automatic theme switching has been turned off.",
      });
    }
  };

  // Handle changes to the schedule time settings
  const handleTimeChange = (timeType: 'darkModeStart' | 'darkModeEnd', value: string) => {
    setSettings(prev => ({
      ...prev,
      [timeType]: value
    }));
  };

  // Handle manual theme change
  const handleManualThemeChange = (theme: Theme) => {
    // Set manual override flag
    setManualOverride(true);
    localStorage.setItem("themeManualOverride", "true");
    
    // Apply the new theme
    applyTheme(theme);
    
    toast({
      title: "Manual Theme Change",
      description: `Theme set to ${theme}. Schedule is temporarily overridden.`,
    });
  };

  // Reset to scheduled theme
  const handleResetToSchedule = () => {
    setManualOverride(false);
    localStorage.removeItem("themeManualOverride");
    updateScheduledTheme();
    
    toast({
      title: "Schedule Restored",
      description: "Your theme will now follow the schedule again.",
    });
  };

  // Generate time options for the dropdowns
  const timeOptions = Array.from({ length: 24 }, (_, hour) => {
    return [
      `${hour.toString().padStart(2, '0')}:00`,
      `${hour.toString().padStart(2, '0')}:30`
    ];
  }).flat();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>Theme Scheduler</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Label htmlFor="schedule-switch" className="text-sm cursor-pointer">
              {settings.enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="schedule-switch"
              checked={settings.enabled}
              onCheckedChange={handleToggleSchedule}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Schedule Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Schedule Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dark-start">Dark Mode Start</Label>
                <Select
                  value={settings.darkModeStart}
                  onValueChange={(value) => handleTimeChange('darkModeStart', value)}
                  disabled={!settings.enabled}
                >
                  <SelectTrigger id="dark-start">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {timeOptions.map((time) => (
                        <SelectItem key={`start-${time}`} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dark-end">Dark Mode End</Label>
                <Select
                  value={settings.darkModeEnd}
                  onValueChange={(value) => handleTimeChange('darkModeEnd', value)}
                  disabled={!settings.enabled}
                >
                  <SelectTrigger id="dark-end">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {timeOptions.map((time) => (
                        <SelectItem key={`end-${time}`} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Status Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Status</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between col-span-2">
                <span>Current Theme</span>
                <Badge variant="outline" className="capitalize">
                  {currentTheme}
                </Badge>
              </div>
              {settings.enabled && (
                <>
                  <div className="flex items-center justify-between col-span-2">
                    <span>Scheduled Theme</span>
                    <Badge variant="outline" className="capitalize">
                      {scheduledTheme || "Not set"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between col-span-2">
                    <span>Next Change</span>
                    <Badge variant="outline">
                      {nextChangeTime || "Not scheduled"}
                    </Badge>
                  </div>
                  {manualOverride && (
                    <div className="flex items-center justify-between col-span-2">
                      <span>Status</span>
                      <Badge variant="destructive">Manual Override</Badge>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Manual Theme Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Manual Control</h3>
              {manualOverride && settings.enabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetToSchedule}
                >
                  Resume Schedule
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={currentTheme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => handleManualThemeChange("light")}
                className="flex items-center"
              >
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
              <Button
                variant={currentTheme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => handleManualThemeChange("dark")}
                className="flex items-center"
              >
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
              <Button
                variant={currentTheme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => handleManualThemeChange("system")}
                className="flex items-center"
              >
                <Monitor className="mr-2 h-4 w-4" />
                System
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Manual theme changes will override the schedule until you resume it.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}