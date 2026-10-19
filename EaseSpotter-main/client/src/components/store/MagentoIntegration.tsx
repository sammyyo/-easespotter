import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface MagentoIntegrationProps {
  storeProfile: any;
}

export function MagentoIntegration({ storeProfile }: MagentoIntegrationProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState(storeProfile?.magentoUrl || "");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const saveCredentials = async () => {
    if (!url || !apiKey || !secretKey) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        "/api/stores/magento/save-credentials",
        {
          url,
          apiKey,
          secretKey,
          storeId: storeProfile?.id,
        }
      );

      if (res.ok) {
        toast({
          title: "Success",
          description: "Magento credentials saved successfully",
        });
      } else {
        const error = await res.text();
        throw new Error(error || "Failed to save credentials");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!url || !apiKey || !secretKey) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setTestLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        "/api/stores/magento/test-connection",
        {
          url,
          apiKey,
          secretKey,
          storeId: storeProfile?.id,
        }
      );

      if (res.ok) {
        const data = await res.json();
        setIsConnected(true);
        toast({
          title: "Success",
          description: `Connected to Magento store: ${data.storeName}`,
        });
      } else {
        const error = await res.text();
        throw new Error(error || "Failed to connect to Magento");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to connect to Magento",
        variant: "destructive",
      });
      setIsConnected(false);
    } finally {
      setTestLoading(false);
    }
  };

  const importProducts = async () => {
    if (!isConnected) {
      toast({
        title: "Not connected",
        description: "Please test your connection first",
        variant: "destructive",
      });
      return;
    }

    setImportLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        "/api/stores/magento/import-products",
        {
          url,
          apiKey,
          secretKey,
          storeId: storeProfile?.id,
        }
      );

      if (res.ok) {
        const data = await res.json();
        toast({
          title: "Success",
          description: `Imported ${data.importedCount} products from Magento`,
        });
      } else {
        const error = await res.text();
        throw new Error(error || "Failed to import products");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import products",
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Magento Integration</h3>
            <p className="text-sm text-muted-foreground">
              Integrate your Magento store to automatically import and sync products.
            </p>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="magento-url">Store URL</Label>
                <Input
                  id="magento-url"
                  placeholder="https://your-store.example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="magento-api-key">API Key</Label>
                <Input
                  id="magento-api-key"
                  type="password"
                  placeholder="Your Magento API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="magento-secret-key">Secret Key</Label>
                <Input
                  id="magento-secret-key"
                  type="password"
                  placeholder="Your Magento Secret Key"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={saveCredentials}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Credentials
                </Button>

                <Button
                  onClick={testConnection}
                  disabled={testLoading}
                  variant="outline"
                  className="flex-1"
                >
                  {testLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Test Connection
                </Button>

                <Button
                  onClick={importProducts}
                  disabled={importLoading || !isConnected}
                  variant="secondary"
                  className="flex-1"
                >
                  {importLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Import Products
                </Button>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch id="auto-sync" disabled />
                <Label htmlFor="auto-sync">Enable Auto-Sync (Coming Soon)</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
