import React, { useState, useEffect, useRef } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Store, Package2, Home, ShoppingCart } from "lucide-react";
import LogoImg from "../assets/EaseSpotter.png";
import RootHeader from "@/components/layout/RootHeader";
import { createOptimizedImageElement } from "@/lib/image-utils";
import { useCurrency } from "@/hooks/use-currency";

interface StoreProfile {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  themeColor: string | null;
  storeType: string | null;
  slug: string;
}

interface StoreProduct {
  id: number;
  storeId: number;
  name: string;
  basePrice: string;
  currentPrice: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  sku?: string;
  createdAt: string;
  updatedAt: string;
}

export default function Storefront() {
  const [stores, setStores] = useState<StoreProfile[]>([]);
  const [currentStore, setCurrentStore] = useState<StoreProfile | null>(null);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/store/:slug');
  const { currency } = useCurrency();
  
  const storeSlug = match ? params.slug : null;

  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/public/stores");
        
        if (!response.ok) {
          throw new Error(`Failed to fetch stores: ${response.status}`);
        }
        
        const data = await response.json();
        setStores(data);
        
        // If on a specific store page, find the matching store by slug
        if (storeSlug) {
          const found = data.find((store: StoreProfile) => store.slug === storeSlug);
          if (found) {
            setCurrentStore(found);
          } else {
            setError("Store not found");
          }
        }
      } catch (err) {
        console.error("Error fetching stores:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, [storeSlug]);
  
  // Fetch products for a store when the currentStore changes
  useEffect(() => {
    const fetchStoreProducts = async () => {
      if (!currentStore) return;
      
      try {
        setLoadingProducts(true);
        console.log(`Fetching products for store: ${currentStore.slug}`);
        const response = await fetch(`/api/public/stores/${currentStore.slug}/products`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch store products: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Store products data:", data);
        setStoreProducts(data);
      } catch (err) {
        console.error("Error fetching store products:", err);
        // We don't set the error state here to allow the store page to load even if products fail
      } finally {
        setLoadingProducts(false);
      }
    };

    if (currentStore) {
      fetchStoreProducts();
    }
  }, [currentStore]);

  const handleStoreClick = (storeSlug: string) => {
    setLocation(`/store/${storeSlug}`);
  };

  const handleBackClick = () => {
    setLocation('/stores');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <RootHeader />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-6">
            {storeSlug ? "Loading Store..." : "Discover Our Stores"}
          </h1>
        {storeSlug ? (
          <div className="w-full">
            <Skeleton className="h-60 w-full rounded-lg mb-6" />
            <Skeleton className="h-8 w-64 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-md" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="p-0">
                  <Skeleton className="h-40 w-full" />
                </CardHeader>
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter className="flex justify-between p-4">
                  <Skeleton className="h-10 w-24" />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <RootHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
          {storeSlug ? (
            <Button onClick={handleBackClick} variant="outline" className="mr-2">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Stores
            </Button>
          ) : null}
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  // Single store view
  if (storeSlug && currentStore) {
    console.log("Rendering store detail view:", currentStore);
    console.log("Store logo URL:", currentStore.logoUrl);
    
    return (
      <div className="min-h-screen bg-background">
        <RootHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Button onClick={handleBackClick} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Stores
            </Button>
          </div>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Store Banner/Header - New Design with Logo Straddling Edge */}
          <div 
            className="h-60 bg-cover bg-center relative"
            style={{ 
              backgroundImage: `url(${currentStore.bannerUrl || '/images/store-banner.png'})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            {/* Container with relative position needed for absolute positioning of logo */}
            <div className="relative w-full h-full">
              {/* Logo positioned to straddle bottom of banner with z-index to ensure it stays on top */}
              <div className="absolute left-8 bottom-0 transform translate-y-1/2 z-10">
                {currentStore.logoUrl ? (
                  <div className="bg-white p-2 rounded-full shadow-lg h-32 w-32 flex items-center justify-center border-4 border-white overflow-hidden relative">
                    {/* Animated loading skeleton for logo */}
                    <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-full"
                      style={{ opacity: 1, transition: 'opacity 0.3s ease-in-out' }}>
                    </div>
                    <img 
                      src={currentStore.logoUrl} 
                      alt={`${currentStore.name} logo`} 
                      className="max-h-28 max-w-28 object-contain rounded-full relative z-10"
                      loading="lazy"
                      onLoad={(e) => {
                        // Hide the placeholder when image loads
                        const target = e.currentTarget;
                        const placeholder = target.previousElementSibling as HTMLElement;
                        if (placeholder) placeholder.style.opacity = '0';
                      }}
                      onError={(e) => {
                        console.error("Error loading logo image");
                        e.currentTarget.onerror = null; // prevent looping
                        e.currentTarget.src = LogoImg;
                        e.currentTarget.alt = "Default Brand Image";
                        // Hide the placeholder on error too
                        const target = e.currentTarget;
                        const placeholder = target.previousElementSibling as HTMLElement;
                        if (placeholder) placeholder.style.opacity = '0';
                      }}
                      style={{ opacity: 1, transition: 'opacity 0.3s ease-in-out' }}
                    />
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-full shadow-lg h-32 w-32 flex items-center justify-center border-4 border-white">
                    <div className="text-xl font-bold text-gray-700 text-center">
                      {currentStore.name.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Store Info - with padding-top to create space for logo overlap */}
          <div className="p-6 pt-24">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold">{currentStore.name}</h1>
              {currentStore.storeType && (
                <Badge className="text-sm px-3 py-1">
                  {currentStore.storeType}
                </Badge>
              )}
            </div>
            
            <Separator className="my-4" />
            
            <div className="prose max-w-none mb-8">
              <p className="text-gray-700 text-lg">
                {currentStore.description || "No description available for this store."}
              </p>
            </div>
            
            {/* Featured Products Section */}
            <h2 className="text-2xl font-bold mb-4 flex items-center">
              <Package2 className="mr-2 h-5 w-5" /> Featured Products
            </h2>
            
            {loadingProducts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl ml-0">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="aspect-video relative bg-gray-100">
                      <Skeleton className="w-full h-full" />
                    </div>
                    <CardContent className="p-4">
                      <Skeleton className="h-5 w-32 mb-2" />
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-3 w-full mb-1" />
                    </CardContent>
                    <CardFooter className="p-4 pt-0">
                      <Skeleton className="h-9 w-full" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : storeProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl ml-0">
                {storeProducts.map((product) => {
                  // Create a URL-friendly slug from the product name
                  const productSlug = product.name
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, '') // Remove special characters
                    .replace(/\s+/g, '-')     // Replace spaces with hyphens
                    .replace(/-+/g, '-');     // Remove consecutive hyphens
                  
                  return (
                    <Link key={product.id} href={`/store/${currentStore.slug}/product/${productSlug}-${product.id}`}>
                      <Card className="overflow-hidden hover:shadow-md transition-shadow duration-300 cursor-pointer h-full flex flex-col">
                        <div className="aspect-video relative bg-gray-50">
                          {product.imageUrl ? (
                            <div className="relative w-full h-full" ref={el => {
                              // Use this ref to ensure we're only creating the element once
                              if (el && !el.querySelector('img')) {
                                const optimizedImg = createOptimizedImageElement(
                                  product.imageUrl || LogoImg,
                                  product.name,
                                  "w-full h-full object-cover relative z-10"
                                );
                                // Make sure the container is empty first
                                while (el.firstChild) {
                                  el.removeChild(el.firstChild);
                                }
                                el.appendChild(optimizedImg);
                              }
                            }}></div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package2 className="h-12 w-12 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3 flex-grow">
                          <h3 className="text-sm font-medium line-clamp-1">{product.name}</h3>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-primary">
                              {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.currentPrice || product.basePrice))}
                            </span>
                            {product.currentPrice && Number(product.currentPrice) < Number(product.basePrice) && (
                              <span className="text-xs text-gray-500 line-through">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.basePrice))}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 text-xs line-clamp-1">
                            {product.description || `High-quality ${product.name} available now.`}
                          </p>
                        </CardContent>
                        <CardFooter className="p-3 pt-0">
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            <ShoppingCart className="mr-1 h-3 w-3" />
                            View Details
                          </Button>
                        </CardFooter>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="bg-gray-50 p-6 rounded-lg text-center">
                <p className="text-gray-500">Products coming soon!</p>
                <p className="text-sm text-gray-400 mt-2">This store is still setting up their product catalog.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    );
  }

  // Stores listing view
  if (stores.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <RootHeader />
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-3xl font-bold mb-6">Discover Our Stores</h1>
          <div className="p-8 bg-gray-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">No Stores Available</h2>
            <p className="text-gray-600 mb-4">
              There are currently no verified stores to display.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <RootHeader />
      <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center">
        <Store className="mr-2 h-8 w-8" /> Discover Our Stores
      </h1>
      <p className="text-gray-600 mb-8">Browse verified stores using EaseSpotter to publish searchable product catalogs.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => (
          <Card 
            key={store.id} 
            className="overflow-hidden hover:shadow-lg transition-shadow duration-300"
            style={{ borderTopColor: store.themeColor || '#e5e7eb', borderTopWidth: '4px' }}
          >
            <CardHeader className="p-0">
              {/* Banner image - either custom or default */}
              <div 
                className="h-40 bg-cover bg-center relative"
                style={{ 
                  backgroundImage: `url(${store.bannerUrl || '/images/store-banner.png'})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              >
                {/* Container with relative position needed for absolute positioning of logo */}
                <div className="relative w-full h-full">
                  {/* Logo positioned to straddle bottom of banner */}
                  <div className="absolute left-1/2 transform -translate-x-1/2 bottom-0 translate-y-1/2 z-10">
                    {store.logoUrl ? (
                      <div className="bg-white p-2 rounded-full shadow-lg h-24 w-24 flex items-center justify-center border-4 border-white overflow-hidden relative">
                        {/* Placeholder skeleton that fades out when image loads */}
                        <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-full" 
                          style={{ opacity: 1, transition: 'opacity 0.3s ease-in-out' }}>
                        </div>
                        <img 
                          src={store.logoUrl} 
                          alt={`${store.name} logo`} 
                          className="max-h-20 max-w-20 object-contain rounded-full relative z-10"
                          loading="lazy"
                          onLoad={(e) => {
                            // Hide the placeholder when image loads
                            const target = e.currentTarget;
                            const placeholder = target.previousElementSibling as HTMLElement;
                            if (placeholder) placeholder.style.opacity = '0';
                          }}
                          onError={(e) => {
                            console.error("Error loading logo image in card");
                            e.currentTarget.onerror = null; // prevent looping
                            e.currentTarget.src = LogoImg;
                            e.currentTarget.alt = "Default Brand Image";
                            // Hide the placeholder on error too
                            const target = e.currentTarget;
                            const placeholder = target.previousElementSibling as HTMLElement;
                            if (placeholder) placeholder.style.opacity = '0';
                          }}
                          style={{ opacity: 1, transition: 'opacity 0.3s ease-in-out' }}
                        />
                      </div>
                    ) : (
                      <div className="bg-white p-4 rounded-full shadow-lg h-24 w-24 flex items-center justify-center border-4 border-white">
                        <div className="text-lg font-bold text-gray-700 text-center">{store.name.substring(0, 8)}{store.name.length > 8 ? '...' : ''}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-4 pt-16">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xl">{store.name}</CardTitle>
                {store.storeType && (
                  <Badge variant="outline" className="ml-2">
                    {store.storeType}
                  </Badge>
                )}
              </div>
              
              <Separator className="my-2" />
              
              <p className="text-gray-600 line-clamp-3">
                {store.description || "No description available."}
              </p>
            </CardContent>
            
            <CardFooter className="flex justify-between p-4">
              <Button onClick={() => handleStoreClick(store.slug)}>
                Visit Store
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  </div>
  );
}
