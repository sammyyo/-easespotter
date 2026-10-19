import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Activity, AlertCircle, AlertTriangle, BanIcon, Check, ChevronRight, ClipboardList, Clock, Copy, Eye, 
  File, FileCog, InfoIcon, Key, Lock, LockIcon, Mail, Phone, 
  RefreshCw, Settings, Shield, ShieldAlert, ShieldCheck, 
  Trash2, UserCog, UserPlus, Users 
} from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

// Define invitation schema with better conditional validation
const invitationSchema = z.discriminatedUnion('contactMethod', [
  // Email contact method schema
  z.object({
    contactMethod: z.literal('email'),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(), // Optional when using email
    role: z.enum(["admin", "user", "cashier"]),
    permissionProfileId: z.string().optional(),
  }),
  // Phone contact method schema
  z.object({
    contactMethod: z.literal('phone'),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    email: z.string().optional(), // Optional when using phone
    role: z.enum(["admin", "user", "cashier"]),
    permissionProfileId: z.string().optional(),
  })
]);

// Define types
type InvitationFormValues = z.infer<typeof invitationSchema>;

interface Invitation {
  id: number;
  token: string;
  email?: string;
  phone?: string;
  role: string;
  permissionProfileId?: number | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  createdBy: number;
  acceptedAt?: string;
}

interface InvitationEmailConfig {
  configured: boolean;
  provider: string;
  senderEmail: string;
  senderName: string;
  baseUrl: string;
}

interface TeamMember {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  lastLogin?: string;
  createdAt: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  permissionProfileId?: number | null;
  permissionProfileName?: string | null;
}

interface PermissionProfile {
  id: number;
  name: string;
  description?: string;
  permissions: Record<string, boolean>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserPermission {
  id: number;
  userId: number;
  profileId: number;
  profileName?: string;
  customPermissions?: Record<string, boolean>;
  assignedBy: number;
  assignedByName?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserActivity {
  id: number;
  userId: number;
  username: string;
  action: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'view';
  resourceType: 'product' | 'price' | 'competitor' | 'rule' | 'promotion' | 'team' | 'vendor' | 'system';
  resourceId?: number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface UserSettings {
  id: number;
  userId: number;
  notificationEmail: boolean;
  notificationSms: boolean;
  notificationInApp: boolean;
  theme: string;
  language: string;
  dashboardLayout?: Record<string, any>;
  mfaEnabled: boolean;
  updatedAt: string;
}

export default function TeamManagement() {
  const { user } = useAuth();
  const isTeamManager = user?.role === 'admin' || user?.role === 'vendor';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<string>("team-members");
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [showAssignPermissionsDialog, setShowAssignPermissionsDialog] = useState<boolean>(false);
  const [selectedPermissionProfileId, setSelectedPermissionProfileId] = useState<string>("none");
  const [editedPermissions, setEditedPermissions] = useState<Record<string, boolean>>({});
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState<boolean>(false);
  const [newProfileData, setNewProfileData] = useState<{
    name: string;
    description: string;
    permissions: Record<string, boolean>;
  }>({
    name: '',
    description: '',
    permissions: {
      viewProducts: true,
      viewPricing: true,
      viewCompetitors: true,
      viewVendor: true,
      viewTeam: true,
      viewReports: true,
      viewSystemStatus: true,
      editProducts: false,
      editPricing: false,
      editCompetitors: false,
      editVendor: false,
      editTeam: false,
      adminAccess: false
    }
  });
  const [activityFilters, setActivityFilters] = useState<{
    userId?: number;
    startDate?: string;
    endDate?: string;
    action?: string;
    resourceType?: string;
  }>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusToUpdate, setStatusToUpdate] = useState<string>('active');
  const resetNewProfileData = () => {
    setNewProfileData({
      name: '',
      description: '',
      permissions: {
        viewProducts: true,
        viewPricing: true,
        viewCompetitors: true,
        viewVendor: true,
        viewTeam: true,
        viewReports: true,
        viewSystemStatus: true,
        editProducts: false,
        editPricing: false,
        editCompetitors: false,
        editVendor: false,
        editTeam: false,
        adminAccess: false
      }
    });
  };

  // Fetch team members (users belonging to the same vendor)
  const { data: teamMembers = [], isLoading: isLoadingTeam } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: !!user?.vendorId,
  });

  // Fetch pending invitations
  const { data: invitations = [], isLoading: isLoadingInvitations } = useQuery<Invitation[]>({
    queryKey: ["/api/invitations"],
    enabled: !!user?.vendorId,
  });

  const { data: invitationEmailConfig } = useQuery<InvitationEmailConfig>({
    queryKey: ["/api/invitations/email-config"],
    enabled: !!user?.vendorId && isTeamManager,
  });

  const invitationBaseUrl = invitationEmailConfig?.baseUrl || "https://www.easespotter.com";
  
  // Fetch permission profiles
  const { data: permissionProfiles = [], isLoading: isLoadingProfiles } = useQuery<PermissionProfile[]>({
    queryKey: ["/api/permission-profiles"],
    enabled: !!user?.vendorId && isTeamManager,
  });
  
  // Fetch user activity logs with filters
  const { data: activityLogs = [], isLoading: isLoadingActivity } = useQuery<UserActivity[]>({
    queryKey: ["/api/user-activity", activityFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (activityFilters.userId) {
        params.append('userId', activityFilters.userId.toString());
      }
      
      if (activityFilters.startDate) {
        params.append('startDate', activityFilters.startDate);
      }
      
      if (activityFilters.endDate) {
        params.append('endDate', activityFilters.endDate);
      }
      
      if (activityFilters.action) {
        params.append('action', activityFilters.action);
      }
      
      if (activityFilters.resourceType) {
        params.append('resourceType', activityFilters.resourceType);
      }
      
      const res = await fetch(`/api/user-activity?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch activity logs');
      }
      
      return res.json();
    },
    enabled: !!user?.vendorId && isTeamManager,
  });
  
  // Fetch user settings
  const { data: userSettings, isLoading: isLoadingSettings } = useQuery<UserSettings>({
    queryKey: ["/api/user-settings"],
    enabled: !!user?.id,
  });

  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: async (values: InvitationFormValues) => {
      console.log("Sending invitation data to API:", values);
      
      // Ensure we're only sending validated data to the API
      const payload = {
        contactMethod: values.contactMethod,
        email: values.contactMethod === "email" ? values.email : undefined,
        phone: values.contactMethod === "phone" ? values.phone : undefined,
        role: values.role,
        permissionProfileId: values.permissionProfileId && values.permissionProfileId !== "none"
          ? values.permissionProfileId
          : undefined,
      };
      
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create invitation");
      }
      
      return await res.json();
    },
    onSuccess: (data, variables) => {
      const emailWasRequested = variables.contactMethod === "email";

      toast({
        title: emailWasRequested && !data.emailSent ? "Invitation link created" : "Invitation sent",
        description: emailWasRequested && !data.emailSent
          ? "Brevo email is not configured or did not send. Copy the invitation link from Pending Invitations."
          : "The team member has been invited successfully.",
        variant: "default",
      });
      
      // Force refresh of the invitations data
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      
      // Switch to the pending invitations tab to show the new invitation
      setSelectedTab("pending-invitations");
      
      // Reset the form
      form.reset({
        contactMethod: "email",
        email: "",
        phone: "",
        role: "user",
        permissionProfileId: "none",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Resend invitation mutation
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      const res = await fetch(`/api/invitations/${invitationId}/resend`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to resend invitation");
      }
      
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.emailSent ? "Invitation resent" : "Invitation link is ready",
        description: data.emailSent
          ? "The invitation has been resent successfully."
          : "Brevo email is not configured or did not send. Copy the invitation link manually.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      const res = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to cancel invitation");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation cancelled",
        description: "The invitation has been cancelled successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove team member mutation
  const removeTeamMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/team-members/${userId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to remove team member");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Team member removed",
        description: "The team member has been removed successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update user status mutation
  const updateUserStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: string }) => {
      const res = await fetch(`/api/team-members/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update user status");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Status updated",
        description: "Team member status has been updated successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowStatusDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Assign user permission profile mutation
  const assignPermissionProfileMutation = useMutation({
    mutationFn: async ({ userId, profileId }: { userId: number; profileId: number }) => {
      const res = await fetch("/api/user-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, profileId }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to assign permission profile");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Permissions updated",
        description: "Permission profile has been assigned successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowAssignPermissionsDialog(false);
      setSelectedMember(null);
      setSelectedPermissionProfileId("none");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Create permission profile mutation
  const createPermissionProfileMutation = useMutation({
    mutationFn: async (profile: { name: string; description?: string; permissions: Record<string, boolean> }) => {
      const res = await fetch('/api/permission-profiles', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create permission profile");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile created",
        description: "Permission profile has been created successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/permission-profiles"] });
      setShowCreateProfileDialog(false);
      resetNewProfileData();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update user settings mutation
  const updateUserSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<UserSettings>) => {
      const res = await fetch('/api/user-settings', {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update user settings");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings updated",
        description: "Your settings have been updated successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update permission profile mutation
  const updatePermissionProfileMutation = useMutation({
    mutationFn: async ({ profileId, permissions }: { profileId: number; permissions: Record<string, boolean> }) => {
      const res = await fetch(`/api/permission-profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update permission profile");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Permissions updated",
        description: "Permission profile has been updated successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/permission-profiles"] });
      setSelectedProfile(null);
      setEditedPermissions({});
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Delete permission profile mutation
  const deletePermissionProfileMutation = useMutation({
    mutationFn: async (profileId: number) => {
      const res = await fetch(`/api/permission-profiles/${profileId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete permission profile");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile deleted",
        description: "Permission profile has been deleted successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/permission-profiles"] });
      setSelectedProfile(null);
      setEditedPermissions({});
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Delete user account completely mutation
  const deleteUserAccountMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete user account");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User account deleted",
        description: "The user account has been completely deleted.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowDeleteAccountDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form setup for invitations
  const form = useForm<InvitationFormValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      contactMethod: "email",
      email: "",
      phone: "",
      role: "user",
      permissionProfileId: "none",
    },
  });

  // Add extra debugging to see what's happening on submission
  // Simplified submission handler with better schema validation
  function onSubmit(values: InvitationFormValues) {
    console.log("Form submission started with values:", values);
    
    try {
      // The schema validation should have already validated all the fields
      // So we can just pass the validated values to the mutation
      console.log("Form validation passed, submitting to mutation...");
      
      // Only create the invitation if we have valid data
      createInvitationMutation.mutate(values);
    } catch (error) {
      console.error("Error during form submission:", error);
      toast({
        title: "Submission Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  }

  // Format timestamp for display
  function formatDate(dateString?: string) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(date);
  }

  // Function to get status badge color
  function getStatusColor(status: string) {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
      case "accepted":
        return "bg-green-100 text-green-800 hover:bg-green-100";
      case "expired":
        return "bg-gray-100 text-gray-800 hover:bg-gray-100";
      case "cancelled":
        return "bg-red-100 text-red-800 hover:bg-red-100";
      default:
        return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    }
  }

  // Function to get role badge
  function getRoleBadge(role: string) {
    if (role === "admin") {
      return <Badge variant="secondary" className="capitalize bg-primary/10 hover:bg-primary/20 text-primary">{role}</Badge>;
    }
    if (role === "cashier") {
      return <Badge variant="secondary" className="capitalize bg-orange-100 text-orange-800 hover:bg-orange-100">{role}</Badge>;
    }
    if (role === "vendor") {
      return <Badge variant="secondary" className="capitalize bg-green-100 text-green-800 hover:bg-green-100">Owner</Badge>;
    }
    return <Badge variant="outline" className="capitalize">{role}</Badge>;
  }

  const selectedTeamMember = teamMembers.find((member) => member.id === selectedMember);

  return (
    <div className="container py-10 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team members and invitations
          </p>
        </div>
        <Button onClick={() => setSelectedTab("invite")} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Team Member
        </Button>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="team-members">
            <Users className="h-4 w-4 mr-2" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="pending-invitations">
            <Mail className="h-4 w-4 mr-2" />
            Invitations
          </TabsTrigger>
          <TabsTrigger value="invite">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite
          </TabsTrigger>
          <TabsTrigger value="permission-profiles">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="user-activity">
            <Activity className="h-4 w-4 mr-2" />
            Activity Logs
          </TabsTrigger>
          <TabsTrigger value="user-settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team-members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {teamMembers.length > 0 
                  ? `You have ${teamMembers.length} active team members in your account.`
                  : "You don't have any team members yet. Invite someone to get started."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 && !isLoadingTeam ? (
                <div className="text-center py-8">
                  <UserPlus className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <h3 className="text-lg font-medium">No team members yet</h3>
                  <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                    Your team is empty. Click the "Invite Team Member" button to add your first team member.
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setSelectedTab("invite")}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Someone
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="font-semibold text-primary">
                                {member.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium">{member.username}</div>
                              <div className="text-xs text-muted-foreground">{member.email}</div>
                              {member.phone && <div className="text-xs text-muted-foreground">{member.phone}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {getRoleBadge(member.role)}
                            <div className="text-xs text-muted-foreground">
                              {member.permissionProfileName || "No permission profile"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              member.status === 'active' ? 'outline' : 
                              member.status === 'suspended' ? 'secondary' : 'destructive'
                            } 
                            className={cn(
                              "capitalize",
                              member.status === 'active' ? "bg-green-100 text-green-800 hover:bg-green-100" :
                              member.status === 'suspended' ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                              "bg-red-100 text-red-800 hover:bg-red-100"
                            )}
                          >
                            {member.status || 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(member.lastLogin)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {member.id !== user?.id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <UserCog className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Manage User</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedMember(member.id);
                                      setSelectedTab("user-activity");
                                      setActivityFilters({ userId: member.id });
                                    }}
                                  >
                                    <Activity className="h-4 w-4 mr-2" />
                                    View Activity Logs
                                  </DropdownMenuItem>
                                  
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedMember(member.id);
                                      setSelectedPermissionProfileId(
                                        member.permissionProfileId ? String(member.permissionProfileId) : "none"
                                      );
                                      setShowAssignPermissionsDialog(true);
                                    }}
                                  >
                                    <Shield className="h-4 w-4 mr-2" />
                                    Assign Permissions
                                  </DropdownMenuItem>
                                  
                                  <DropdownMenuSeparator />
                                  
                                  {member.status === 'active' && (
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        setSelectedMember(member.id);
                                        setStatusToUpdate('suspended');
                                        setShowStatusDialog(true);
                                      }}
                                      className="text-yellow-600"
                                    >
                                      <BanIcon className="h-4 w-4 mr-2" />
                                      Suspend Account
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {member.status === 'suspended' && (
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        setSelectedMember(member.id);
                                        setStatusToUpdate('active');
                                        setShowStatusDialog(true);
                                      }}
                                    >
                                      <Check className="h-4 w-4 mr-2" />
                                      Reactivate Account
                                    </DropdownMenuItem>
                                  )}
                                  
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setSelectedMember(member.id);
                                      setShowDeleteDialog(true);
                                    }}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remove From Team
                                  </DropdownMenuItem>
                                  
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setSelectedMember(member.id);
                                      setShowDeleteAccountDialog(true);
                                    }}
                                    className="text-destructive font-bold"
                                  >
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                    Delete Account Permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending-invitations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>
                {invitations.length > 0 
                  ? `You have ${invitations.length} pending invitations.`
                  : "You don't have any pending invitations."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 && !isLoadingInvitations ? (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <h3 className="text-lg font-medium">No pending invitations</h3>
                  <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                    You don't have any pending invitations. Invite team members to collaborate.
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setSelectedTab("invite")}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Someone
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center justify-between border-b pb-4 last:border-b-0 last:pb-0">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-semibold text-primary">
                            {invitation.email 
                              ? <Mail className="h-5 w-5" />
                              : <Phone className="h-5 w-5" />
                            }
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">
                            {invitation.email || invitation.phone}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs font-normal capitalize", getStatusColor(invitation.status))}
                            >
                              {invitation.status}
                            </Badge>
                            <span className="mx-1">·</span>
                            <span>Expires {formatDate(invitation.expiresAt)}</span>
                          </div>
                          
                          {/* Invitation Link */}
                          <div className="mt-2 flex gap-2 items-center">
                            <Input 
                              className="text-xs h-8 max-w-sm" 
                              value={`${invitationBaseUrl}/accept-invitation/${invitation.token}`}
                              readOnly
                              onClick={(e) => e.currentTarget.select()}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => {
                                navigator.clipboard.writeText(`${invitationBaseUrl}/accept-invitation/${invitation.token}`);
                                toast({
                                  title: "Invitation link copied",
                                  description: "The link has been copied to clipboard.",
                                  variant: "default",
                                });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-2" /> Copy
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(invitation.role)}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => resendInvitationMutation.mutate(invitation.id)}
                          disabled={resendInvitationMutation.isPending}
                          title="Resend invitation"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                          disabled={cancelInvitationMutation.isPending}
                          title="Cancel invitation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invite">
          <Card>
            <CardHeader>
              <CardTitle>Invite Team Member</CardTitle>
              <CardDescription>
                Send an invitation to a new team member via email or phone number.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className={cn("mb-6", invitationEmailConfig?.configured ? "border-green-200 bg-green-50 text-green-900" : "")}>
                {invitationEmailConfig?.configured ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>
                  {invitationEmailConfig?.configured ? "Brevo invite emails are configured" : "Invite email fallback"}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    {invitationEmailConfig?.configured
                      ? `Email invitations will be sent through Brevo from ${invitationEmailConfig.senderName} <${invitationEmailConfig.senderEmail}>.`
                      : "Brevo is not configured for invite delivery. Invitations will still be created, and you can copy the shareable link manually."}
                  </p>
                  <p className="mt-2">Invites are valid for 7 days. After creating an invitation, go to the <strong>Pending Invitations</strong> tab where you can:</p>
                  <ul className="list-disc pl-6 mt-1 space-y-1 text-sm">
                    <li>See a shareable invitation link for each invitation</li>
                    <li>Copy the link to send manually to team members</li>
                    <li>Resend or cancel invitations as needed</li>
                  </ul>
                  <p className="mt-2 text-muted-foreground text-sm">Team members can join by visiting the invitation link you share with them.</p>
                </AlertDescription>
              </Alert>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="contactMethod"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Contact Method</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="email" id="contact-email" />
                              <Label htmlFor="contact-email" className="flex items-center">
                                <Mail className="mr-2 h-4 w-4" />
                                Email
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="phone" id="contact-phone" />
                              <Label htmlFor="contact-phone" className="flex items-center">
                                <Phone className="mr-2 h-4 w-4" />
                                Phone Number
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("contactMethod") === "email" ? (
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input placeholder="team@example.com" {...field} />
                          </FormControl>
                          <FormDescription>
                            An invitation will be sent to this email address.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 (555) 123-4567" {...field} />
                          </FormControl>
                          <FormDescription>
                            An SMS with invitation link will be sent to this phone number.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Role</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="user" id="role-user" />
                              <Label htmlFor="role-user">Regular User</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="cashier" id="role-cashier" />
                              <Label htmlFor="role-cashier">Cashier</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="admin" id="role-admin" />
                              <Label htmlFor="role-admin">Admin</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormDescription>
                          Cashiers can only access the Cashier page. Admins can manage products, settings, and team members.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permissionProfileId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Permission Profile</FormLabel>
                        <Select
                          value={field.value || "none"}
                          onValueChange={field.onChange}
                          disabled={permissionProfiles.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose access permissions" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No profile assigned</SelectItem>
                            {permissionProfiles.map((profile) => (
                              <SelectItem key={profile.id} value={String(profile.id)}>
                                {profile.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Optional. Choose exactly what this team member can access after accepting the invite.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4">
                    <Button 
                      type="submit" 
                      className="w-full sm:w-auto"
                      disabled={createInvitationMutation.isPending}
                    >
                      {createInvitationMutation.isPending && (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Send Invitation
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="permission-profiles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Permission Profiles</CardTitle>
              <CardDescription>
                Manage permission profiles for fine-grained access control
              </CardDescription>
            </CardHeader>
            <CardContent>
              {permissionProfiles.length === 0 && !isLoadingProfiles ? (
                <div className="text-center py-8">
                  <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <h3 className="text-lg font-medium">No permission profiles yet</h3>
                  <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                    Define permission profiles to grant specific access rights to team members. 
                    Each profile contains a set of permissions that can be assigned to users.
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setShowCreateProfileDialog(true)}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Create Profile
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-medium">Available Profiles</h3>
                      <p className="text-sm text-muted-foreground">
                        Select a profile to view or edit its permissions
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowCreateProfileDialog(true)}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Create New Profile
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {permissionProfiles.map(profile => (
                      <Card key={profile.id} className={cn(
                        "cursor-pointer transition-all",
                        selectedProfile === profile.id ? "border-primary" : "hover:border-muted-foreground/25"
                      )} onClick={() => setSelectedProfile(profile.id)}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-base">{profile.name}</CardTitle>
                            {profile.isDefault && (
                              <Badge variant="outline">Default</Badge>
                            )}
                          </div>
                          {profile.description && (
                            <CardDescription className="text-xs mt-1">
                              {profile.description}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="text-xs text-muted-foreground mt-1">
                            {Object.entries(profile.permissions)
                              .filter(([_, value]) => value)
                              .map(([key]) => (
                                <Badge key={key} variant="secondary" className="mr-1 mb-1 capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </Badge>
                              ))
                            }
                          </div>
                        </CardContent>
                        <CardFooter className="text-xs text-muted-foreground border-t pt-2">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              Last updated {formatDate(profile.updatedAt)}
                            </div>
                            {!profile.isDefault && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent card click from triggering
                                  if (confirm(`Are you sure you want to delete the "${profile.name}" profile?`)) {
                                    deletePermissionProfileMutation.mutate(profile.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                  
                  {selectedProfile && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Edit Profile</CardTitle>
                        <CardDescription>
                          Modify permissions for the selected profile
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {permissionProfiles
                            .filter(p => p.id === selectedProfile)
                            .map(profile => (
                              <div key={profile.id} className="space-y-6">
                                <div className="space-y-2">
                                  <Label>Profile Name</Label>
                                  <Input value={profile.name} readOnly />
                                </div>
                                
                                <Separator />
                                
                                <div className="space-y-4">
                                  <h4 className="text-sm font-medium">Permissions</h4>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(profile.permissions).map(([key, value]) => {
                                      // Get the current value from editedPermissions if it exists, otherwise use the original value
                                      const isChecked = editedPermissions.hasOwnProperty(key) 
                                        ? editedPermissions[key] 
                                        : value;
                                      
                                      return (
                                        <div key={key} className="flex items-start space-x-2">
                                          <Checkbox 
                                            id={`perm-${key}`} 
                                            checked={isChecked} 
                                            disabled={!isTeamManager}
                                            onCheckedChange={(checked) => {
                                              // Update the editedPermissions state with the new value
                                              setEditedPermissions({
                                                ...editedPermissions,
                                                [key]: checked === true
                                              });
                                            }}
                                          />
                                          <div className="grid gap-1.5 leading-none">
                                            <Label htmlFor={`perm-${key}`} className="capitalize">
                                              {key.replace(/([A-Z])/g, ' $1').trim()}
                                            </Label>
                                            <p className="text-xs text-muted-foreground">
                                              {getPermissionDescription(key)}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    variant="outline" 
                                    onClick={() => {
                                      setSelectedProfile(null);
                                      setEditedPermissions({});
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button 
                                    disabled={!isTeamManager || Object.keys(editedPermissions).length === 0}
                                    onClick={() => {
                                      // Create the updated permissions object by merging the original permissions with edited ones
                                      const updatedPermissions = {
                                        ...profile.permissions,
                                        ...editedPermissions
                                      };
                                      
                                      // Call the mutation to update the permission profile
                                      updatePermissionProfileMutation.mutate({
                                        profileId: profile.id,
                                        permissions: updatedPermissions
                                      });
                                    }}
                                  >
                                    Save Changes
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="user-activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Activity Logs</CardTitle>
              <CardDescription>
                Track and monitor user activities across the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                  <div className="grid gap-2 flex-1">
                    <Label htmlFor="user-filter">Filter by User</Label>
                    <Select 
                      value={activityFilters.userId ? String(activityFilters.userId) : 'all'} 
                      onValueChange={(value) => setActivityFilters({
                        ...activityFilters,
                        userId: value !== 'all' ? parseInt(value) : undefined
                      })}>
                      <SelectTrigger id="user-filter">
                        <SelectValue placeholder="All users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All users</SelectItem>
                        {teamMembers.map(member => (
                          <SelectItem key={member.id} value={String(member.id)}>{member.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="action-filter">Action</Label>
                    <Select 
                      value={activityFilters.action || 'all'} 
                      onValueChange={(value) => setActivityFilters({
                        ...activityFilters,
                        action: value !== 'all' ? value : undefined
                      })}>
                      <SelectTrigger id="action-filter">
                        <SelectValue placeholder="All actions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        <SelectItem value="login">Login</SelectItem>
                        <SelectItem value="logout">Logout</SelectItem>
                        <SelectItem value="create">Create</SelectItem>
                        <SelectItem value="update">Update</SelectItem>
                        <SelectItem value="delete">Delete</SelectItem>
                        <SelectItem value="view">View</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="resource-filter">Resource Type</Label>
                    <Select 
                      value={activityFilters.resourceType || 'all'} 
                      onValueChange={(value) => setActivityFilters({
                        ...activityFilters,
                        resourceType: value !== 'all' ? value : undefined
                      })}>
                      <SelectTrigger id="resource-filter">
                        <SelectValue placeholder="All resources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All resources</SelectItem>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="price">Price</SelectItem>
                        <SelectItem value="competitor">Competitor</SelectItem>
                        <SelectItem value="rule">Rule</SelectItem>
                        <SelectItem value="promotion">Promotion</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                        <SelectItem value="vendor">Vendor</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => setActivityFilters({})}
                    className="flex-shrink-0"
                  >
                    Reset Filters
                  </Button>
                </div>
                
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activityLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                            No activity logs found for the selected filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        activityLogs.map(log => (
                          <TableRow key={log.id}>
                            <TableCell>{log.username}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Badge 
                                  variant="secondary" 
                                  className="capitalize mr-2"
                                >
                                  {log.resourceType}
                                </Badge>
                                {log.resourceId && (
                                  <span className="text-xs text-muted-foreground">
                                    #{log.resourceId}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(log.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              {log.details && (
                                <Button variant="ghost" size="icon">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="user-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Settings</CardTitle>
              <CardDescription>
                Manage your personal settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isLoadingSettings && userSettings ? (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Notification Preferences</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose how you want to receive notifications
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
                        <span>Email Notifications</span>
                        <span className="font-normal text-xs text-muted-foreground">
                          Receive email notifications for important events
                        </span>
                      </Label>
                      <Switch 
                        id="email-notifications" 
                        checked={userSettings.notificationEmail}
                        onCheckedChange={(checked: boolean) => {
                          updateUserSettingsMutation.mutate({
                            ...userSettings,
                            notificationEmail: checked
                          });
                        }}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="sms-notifications" className="flex flex-col space-y-1">
                        <span>SMS Notifications</span>
                        <span className="font-normal text-xs text-muted-foreground">
                          Receive SMS notifications for critical alerts
                        </span>
                      </Label>
                      <Switch 
                        id="sms-notifications" 
                        checked={userSettings.notificationSms}
                        onCheckedChange={(checked: boolean) => {
                          updateUserSettingsMutation.mutate({
                            ...userSettings,
                            notificationSms: checked
                          });
                        }}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="in-app-notifications" className="flex flex-col space-y-1">
                        <span>In-App Notifications</span>
                        <span className="font-normal text-xs text-muted-foreground">
                          Show notifications within the application
                        </span>
                      </Label>
                      <Switch 
                        id="in-app-notifications" 
                        checked={userSettings.notificationInApp}
                        onCheckedChange={(checked: boolean) => {
                          updateUserSettingsMutation.mutate({
                            ...userSettings,
                            notificationInApp: checked
                          });
                        }}
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Security</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage your account security settings
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="mfa-enabled" className="flex flex-col space-y-1">
                        <span>Multi-Factor Authentication (MFA)</span>
                        <span className="font-normal text-xs text-muted-foreground">
                          Enable MFA for additional security
                        </span>
                      </Label>
                      <Switch 
                        id="mfa-enabled" 
                        checked={userSettings.mfaEnabled}
                        onCheckedChange={(checked: boolean) => {
                          updateUserSettingsMutation.mutate({
                            ...userSettings,
                            mfaEnabled: checked
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Permission Profile Dialog */}
      <Dialog
        open={showAssignPermissionsDialog}
        onOpenChange={(open) => {
          setShowAssignPermissionsDialog(open);
          if (!open) {
            setSelectedPermissionProfileId("none");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Permission Profile</DialogTitle>
            <DialogDescription>
              Choose the access profile for {selectedTeamMember?.username || "this team member"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Label htmlFor="assign-permission-profile">Permission Profile</Label>
            <Select value={selectedPermissionProfileId} onValueChange={setSelectedPermissionProfileId}>
              <SelectTrigger id="assign-permission-profile">
                <SelectValue placeholder="Select permission profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a profile</SelectItem>
                {permissionProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={String(profile.id)}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTeamMember?.permissionProfileName && (
              <p className="text-sm text-muted-foreground">
                Current profile: {selectedTeamMember.permissionProfileName}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignPermissionsDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !selectedMember ||
                selectedPermissionProfileId === "none" ||
                assignPermissionProfileMutation.isPending
              }
              onClick={() => {
                if (!selectedMember || selectedPermissionProfileId === "none") return;
                assignPermissionProfileMutation.mutate({
                  userId: selectedMember,
                  profileId: Number(selectedPermissionProfileId),
                });
              }}
            >
              {assignPermissionProfileMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete User Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Removal</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this team member? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                Removing a team member will revoke all access and delete their account from your vendor's team.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedMember) {
                  removeTeamMemberMutation.mutate(selectedMember);
                }
              }}
              disabled={removeTeamMemberMutation.isPending}
            >
              {removeTeamMemberMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Update User Status Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update User Status</DialogTitle>
            <DialogDescription>
              {statusToUpdate === 'active' 
                ? 'Reactivate this user account to restore their access.'
                : 'Temporarily suspend this user to restrict their access.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant={statusToUpdate === 'active' ? 'default' : 'destructive'}>
              {statusToUpdate === 'active' 
                ? <Check className="h-4 w-4" />
                : <BanIcon className="h-4 w-4" />
              }
              <AlertTitle>
                {statusToUpdate === 'active' ? 'Reactivate Account' : 'Suspend Account'}
              </AlertTitle>
              <AlertDescription>
                {statusToUpdate === 'active' 
                  ? 'The user will regain access to the system immediately.'
                  : 'The user will be unable to log in or access the system, but their data will be preserved.'}
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant={statusToUpdate === 'active' ? 'default' : 'destructive'}
              onClick={() => {
                if (selectedMember) {
                  updateUserStatusMutation.mutate({
                    userId: selectedMember,
                    status: statusToUpdate
                  });
                }
              }}
              disabled={updateUserStatusMutation.isPending}
            >
              {updateUserStatusMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              {statusToUpdate === 'active' ? 'Reactivate User' : 'Suspend User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently Delete User Account</DialogTitle>
            <DialogDescription>
              This will permanently delete the user's entire account from the system.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning: This action cannot be undone</AlertTitle>
              <AlertDescription>
                This is different from removing a team member. Account deletion:
                <ul className="list-disc pl-5 mt-2">
                  <li>Deletes all user data from the database</li>
                  <li>Removes the user from all teams</li>
                  <li>Eliminates their ability to log in</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAccountDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedMember) {
                  deleteUserAccountMutation.mutate(selectedMember);
                }
              }}
              disabled={deleteUserAccountMutation.isPending}
            >
              {deleteUserAccountMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Permanently Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Profile Dialog */}
      <Dialog open={showCreateProfileDialog} onOpenChange={setShowCreateProfileDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Permission Profile</DialogTitle>
            <DialogDescription>
              Create a new profile with custom permissions for your team members
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="profile-name">Profile Name</Label>
                <Input 
                  id="profile-name" 
                  placeholder="e.g., Inventory Manager" 
                  value={newProfileData.name}
                  onChange={(e) => setNewProfileData({
                    ...newProfileData,
                    name: e.target.value
                  })}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="profile-description">Description (Optional)</Label>
                <Textarea 
                  id="profile-description" 
                  placeholder="Describe the role and responsibilities for this profile" 
                  value={newProfileData.description}
                  onChange={(e) => setNewProfileData({
                    ...newProfileData,
                    description: e.target.value
                  })}
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Permissions</h4>
              <p className="text-sm text-muted-foreground">
                Select the permissions for this profile
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-64 overflow-y-auto">
                {Object.entries(newProfileData.permissions).map(([key, value]) => (
                  <div key={key} className="flex items-start space-x-2">
                    <Checkbox 
                      id={`new-perm-${key}`} 
                      checked={value} 
                      onCheckedChange={(checked) => {
                        setNewProfileData({
                          ...newProfileData,
                          permissions: {
                            ...newProfileData.permissions,
                            [key]: checked === true
                          }
                        });
                      }}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor={`new-perm-${key}`} className="capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {getPermissionDescription(key)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateProfileDialog(false);
                resetNewProfileData();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!newProfileData.name.trim()) {
                  toast({
                    title: "Validation Error",
                    description: "Profile name is required",
                    variant: "destructive"
                  });
                  return;
                }
                
                // Create the new profile
                createPermissionProfileMutation.mutate({
                  name: newProfileData.name.trim(),
                  description: newProfileData.description.trim() || undefined,
                  permissions: newProfileData.permissions
                });
              }}
              disabled={!newProfileData.name.trim() || createPermissionProfileMutation.isPending}
            >
              {createPermissionProfileMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
  
  // Helper function to generate permission descriptions
  function getPermissionDescription(permission: string): string {
    const descriptions: Record<string, string> = {
      viewProducts: "Can view products and inventory",
      editProducts: "Can create and edit products", 
      viewPricing: "Can view pricing rules and history",
      editPricing: "Can create and edit pricing rules",
      viewCompetitors: "Can view competitor data",
      editCompetitors: "Can add and edit competitor products",
      viewVendor: "Can view vendor settings",
      editVendor: "Can edit vendor settings",
      viewTeam: "Can view team members",
      editTeam: "Can manage team members",
      viewReports: "Can access reporting and analytics",
      viewSystemStatus: "Can view system status and logs",
      adminAccess: "Has full administrative access",
      exportData: "Can export data to CSV or PDF formats",
      importData: "Can import data from external sources",
      viewPromotions: "Can view active and scheduled promotions",
      editPromotions: "Can create and manage promotional offers",
      viewInventory: "Can view inventory levels and stock information",
      editInventory: "Can update inventory counts and manage stock",
      viewAnalytics: "Can access detailed analytics and insights",
      accessAPI: "Can use API endpoints for integration"
    };
    
    return descriptions[permission] || `Permission to ${permission.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`;
  }
}
