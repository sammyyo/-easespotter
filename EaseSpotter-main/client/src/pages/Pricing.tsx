import RootHeader from "@/components/layout/RootHeader";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <RootHeader />
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-4">Pricing</h1>
        <p className="text-muted-foreground">Explore our pricing options.</p>
      </div>
    </div>
  );
}
