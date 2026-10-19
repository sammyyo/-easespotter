import RootHeader from "@/components/layout/RootHeader";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <RootHeader />
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-4">About</h1>
        <p className="text-muted-foreground">Information about EaseSpotter.</p>
      </div>
    </div>
  );
}
