import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

interface WooCommerceIntegrationProps {
  storeProfile: any;
}

const parseIntegrationSettings = (settings: unknown): Record<string, any> | null => {
  if (!settings) return null;

  if (typeof settings === "string") {
    try {
      const parsed = JSON.parse(settings);
      return parsed && typeof parsed === "object" ? parsed as Record<string, any> : null;
    } catch {
      return null;
    }
  }

  return typeof settings === "object" ? settings as Record<string, any> : null;
};

export function WooCommerceIntegration({ storeProfile }: WooCommerceIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState({
    siteUrl: "",
    consumerKey: "",
    consumerSecret: "",
  });
  const [testResults, setTestResults] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  // Extract existing credentials if they exist
  const existingSettings = useMemo(
    () => parseIntegrationSettings(storeProfile?.integrationSettings),
    [storeProfile?.integrationSettings],
  );

  // Pre-fill with existing credentials if available
  useEffect(() => {
    if (existingSettings) {
      setCredentials({
        siteUrl: existingSettings.wooCommerceSiteUrl || "",
        consumerKey: existingSettings.wooCommerceConsumerKey || "",
        consumerSecret: "",
      });
    }
  }, [existingSettings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Mutation for testing WooCommerce connection
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/woocommerce/test-connection", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      setTestResults(data);
      if (data.success) {
        toast({
          title: "Connection successful",
          description: "Successfully connected to WooCommerce store",
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.message || "Failed to connect to WooCommerce",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      setTestResults({
        success: false,
        message: error.message || "Failed to connect to WooCommerce",
      });
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to WooCommerce",
        variant: "destructive",
      });
    },
  });

  // Mutation for saving WooCommerce credentials
  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/woocommerce/save-credentials", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Credentials saved",
        description: "WooCommerce credentials saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving credentials",
        description: error.message || "Failed to save WooCommerce credentials",
        variant: "destructive",
      });
    },
  });

  // Mutation for importing products
  const importProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/woocommerce/import-products", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Products imported",
        description: `Successfully imported ${data.products?.length || 0} products from WooCommerce`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/products"] });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import products from WooCommerce",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl">WooCommerce Integration</CardTitle>
            <CardDescription>
              Connect your WooCommerce store to import products and synchronize data
            </CardDescription>
          </div>
          {storeProfile?.integrationType === "woocommerce" && (
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200 border-green-200">
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="siteUrl" className="text-sm font-medium">
            WooCommerce Site URL
          </label>
          <Input
            id="siteUrl"
            name="siteUrl"
            placeholder="https://your-store.com"
            value={credentials.siteUrl}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="consumerKey" className="text-sm font-medium">
            Consumer Key
          </label>
          <Input
            id="consumerKey"
            name="consumerKey"
            placeholder="WooCommerce Consumer Key"
            value={credentials.consumerKey}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="consumerSecret" className="text-sm font-medium">
            Consumer Secret
          </label>
          <Input
            id="consumerSecret"
            name="consumerSecret"
            placeholder="WooCommerce Consumer Secret"
            value={credentials.consumerSecret}
            onChange={handleChange}
            type="password"
          />
        </div>

        {testResults && (
          <Alert variant={testResults.success ? "default" : "destructive"} className="mt-4">
            <AlertDescription>
              {testResults.message || (testResults.success ? "Connection successful" : "Connection failed")}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div>
          <Button 
            variant="outline" 
            onClick={() => testConnectionMutation.mutate()}
            disabled={testConnectionMutation.isPending}
          >
            {testConnectionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test Connection
          </Button>
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            onClick={() => saveCredentialsMutation.mutate()}
            disabled={saveCredentialsMutation.isPending}
          >
            {saveCredentialsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Credentials
          </Button>
          
          <Button
            variant="default"
            onClick={() => importProductsMutation.mutate()}
            disabled={importProductsMutation.isPending || storeProfile?.integrationType !== "woocommerce"}
          >
            {importProductsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import Products
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
