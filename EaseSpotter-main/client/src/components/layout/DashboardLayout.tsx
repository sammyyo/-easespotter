import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Settings,
  BarChart,
  BarChart2,
  LineChart,
  Menu,
  Activity,
  Store,
  LogOut,
  Users,
  Megaphone,
  HeartPulse,
  Truck,
  Globe,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/ui/notification-center";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
// Import the custom logo
import LogoImg from "../../assets/EaseSpotter.png";

interface NavItem {
  icon: ReactNode;
  label: string;
  href?: string;
  admin?: boolean; // Flag to indicate if this is an admin-only item
  children?: NavItem[];
}

// Define all navigation items in a single array with admin flag
const allNavItems: NavItem[] = [
  { icon: <LayoutDashboard className="h-5 w-5" />, label: "Dashboard", href: "/dashboard" },
  { icon: <Package className="h-5 w-5" />, label: "Products", href: "/products" },
  { icon: <ShoppingCart className="h-5 w-5" />, label: "Cashier", href: "/cashier" },
  { icon: <Store className="h-5 w-5" />, label: "Store Profile", href: "/store-profile" },
  { icon: <BarChart className="h-5 w-5" />, label: "Analytics", href: "/analytics" },
  { icon: <LineChart className="h-5 w-5" />, label: "Advanced Analytics", href: "/advanced-analytics" },
  { icon: <BarChart2 className="h-5 w-5" />, label: "Competitors", href: "/competitors" },
  { icon: <Megaphone className="h-5 w-5" />, label: "Marketing", href: "/marketing" },
  { icon: <Settings className="h-5 w-5" />, label: "Pricing Rules", href: "/pricing-rules" },
  { icon: <Globe className="h-5 w-5" />, label: "Channel Management", href: "/channels" },
  { icon: <Truck className="h-5 w-5" />, label: "Supplier Management", href: "/suppliers" },
  { icon: <Users className="h-5 w-5" />, label: "Team Management", href: "/team" },
  { icon: <HeartPulse className="h-5 w-5" />, label: "Vendor Health", href: "/vendor-health" },
  {
    icon: <Settings className="h-5 w-5" />,
    label: "Settings",
    children: [
      { icon: <Activity className="h-4 w-4" />, label: "System Status", href: "/system-status" },
      { icon: <Settings className="h-4 w-4" />, label: "Vendor Settings", href: "/vendors" },
    ],
  },
];

// Function to get navigation items based on role
const getNavItems = (role?: string): NavItem[] => {
  if (role === "cashier") {
    return allNavItems.filter((item) => item.href === "/cashier");
  }

  // If admin, return all items; otherwise, filter out admin-only items
  return allNavItems.filter(item => !item.admin || role === 'admin');
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "easespotter:sidebar-collapsed";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(
    location === "/system-status" || location === "/vendors"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
  ));
  const { data: storeProfile } = useQuery<any>({
    queryKey: ["/api/stores/profile"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/stores/profile");
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error("Failed to load store profile");
      }
      return response.json();
    },
    enabled: !!user,
    retry: false,
  });
  
  // Add back the clicked function with navigation to root
  const clicked = () => {
    console.log("Logo clicked");
    navigate("/"); // Navigate to root page
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  const storeDisplayName = storeProfile?.name || user?.vendorName || user?.username || "Store";
  const userIdentityText = user ? `${user.username} • ${user.email}` : "";

  // Only show children without dashboard layout for public pages like login, registration,
  // invitation acceptance, the marketing pages, root page, or store pages
  if (
    location === "/" ||
    location === "/auth" ||
    location.startsWith("/accept-invitation/") ||
    location === "/stores" ||
    location.startsWith("/store/") ||
    location === "/features" ||
    location === "/pricing" ||
    location === "/about"
  ) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
      navigate("/");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const NavButton = ({
    item,
    active,
    collapsed,
  }: {
    item: NavItem;
    active: boolean;
    collapsed: boolean;
  }) => {
    const button = (
      <Button
        variant={active ? "default" : "ghost"}
        className={collapsed ? "h-11 w-11 justify-center p-0" : "w-full justify-start gap-2"}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </Button>
    );

    if (!collapsed) {
      return button;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  const NavContent = ({ collapsed = false }: { collapsed?: boolean }) => {
    // Add a console log to see what role we're getting
    console.log("Current user role:", user?.role);
    
    // Make sure we're only adding Vendor Health once
    const navItems = getNavItems(user?.role);
    
    // We don't need the filter as the items should be distinct now
    return (
      <TooltipProvider delayDuration={150}>
        <div className={`flex flex-col gap-2 ${collapsed ? "items-center" : ""}`}>
        {navItems.map((item) => {
          if (item.children?.length) {
            const hasActiveChild = item.children.some((child) => child.href === location);

            return (
              <div key={item.label} className={`flex flex-col gap-2 ${collapsed ? "items-center" : ""}`}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={hasActiveChild ? "default" : "ghost"}
                        className="h-11 w-11 justify-center p-0"
                        onClick={() => setSettingsOpen((current) => !current)}
                        aria-label={item.label}
                        title={item.label}
                      >
                        {item.icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant={hasActiveChild ? "default" : "ghost"}
                    className="w-full justify-between gap-2"
                    onClick={() => setSettingsOpen((current) => !current)}
                  >
                    <span className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                )}
                {settingsOpen && (
                  <div className={collapsed ? "flex flex-col items-center gap-2" : "ml-4 flex flex-col gap-2 pl-3"}>
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href!}>
                        <NavButton item={child} active={location === child.href} collapsed={collapsed} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href!}>
              <NavButton item={item} active={location === item.href} collapsed={collapsed} />
            </Link>
          );
        })}
        </div>
      </TooltipProvider>
    );
  };

  const UserMenu = () => {
    if (!user) return null;

    const initials = storeDisplayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              {storeProfile?.logoUrl &&
                !storeProfile.logoUrl.includes("/src/assets/") &&
                !storeProfile.logoUrl.includes("client/src/assets/") && (
                  <AvatarImage
                    src={storeProfile.logoUrl}
                    alt={`${storeDisplayName} logo`}
                    className="object-contain"
                  />
                )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              <p className="font-medium">{storeDisplayName}</p>
              <p className="text-sm text-muted-foreground">{userIdentityText}</p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/vendors">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
          {user.role === 'admin' && (
            <>
              <DropdownMenuItem asChild>
                <Link href="/team">
                  <Users className="mr-2 h-4 w-4" />
                  <span>Team Management</span>
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col lg:flex-row">
        {isMobile ? (
          <div className="w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64">
                    <nav className="mt-8">
                      <NavContent />
                    </nav>
                  </SheetContent>
                </Sheet>
                <Link href="/" onClick={clicked} className="ml-4 flex items-center">
                  <img src={LogoImg} alt="EaseSpotter Logo" className="h-10" />
                  <span className="ml-2 font-bold text-xl">EaseSpotter</span>
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <NotificationCenter />
                <UserMenu />
              </div>
            </div>
          </div>
        ) : (
          <aside className={`${sidebarCollapsed ? "w-20" : "w-64"} border-r min-h-screen p-4 flex flex-col transition-[width] duration-200`}>
            <div className="flex flex-col mb-8 space-y-4">
              <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
                <Link href="/" onClick={clicked} className={`flex items-center ${sidebarCollapsed ? "justify-center" : ""}`}>
                  <img src={LogoImg} alt="EaseSpotter Logo" className="h-12" />
                  {!sidebarCollapsed && <span className="ml-2 font-bold text-xl">EaseSpotter</span>}
                </Link>
              </div>
              <Button
                variant="outline"
                size={sidebarCollapsed ? "icon" : "sm"}
                className={sidebarCollapsed ? "mx-auto h-9 w-9" : "w-full justify-between"}
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <>
                    <span>Collapse</span>
                    <PanelLeftClose className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
            <nav className="flex-1">
              <NavContent collapsed={sidebarCollapsed} />
            </nav>
            <div className="mt-auto pt-4 border-t">
              {user && (
                <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
                  <div>
                    {sidebarCollapsed ? (
                      <Avatar className="h-9 w-9">
                        {storeProfile?.logoUrl &&
                          !storeProfile.logoUrl.includes("/src/assets/") &&
                          !storeProfile.logoUrl.includes("client/src/assets/") && (
                            <AvatarImage
                              src={storeProfile.logoUrl}
                              alt={`${storeDisplayName} logo`}
                              className="object-contain"
                            />
                          )}
                        <AvatarFallback>{storeDisplayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <>
                        <p className="font-medium text-sm">{storeDisplayName}</p>
                        <p className="text-xs text-muted-foreground">{userIdentityText}</p>
                        <p className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 mt-1 inline-block">
                          {user.role === 'admin' ? 'Admin' : user.role === 'cashier' ? 'Cashier' : user.role === 'vendor' ? 'Owner' : 'User'}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
        <div className="flex-1 flex flex-col">
          {!isMobile && (
            <div className="flex items-center justify-end gap-3 p-2 pr-8 border-b">
              <NotificationCenter />
              <UserMenu />
            </div>
          )}
          <main className={`flex-1 ${isMobile ? 'p-4' : 'py-2 px-8'}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
