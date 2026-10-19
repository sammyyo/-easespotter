import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Download, Copy, Printer, Store } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/use-currency";
import { createLogoDataUrl } from "@/lib/qr-logo";

// Define types for our store directory data
interface ProductByAisle {
  id: number;
  name: string;
  price: string;
  stock?: number;
  currentStock?: number;
  inStock?: boolean;
  shelf: string;
  category: string;
}

interface ProductByCategory {
  id: number;
  name: string;
  price: string;
  stock?: number;
  currentStock?: number;
  inStock?: boolean;
  location: {
    aisle: string;
    shelf: string;
  };
  vendor: string;
}

interface StoreDirectoryData {
  totalProducts: number;
  timestamp: string;
  productsByCategory: Record<string, ProductByCategory[]>;
  productsByAisle: Record<string, ProductByAisle[]>;
  vendorId: number;
  vendorName: string;
  logoUrl?: string | null;
  locationLabels?: {
    primary?: string;
    secondary?: string;
  };
}

export function StoreDirectoryQRCode() {
  const [qrValue, setQrValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [storeDirectory, setStoreDirectory] = useState<StoreDirectoryData | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const { toast } = useToast();
  const { currency } = useCurrency();
  const locationLabelPrimary = storeDirectory?.locationLabels?.primary || "Aisle";
  const locationLabelSecondary = storeDirectory?.locationLabels?.secondary || "Shelf";

  // Generate QR code with URL to our /api/qr/store-directory endpoint
  useEffect(() => {
    // Generate absolute URL for the QR code
    const currentURL = window.location.origin;
    const qrCodeURL = `${currentURL}/api/qr/store-directory`;
    setQrValue(qrCodeURL);
  }, []);

  const fetchStoreDirectory = async () => {
    try {
      setIsLoading(true);
      setLogoDataUrl("");
      const response = await fetch("/api/qr/store-directory");
      if (!response.ok) {
        throw new Error("Failed to fetch store directory");
      }
      const data = await response.json();
      console.log("Fetched store directory data:", data);
      setStoreDirectory(data.data);
      if (data.data?.vendorName) {
        const logo = await createLogoDataUrl({
          logoUrl: data.data.logoUrl,
          vendorName: data.data.vendorName,
        });
        setLogoDataUrl(logo);
      }
    } catch (error) {
      console.error("Error fetching store directory:", error);
      toast({
        title: "Error",
        description: "Failed to fetch store directory",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQRCodeOpen = () => {
    fetchStoreDirectory();
  };

  const handleDownloadQRCode = () => {
    try {
      // Get the SVG element
      const svgElement = document.getElementById("store-directory-qr-code");
      if (!svgElement) return;

      // Create a canvas element
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size to be larger for better quality
      canvas.width = 512;
      canvas.height = 512;

      // Create an image from the SVG
      const img = new Image();
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        // Fill canvas with white background
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw SVG on canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Create download link
        const link = document.createElement("a");
        link.download = "easespotter-store-directory.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        // Clean up
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
      
      toast({
        title: "Success",
        description: "QR code downloaded successfully",
      });
    } catch (error) {
      console.error("Error downloading QR code:", error);
      toast({
        title: "Error",
        description: "Failed to download QR code",
        variant: "destructive",
      });
    }
  };

  const handleCopyQRCodeUrl = () => {
    try {
      navigator.clipboard.writeText(qrValue);
      toast({
        title: "Success",
        description: "QR code URL copied to clipboard",
      });
    } catch (error) {
      console.error("Error copying QR code URL:", error);
      toast({
        title: "Error",
        description: "Failed to copy QR code URL",
        variant: "destructive",
      });
    }
  };

  const handlePrintQRCode = () => {
    try {
      // Get the QR code container
      const qrCodeContainer = document.getElementById("store-directory-print-container");
      if (!qrCodeContainer) return;
      
      // Create a new window for printing
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast({
          title: "Error",
          description: "Failed to open print window. Please check your popup settings.",
          variant: "destructive",
        });
        return;
      }
      
      // Prepare print content
      printWindow.document.write(`
        <html>
          <head>
            <title>EaseSpotter Store Directory</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                text-align: center;
              }
              .qr-container {
                display: inline-block;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: white;
                margin-bottom: 20px;
              }
              .store-info {
                margin-top: 10px;
                text-align: center;
                font-size: 14px;
              }
              .store-name {
                font-weight: bold;
                font-size: 18px;
                margin-bottom: 5px;
              }
              .store-description {
                color: #666;
                margin-bottom: 5px;
              }
              .qr-instructions {
                font-size: 11px;
                color: #666;
                margin-top: 10px;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 10px;
                }
              }
            </style>
          </head>
          <body>
            <div class="qr-container">
              ${qrCodeContainer.innerHTML}
              <div class="store-info">
                <div class="store-name">EaseSpotter Store Directory</div>
                <div class="store-description">Scan to view complete product catalog and locations</div>
                <div class="qr-instructions">Place this QR code at the store entrance for easy navigation</div>
              </div>
            </div>
          </body>
        </html>
      `);
      
      // Trigger print dialog
      printWindow.document.close();
      printWindow.focus();
      
      // Add a slight delay to ensure content is loaded
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      
      toast({
        title: "Print ready",
        description: "QR code print dialog opened",
      });
    } catch (error) {
      console.error("Error printing QR code:", error);
      toast({
        title: "Error",
        description: "Failed to print QR code",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          onClick={handleQRCodeOpen} 
          className="gap-2" 
          variant="default"
        >
          <Store className="h-4 w-4" />
          Store Directory QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Store Directory QR Code</DialogTitle>
          <DialogDescription>
            Generate a QR code for the complete store product directory with locations.
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-6 flex flex-col space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Store Directory QR Code</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div id="store-directory-print-container" className="bg-white p-4 rounded-md">
                  <QRCodeSVG
                    id="store-directory-qr-code"
                    value={qrValue}
                    size={200}
                    level="H"
                    includeMargin={true}
                    className="border border-border rounded-md"
                    imageSettings={logoDataUrl ? {
                      src: logoDataUrl,
                      x: undefined,
                      y: undefined,
                      height: 52,
                      width: 52,
                      excavate: true,
                    } : undefined}
                  />
                </div>
                
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground">Store Directory QR Code</p>
                  <p className="text-xl font-bold mt-1">
                    {storeDirectory?.vendorName || "EaseSpotter"}
                  </p>
                </div>
                
                {isLoading ? (
                  <div className="mt-4 w-full space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : storeDirectory ? (
                  <div className="mt-4 w-full text-sm">
                    <div className="bg-muted/50 p-3 rounded-md w-full text-xs text-muted-foreground">
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div>
                          <div className="font-semibold text-foreground">{storeDirectory.totalProducts}</div>
                          <div>Products</div>
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{Object.keys(storeDirectory.productsByCategory).length}</div>
                          <div>Categories</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="p-4">
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="text-xs px-2 w-full min-w-0 flex items-center justify-center gap-1 whitespace-nowrap"
                    onClick={handleCopyQRCodeUrl}
                  >
                    <Copy className="h-3 w-3 shrink-0" />
                    <span className="truncate">Copy</span>
                  </Button>
                  <Button
                    variant="default"
                    className="text-xs px-2 w-full min-w-0 flex items-center justify-center gap-1 whitespace-nowrap"
                    onClick={handlePrintQRCode}
                  >
                    <Printer className="h-3 w-3 shrink-0" />
                    <span className="truncate">Print</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="text-xs px-2 w-full min-w-0 flex items-center justify-center gap-1 whitespace-nowrap col-span-2"
                    onClick={handleDownloadQRCode}
                  >
                    <Download className="h-3 w-3 shrink-0" />
                    <span className="truncate">Download</span>
                  </Button>
                </div>
              </CardFooter>
            </Card>

            {storeDirectory && (
              <Card>
                <CardHeader>
                  <CardTitle>Directory Preview</CardTitle>
                </CardHeader>
                <CardContent className="overflow-auto max-h-[500px]">
                  <Tabs defaultValue="aisles">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="aisles">By {locationLabelPrimary}</TabsTrigger>
                      <TabsTrigger value="categories">By Category</TabsTrigger>
                    </TabsList>
                    <TabsContent value="aisles" className="space-y-4">
                      {Object.keys(storeDirectory.productsByAisle).map((aisle) => (
                        <div key={aisle} className="border rounded-lg p-4">
                          <h3 className="font-bold text-lg mb-2">{locationLabelPrimary} {aisle}</h3>
                          <div className="space-y-2">
                            {storeDirectory.productsByAisle[aisle].map((product) => (
                              <div key={product.id} className="flex justify-between items-center">
                                <div>
                                  <span className="font-medium">{product.name}</span>
                                  <div className="text-sm text-muted-foreground">
                                    {locationLabelSecondary}: {product.shelf}
                                  </div>
                                </div>
                                <div className="font-bold">
                                  {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.price))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                    <TabsContent value="categories" className="space-y-4">
                      {Object.keys(storeDirectory.productsByCategory).map((category) => (
                        <div key={category} className="border rounded-lg p-4">
                          <h3 className="font-bold text-lg mb-2">{category}</h3>
                          <div className="space-y-2">
                            {storeDirectory.productsByCategory[category].map((product) => (
                              <div key={product.id} className="flex justify-between items-center">
                                <div>
                                  <span className="font-medium">{product.name}</span>
                                  <div className="text-sm text-muted-foreground">
                                    {locationLabelPrimary}: {product.location.aisle}, {locationLabelSecondary}: {product.location.shelf}
                                  </div>
                                </div>
                                <div className="font-bold">
                                  {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.price))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">
              <strong>How it works:</strong>
            </p>
            <ol className="space-y-1 list-decimal pl-4">
              <li>Print the QR code and place it at the store entrance or on flyers</li>
              <li>Customers can scan the code with the EaseSpotter app</li>
              <li>The app will display a complete store directory with product locations</li>
              <li>Price updates will be instantly available when scanned</li>
              <li>Customers can quickly find products and view current pricing</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
