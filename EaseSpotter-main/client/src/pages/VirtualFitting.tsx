import { VirtualFittingRoom } from "@/components/ar/VirtualFittingRoom";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function VirtualFitting() {
  const [, navigate] = useLocation();
  const productId = Number(new URLSearchParams(window.location.search).get("productId"));

  const { data: product } = useQuery({
    queryKey: ["/api/products", productId],
    enabled: !!productId,
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/products")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Products
        </Button>
        {product && <h1 className="text-2xl font-bold">Try On: {product.name}</h1>}
      </div>
      
      <VirtualFittingRoom 
        productId={productId} 
        modelUrl={product?.modelUrl}
      />
    </div>
  );
}
