import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icons } from "@/components/ui/icons";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
}).refine(data => data.username && data.email && data.password, {
  message: "All fields are required",
  path: ["username"], // highlight the first field if all are empty
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { registerMutation } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [suggestedUsername, setSuggestedUsername] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: RegisterFormValues) {
    setIsLoading(true);
    try {
      console.log("Submitting registration form:", { ...data, password: "[REDACTED]" });
      
      await registerMutation.mutateAsync(data);
      
      toast({
        title: "Success",
        description: "Your account has been created successfully",
      });
      
      // Short delay before navigation to ensure toast is seen
      setTimeout(() => {
        navigate("/store-setup");
      }, 500);
    } catch (error: any) {
      console.error("Registration mutation error:", error);
      console.error("Registration form error:", error.response?.data);
      
      // Check if the server provided a suggested username alternative
      if (error.response?.data?.suggestedUsername) {
        setSuggestedUsername(error.response.data.suggestedUsername);
        
        toast({
          title: "Username Already Exists",
          description: `That username is taken. Try "${error.response.data.suggestedUsername}" instead?`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registration Failed",
          description: error.response?.data?.error || error.message || "Registration failed. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Choose a username"
                    disabled={isLoading}
                    {...field}
                  />
                  {suggestedUsername && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => {
                        form.setValue('username', suggestedUsername);
                        setSuggestedUsername(null);
                      }}
                    >
                      Use Suggested
                    </Button>
                  )}
                </div>
              </FormControl>
              {suggestedUsername && (
                <p className="text-xs text-muted-foreground mt-1">
                  Suggested: {suggestedUsername}
                </p>
              )}
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
                  disabled={isLoading}
                  {...field}
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
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    disabled={isLoading}
                    className="pr-10"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={isLoading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full mt-2" disabled={isLoading}>
          {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>
    </Form>
  );
}
