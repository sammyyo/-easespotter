import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import LogoImg from "../assets/EaseSpotter.png";

// Form validation schema
const acceptInvitationSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters"),
  email: z.string().email("Please enter a valid email address"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>;

type InvitationStatus = "loading" | "valid" | "invalid" | "expired";

type InvitationData = {
  email?: string;
  role?: string;
  status?: string;
  expiresAt?: string;
  message?: string;
};

export default function AcceptInvitation() {
  const [_, navigate] = useLocation();
  const [match, params] = useRoute("/accept-invitation/:token");
  const { toast } = useToast();
  const [invitationStatus, setInvitationStatus] = useState<InvitationStatus>("loading");
  const [invitationData, setInvitationData] = useState<InvitationData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get the token from URL params
  const token = params?.token;

  // Form setup
  const form = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      email: "",
    },
  });

  // Fetch invitation data when component mounts
  useEffect(() => {
    async function validateInvitation() {
      if (!token) {
        setInvitationStatus("invalid");
        return;
      }

      try {
        // Add a timestamp parameter to prevent caching
        const timestamp = new Date().getTime();
        const response = await apiRequest("GET", `/api/invitations/validate/${token}?_=${timestamp}`);
        
        // Validate that we got a proper JSON response first
        const responseText = await response.text();
        let data;
        
        try {
          data = JSON.parse(responseText);
        } catch (jsonError) {
          console.error("Invalid JSON response:", responseText);
          throw new Error("Invalid server response format");
        }
        
        console.log("Invitation validation response:", response.status, data);
        
        if (response.ok) {
          setInvitationStatus("valid");
          setInvitationData(data);
          
          // Pre-fill email if provided in invitation
          if (data.email) {
            form.setValue("email", data.email);
          }
        } else {
          // Handle different error states
          if (data.status === "expired") {
            setInvitationStatus("expired");
          } else {
            setInvitationStatus("invalid");
          }
          
          setInvitationData({
            ...data,
            message: data.message || "This invitation link is invalid or has already been used."
          });
        }
      } catch (error) {
        console.error("Error validating invitation:", error);
        setInvitationStatus("invalid");
        setInvitationData({ 
          message: "Failed to validate invitation. This invitation link may be incorrect or has already been used."
        });
      }
    }

    validateInvitation();
  }, [token, form]);

  const onSubmit = async (data: AcceptInvitationFormValues) => {
    if (!token) return;
    
    setIsSubmitting(true);
    
    try {
      // Add a timestamp parameter to prevent caching
      const timestamp = new Date().getTime();
      const response = await apiRequest("POST", `/api/invitations/accept/${token}?_=${timestamp}`, {
        username: data.username,
        password: data.password,
        email: data.email,
      });
      
      // Get the response text first
      const responseText = await response.text();
      let responseData;
      
      try {
        // Try to parse as JSON
        responseData = JSON.parse(responseText);
      } catch (jsonError) {
        console.error("Invalid JSON response:", responseText);
        throw new Error("Invalid server response format");
      }
      
      console.log("Invitation acceptance response:", responseData);
      
      if (response.ok) {
        toast({
          title: "Account created successfully",
          description: "Please login with your new credentials",
        });
        navigate("/");
      } else {
        // Check for specific error types and provide more helpful messages
        if (responseData.status === 'invalid') {
          // Handle invalid token specifically
          toast({
            title: "Invalid invitation token",
            description: responseData.message || "The invitation token is not valid",
            variant: "destructive",
          });
        } else if (responseData.errorType === 'duplicate_email') {
          toast({
            title: "Email already registered",
            description: responseData.message || "This email address is already registered. Please use a different email or contact your administrator.",
            variant: "destructive",
          });
        } else if (responseData.errorType === 'duplicate_username') {
          toast({
            title: "Username already taken",
            description: responseData.message || "This username is already taken. Please choose a different username.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Failed to create account",
            description: responseData.message || "Please check your information and try again",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error accepting invitation:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render different content based on invitation status
  const renderContent = () => {
    switch (invitationStatus) {
      case "loading":
        return (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Validating invitation...</span>
          </div>
        );
        
      case "valid":
        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter a username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="Enter your email" 
                          {...field} 
                          disabled={!!invitationData.email}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Create a password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirm your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </Form>
        );
        
      case "expired":
        return (
          <div className="p-6 space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Invitation Expired</AlertTitle>
              <AlertDescription>
                This invitation has expired on {new Date(invitationData.expiresAt || "").toLocaleDateString()}.
                Please contact your administrator for a new invitation.
              </AlertDescription>
            </Alert>
            <div className="flex justify-center mt-4">
              <Button onClick={() => navigate("/")}>Go to Login</Button>
            </div>
          </div>
        );
        
      case "invalid":
        return (
          <div className="p-6 space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Invalid Invitation</AlertTitle>
              <AlertDescription>
                {invitationData.message || "This invitation link is invalid or has already been used."}
              </AlertDescription>
            </Alert>
            <div className="flex justify-center mt-4">
              <Button onClick={() => navigate("/")}>Go to Login</Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={LogoImg} alt="EaseSpotter Logo" className="h-12" />
            </div>
            <CardTitle className="text-2xl">Accept Invitation</CardTitle>
            <CardDescription>
              {invitationStatus === "valid" && invitationData.role && (
                <>You've been invited to join EaseSpotter as <span className="font-semibold">{invitationData.role}</span></>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
          {invitationStatus === "valid" && (
            <CardFooter className="flex justify-center">
              <Button variant="link" onClick={() => navigate("/")}>
                Already have an account? Login
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
      
      {/* Right side - Hero Section */}
      <div className="hidden md:flex flex-1 bg-primary/10 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-3xl font-bold mb-4">Welcome to EaseSpotter</h2>
          <p className="text-lg mb-6">
            Join your team and start leveraging our powerful pricing intelligence platform to make data-driven decisions.
          </p>
          <ul className="space-y-2 text-left mx-auto max-w-xs">
            <li className="flex items-center">
              <span className="font-bold mr-2">✓</span> Dynamic pricing strategies
            </li>
            <li className="flex items-center">
              <span className="font-bold mr-2">✓</span> Competitive analysis
            </li>
            <li className="flex items-center">
              <span className="font-bold mr-2">✓</span> Real-time market insights
            </li>
            <li className="flex items-center">
              <span className="font-bold mr-2">✓</span> AI-powered recommendations
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}