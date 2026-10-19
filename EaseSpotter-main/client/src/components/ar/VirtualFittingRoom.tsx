import { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html, Environment, ContactShadows } from '@react-three/drei';
import { ARButton, XR, Controllers, Hands, useHitTest, Interactive } from '@react-three/xr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useIsMobile } from '@/hooks/use-mobile';
import { useWebSocket } from '@/hooks/use-websocket';
import { useToast } from '@/hooks/use-toast';

interface VirtualFittingRoomProps {
  productId: number;
  modelUrl?: string;
}

// Default model URL if none is provided
const DEFAULT_MODEL_URL = '/models/fallback.glb';

function ProductModel({ modelUrl, scale = 1 }: { modelUrl: string, scale?: number }) {
  const { scene } = useGLTF(modelUrl || DEFAULT_MODEL_URL);
  return <primitive object={scene} scale={[scale, scale, scale]} position={[0, 0, 0]} />;
}

function ARScene({ modelUrl }: { modelUrl?: string }) {
  const [placed, setPlaced] = useState(false);
  const [position, setPosition] = useState([0, 0, -1]);
  
  // AR hit test - place object on detected surface
  const hitTest = useHitTest((hit) => {
    if (!placed) {
      const hitMatrix = hit.getPose()?.transform.matrix || [];
      if (hitMatrix.length === 16) {
        setPosition([hitMatrix[12], hitMatrix[13], hitMatrix[14]]);
        setPlaced(true);
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-5, -5, -5]} intensity={0.4} />
      
      {placed ? (
        <Interactive onSelect={() => setPlaced(false)}>
          <mesh position={position as [number, number, number]}>
            <Suspense fallback={null}>
              <ProductModel modelUrl={modelUrl || DEFAULT_MODEL_URL} scale={0.5} />
            </Suspense>
            <Html position={[0, 0.5, 0]} center distanceFactor={5}>
              <div className="bg-slate-800/80 text-white px-2 py-1 rounded text-xs whitespace-nowrap">
                Tap to remove
              </div>
            </Html>
          </mesh>
        </Interactive>
      ) : (
        <Html center position={[0, 0, -2]}>
          <div className="bg-slate-800/80 text-white px-3 py-2 rounded text-sm whitespace-nowrap">
            Move device to scan surfaces
          </div>
        </Html>
      )}
      
      <Controllers />
      <Hands />
    </>
  );
}

function Scene3D({ modelUrl }: { modelUrl?: string }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-5, -5, -5]} intensity={0.4} />

      <Suspense fallback={null}>
        <ProductModel modelUrl={modelUrl || DEFAULT_MODEL_URL} />
        <Environment preset="city" />
        <ContactShadows 
          rotation={[Math.PI / 2, 0, 0]} 
          position={[0, -0.5, 0]} 
          opacity={0.4} 
          width={10} 
          height={10} 
          blur={1} 
          far={10} 
          resolution={512} 
        />
      </Suspense>

      <OrbitControls 
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={1}
        maxDistance={10}
      />
    </>
  );
}

export function VirtualFittingRoom({ productId, modelUrl }: VirtualFittingRoomProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [arMode, setArMode] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  // WebSocket connection for real-time product updates
  const { sendMessage } = useWebSocket({
    onMessage: (data) => {
      if (data.type === 'product_updated' && data.data.id === productId) {
        toast({
          title: 'Product Updated',
          description: 'The 3D model has been updated. Refresh to see changes.',
        });
      }
    },
  });

  useEffect(() => {
    console.log('VirtualFittingRoom mounted', { productId, modelUrl });
    
    // Subscribe to product updates
    if (productId) {
      sendMessage({
        type: 'subscribe_product_updates',
        productId
      });
    }
    
    setIsLoading(false);
    
    return () => {
      console.log('VirtualFittingRoom unmounted');
      // Unsubscribe when component unmounts
      if (productId) {
        sendMessage({
          type: 'unsubscribe_product_updates',
          productId
        });
      }
    };
  }, [productId, modelUrl, sendMessage]);

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center h-[400px]">
          <Spinner className="h-8 w-8" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Virtual Try-On</CardTitle>
        <CardDescription>
          {isMobile 
            ? "Try on the product in augmented reality or view in 3D" 
            : "Examine the product from all angles using your mouse"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className={`relative ${isMobile ? 'aspect-square' : 'aspect-video'} mt-4`}>
            <ErrorBoundary>
              <Canvas
                camera={{ 
                  fov: 75, 
                  near: 0.1, 
                  far: 1000, 
                  position: [0, 0, 3] 
                }}
                className="w-full h-full"
              >
                {arMode ? (
                  <XR>
                    <ARScene modelUrl={modelUrl} />
                  </XR>
                ) : (
                  <Scene3D modelUrl={modelUrl} />
                )}
              </Canvas>
            </ErrorBoundary>
          </div>
          
          <div className="flex justify-center gap-4">
            {isMobile && (
              <div className="ar-button-container">
                <ARButton
                  className="bg-primary text-white px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
                  onClick={() => setArMode(true)}
                  sessionInit={{
                    requiredFeatures: ['hit-test'],
                  }}
                >
                  Try in AR
                </ARButton>
              </div>
            )}
            
            {arMode && (
              <Button
                variant="outline"
                onClick={() => setArMode(false)}
              >
                Exit AR
              </Button>
            )}
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            {arMode ? (
              "Move your device to scan surfaces, then tap to place the product"
            ) : isMobile ? (
              "Use touch gestures to rotate and zoom"
            ) : (
              "Use mouse to rotate, scroll to zoom, and right-click to pan"
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Preload a default model as fallback
useGLTF.preload(DEFAULT_MODEL_URL);