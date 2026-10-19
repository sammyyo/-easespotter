import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

interface ShopifyIntegrationProps {
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

export function ShopifyIntegration({ storeProfile }: ShopifyIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState({
    storeUrl: "",
    apiKey: "",
    apiSecret: "",
    accessToken: "",
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
        storeUrl: existingSettings.shopifyStoreUrl || "",
        apiKey: existingSettings.shopifyApiKey || "",
        apiSecret: "",
        accessToken: existingSettings.shopifyAccessToken || "",
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

  // Mutation for testing Shopify connection
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/shopify/test-connection", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      setTestResults(data);
      if (data.success) {
        toast({
          title: "Connection successful",
          description: "Successfully connected to Shopify store",
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.message || "Failed to connect to Shopify",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      setTestResults({
        success: false,
        message: error.message || "Failed to connect to Shopify",
      });
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to Shopify",
        variant: "destructive",
      });
    },
  });

  // Mutation for saving Shopify credentials
  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/shopify/save-credentials", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Credentials saved",
        description: "Shopify credentials saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving credentials",
        description: error.message || "Failed to save Shopify credentials",
        variant: "destructive",
      });
    },
  });

  // Mutation for importing products
  const importProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stores/shopify/import-products", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Products imported",
        description: `Successfully imported ${data.products?.length || 0} products from Shopify`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/products"] });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import products from Shopify",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl">Shopify Integration</CardTitle>
            <CardDescription>
              Connect your Shopify store to import products and synchronize data
            </CardDescription>
          </div>
          {storeProfile?.integrationType === "shopify" && (
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200 border-green-200">
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="storeUrl" className="text-sm font-medium">
            Shopify Store URL
          </label>
          <Input
            id="storeUrl"
            name="storeUrl"
            placeholder="your-store.myshopify.com"
            value={credentials.storeUrl}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="apiKey" className="text-sm font-medium">
            API Key
          </label>
          <Input
            id="apiKey"
            name="apiKey"
            placeholder="Shopify API Key"
            value={credentials.apiKey}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="accessToken" className="text-sm font-medium">
            Access Token
          </label>
          <Input
            id="accessToken"
            name="accessToken"
            placeholder="Shopify Access Token"
            value={credentials.accessToken}
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
            disabled={importProductsMutation.isPending || storeProfile?.integrationType !== "shopify"}
          >
            {importProductsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import Products
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
