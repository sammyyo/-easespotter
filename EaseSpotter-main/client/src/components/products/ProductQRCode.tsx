import { useMemo, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Barcode, QrCode, Download, Copy, Printer } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { apiRequest } from "@/lib/queryClient";

const NO_SKU_PREFIX = "__NO_SKU__";
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const normalizeBarcodeValue = (value: string) =>
  value
    .trim()
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("");

const getInternalBarcodeValue = (product: Product) => {
  const barcode = normalizeBarcodeValue(product.barcode || "");
  if (barcode) return barcode;

  const sku = normalizeBarcodeValue(product.sku || "");
  if (sku && !sku.startsWith(NO_SKU_PREFIX)) return sku;

  return String(product.id);
};

const getCode128Codes = (value: string) => {
  const codes = [104];
  for (const char of value) {
    codes.push(char.charCodeAt(0) - 32);
  }

  const checksum = codes.reduce((sum, code, index) => (
    index === 0 ? code : sum + code * index
  ), 0) % 103;

  return [...codes, checksum, 106];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function Code128Barcode({ value, id }: { value: string; id: string }) {
  const codes = getCode128Codes(value);
  const moduleWidth = 2;
  const height = 82;
  const quietZone = 16;
  const barHeight = 64;
  const totalModules = codes.reduce((sum, code) => (
    sum + CODE128_PATTERNS[code].split("").reduce((patternSum, width) => patternSum + Number(width), 0)
  ), 0);
  const width = totalModules * moduleWidth + quietZone * 2;
  let x = quietZone;

  return (
    <svg
      id={id}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="110"
      role="img"
      aria-label={`Barcode ${value}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={width} height={height} fill="#fff" />
      {codes.flatMap((code, codeIndex) => {
        let isBar = true;
        return CODE128_PATTERNS[code].split("").map((widthPart, partIndex) => {
          const partWidth = Number(widthPart) * moduleWidth;
          const rect = isBar ? (
            <rect
              key={`${codeIndex}-${partIndex}`}
              x={x}
              y={4}
              width={partWidth}
              height={barHeight}
              fill="#000"
            />
          ) : null;
          x += partWidth;
          isBar = !isBar;
          return rect;
        });
      })}
      <text
        x={width / 2}
        y={height - 4}
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="12"
        fill="#000"
      >
        {value}
      </text>
    </svg>
  );
}

interface Product {
  id: number;
  name: string;
  brand?: string | null;
  sku: string;
  barcode?: string | null;
  basePrice: string;
  currentPrice: string;
  category: string;
  aisle: string;
  shelf: string;
}

interface ProductQRCodeProps {
  product: Product;
  locationLabelPrimary?: string;
  locationLabelSecondary?: string;
}

export function ProductQRCode({
  product,
  locationLabelPrimary = "Aisle",
  locationLabelSecondary = "Shelf",
}: ProductQRCodeProps) {
  const [qrValue, setQrValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [productDetails, setProductDetails] = useState<any>(null);
  const { toast } = useToast();
  const { currency } = useCurrency();
  const barcodeValue = useMemo(() => getInternalBarcodeValue(product), [product]);
  const qrCodeElementId = `product-qr-code-${product.id}`;
  const qrCodePrintContainerId = `qr-code-print-container-${product.id}`;
  const barcodeElementId = `product-barcode-code-${product.id}`;
  const barcodePrintContainerId = `product-barcode-print-container-${product.id}`;
  const hasSavedBarcode = !!normalizeBarcodeValue(product.barcode || "");

  // Generate QR code with URL to our /api/qr/products/:id endpoint
  useEffect(() => {
    if (product.id) {
      // Generate absolute URL for the QR code
      const currentURL = window.location.origin;
      const qrCodeURL = `${currentURL}/api/qr/products/${product.id}`;
      setQrValue(qrCodeURL);
    }
  }, [product.id]);

  const fetchProductDetails = async () => {
    if (!product.id) return;
    
    try {
      setIsLoading(true);
      const response = await apiRequest("GET", `/api/qr/products/${product.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch product details");
      }
      const data = await response.json();
      setProductDetails(data.data);
    } catch (error) {
      console.error("Error fetching product details:", error);
      setProductDetails({
        id: product.id,
        name: product.name,
        brand: product.brand,
        sku: product.sku,
        barcode: product.barcode,
        currentPrice: product.currentPrice,
        category: product.category,
        location: {
          aisle: product.aisle,
          shelf: product.shelf,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQRCodeOpen = () => {
    fetchProductDetails();
  };

  const handleDownloadQRCode = () => {
    try {
      // Get the SVG element
      const svgElement = document.getElementById(qrCodeElementId);
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
        link.download = `qrcode-${product.name.replace(/\s+/g, "-").toLowerCase()}.png`;
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
      const qrCodeContainer = document.getElementById(qrCodePrintContainerId);
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

      const productName = escapeHtml(product.name);
      const productPrice = escapeHtml(new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.currentPrice)));
      const productLocation = escapeHtml(`${locationLabelPrimary}: ${product.aisle}, ${locationLabelSecondary}: ${product.shelf}`);
      
      // Prepare print content
      printWindow.document.write(`
        <html>
          <head>
            <title>Product QR Code - ${productName}</title>
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
              .product-info {
                margin-top: 10px;
                text-align: center;
                font-size: 12px;
              }
              .product-name {
                font-weight: bold;
                font-size: 16px;
                margin-bottom: 5px;
              }
              .product-price {
                font-weight: bold;
                margin-bottom: 3px;
              }
              .product-location {
                color: #666;
                margin-bottom: 3px;
              }
              .qr-instructions {
                font-size: 11px;
                color: #666;
                margin-top: 5px;
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
              <div class="product-info">
                <div class="product-name">${productName}</div>
                <div class="product-price">${productPrice}</div>
                <div class="product-location">${productLocation}</div>
                <div class="qr-instructions">Scan for current price and product details</div>
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

  const handleDownloadBarcode = () => {
    try {
      const svgElement = document.getElementById(barcodeElementId);
      if (!svgElement) return;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = 900;
      canvas.height = 320;

      const img = new Image();
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 40, 40, canvas.width - 80, 160);

        ctx.fillStyle = "#111";
        ctx.font = "bold 28px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(product.name, canvas.width / 2, 240);
        ctx.font = "20px Arial, sans-serif";
        ctx.fillText(
          new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.currentPrice)),
          canvas.width / 2,
          272,
        );

        const link = document.createElement("a");
        link.download = `barcode-${product.name.replace(/\s+/g, "-").toLowerCase()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        URL.revokeObjectURL(url);
      };

      img.src = url;

      toast({
        title: "Success",
        description: "Barcode label downloaded successfully",
      });
    } catch (error) {
      console.error("Error downloading barcode:", error);
      toast({
        title: "Error",
        description: "Failed to download barcode label",
        variant: "destructive",
      });
    }
  };

  const handlePrintBarcode = () => {
    try {
      const barcodeContainer = document.getElementById(barcodePrintContainerId);
      if (!barcodeContainer) return;

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast({
          title: "Error",
          description: "Failed to open print window. Please check your popup settings.",
          variant: "destructive",
        });
        return;
      }

      const productName = escapeHtml(product.name);
      const productSku = escapeHtml(product.sku || "N/A");
      const productPrice = escapeHtml(new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.currentPrice)));

      printWindow.document.write(`
        <html>
          <head>
            <title>Product Barcode - ${productName}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                text-align: center;
              }
              .label {
                display: inline-block;
                width: 320px;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                background: white;
              }
              .product-name {
                font-weight: bold;
                font-size: 14px;
                margin-top: 8px;
              }
              .product-meta {
                color: #555;
                font-size: 11px;
                margin-top: 3px;
              }
              .product-price {
                font-weight: bold;
                font-size: 14px;
                margin-top: 5px;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 8px;
                }
                .label {
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            <div class="label">
              ${barcodeContainer.innerHTML}
              <div class="product-name">${productName}</div>
              <div class="product-meta">SKU: ${productSku}</div>
              <div class="product-price">${productPrice}</div>
            </div>
          </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);

      toast({
        title: "Print ready",
        description: "Barcode label print dialog opened",
      });
    } catch (error) {
      console.error("Error printing barcode:", error);
      toast({
        title: "Error",
        description: "Failed to print barcode label",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet onOpenChange={(open) => {
      if (open) handleQRCodeOpen();
    }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="gap-2">
          <QrCode className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Product Codes</SheetTitle>
          <SheetDescription>
            Generate QR codes for product details and barcode labels for cashier scanning.
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 flex flex-col space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>{product.name}</span>
                <Badge>{product.category}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div id={qrCodePrintContainerId} className="bg-white p-4 rounded-md">
                <QRCodeSVG
                  id={qrCodeElementId}
                  value={qrValue}
                  size={200}
                  level="H"
                  includeMargin={true}
                  className="border border-border rounded-md"
                />
              </div>
              
              <div className="mt-4 text-center">
                {product.brand && (
                  <p className="text-sm font-medium">{product.brand}</p>
                )}
                <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                {product.barcode && (
                  <p className="text-sm text-muted-foreground">Barcode: {product.barcode}</p>
                )}
                <p className="text-xl font-bold mt-1">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.currentPrice))}</p>
                <div className="flex items-center justify-center mt-1">
                  <div className="text-sm text-muted-foreground">
                    Location: {locationLabelPrimary} {product.aisle}, {locationLabelSecondary} {product.shelf}
                  </div>
                </div>
              </div>
              
              {isLoading ? (
                <div className="mt-4 w-full space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyQRCodeUrl}>
                <Copy className="h-4 w-4 mr-2" />
                Copy URL
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadQRCode}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="default" size="sm" onClick={handlePrintQRCode}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Barcode className="h-5 w-5" />
                Barcode Label
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div id={barcodePrintContainerId} className="rounded-md bg-white p-4">
                <Code128Barcode id={barcodeElementId} value={barcodeValue} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {hasSavedBarcode ? "Saved product barcode" : product.sku?.startsWith(NO_SKU_PREFIX) ? "Fallback product ID label" : "Fallback SKU label"}
                </p>
                {!hasSavedBarcode && (
                  <p className="mt-1 text-xs text-orange-700">
                    For regular cashier use, edit the product and generate a barcode before printing labels.
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadBarcode}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="default" size="sm" onClick={handlePrintBarcode}>
                <Printer className="h-4 w-4 mr-2" />
                Print Label
              </Button>
            </CardFooter>
          </Card>
          
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">
              <strong>How it works:</strong>
            </p>
            <ol className="space-y-1 list-decimal pl-4">
              <li>Print the QR code for customer price checks and product details</li>
              <li>Print the barcode label for cashier scanning at checkout</li>
              <li>If a product has no barcode, use Edit Product to generate one before printing labels</li>
              <li>Scanning the barcode value in Cashier adds the product to cart</li>
            </ol>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
