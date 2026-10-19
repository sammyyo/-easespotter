import RootHeader from "@/components/layout/RootHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import LogoImg from "../assets/EaseSpotter.png";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  MapPin,
  Package,
  QrCode,
  ReceiptText,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Users,
} from "lucide-react";

const featureSummary = [
  {
    icon: Package,
    value: "Catalog",
    label: "Products, images, brands, barcode labels, and locations.",
  },
  {
    icon: ScanBarcode,
    value: "Cashier",
    label: "Barcode scanning, carts, receipts, refunds, and stock updates.",
  },
  {
    icon: ShoppingCart,
    value: "Store App",
    label: "Product details, offers, availability, and locations prepared for customers.",
  },
];

const coreFeatures = [
  {
    icon: Package,
    title: "Product Catalog",
    description: "Add products with images, descriptions, brand, barcode, category, aisle, shelf, prices, and stock levels.",
  },
  {
    icon: ScanBarcode,
    title: "Cashier Checkout",
    description: "Scan barcodes, build carts, apply active promotion prices, complete sales, and reduce stock automatically.",
  },
  {
    icon: Boxes,
    title: "Inventory Controls",
    description: "Track current stock, low-stock thresholds, restock signals, refunds, and manual inventory adjustments.",
  },
  {
    icon: Tags,
    title: "Promotions",
    description: "Create active or scheduled promotions, attach products, add promotion images, and show sale prices to customers.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Review pricing activity, category distribution, price trends, and sales summaries from the vendor dashboard.",
  },
  {
    icon: Users,
    title: "Team Access",
    description: "Invite team members, assign permission profiles, and give cashier users limited access to checkout only.",
  },
];

const workflowSteps = [
  {
    title: "Build the catalog",
    description: "Upload product details, images, barcode labels, and location fields vendors can customize.",
  },
  {
    title: "Sell through Cashier",
    description: "Cashiers scan items, complete sales, print receipts, and keep inventory connected to checkout.",
  },
  {
    title: "Publish store data",
    description: "Keep product data, images, stock visibility, and aisle/shelf locations ready for customer-facing experiences.",
  },
];

const operatingFeatures = [
  {
    icon: ReceiptText,
    title: "Sales History",
    description: "Recent sales include order items, totals, payment method, receipts, refunds, and stock restoration options.",
  },
  {
    icon: QrCode,
    title: "Store QR Codes",
    description: "Generate QR codes for store directories and product details so customers can open product data quickly.",
  },
  {
    icon: MapPin,
    title: "In-Store Location",
    description: "Use default Aisle/Shelf labels or customize location naming for each store's floor layout.",
  },
  {
    icon: ShieldCheck,
    title: "Vendor-Safe Access",
    description: "Vendor data is scoped by store, with role-aware dashboard access for owners, admins, users, and cashiers.",
  },
];

export default function Features() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <RootHeader />

      <section className="relative overflow-hidden border-b border-outline-variant/60">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/EaseSpotter_Retail_image.png')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/65" aria-hidden="true" />
        <div className="relative container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl">
            <Badge className="mb-5 bg-secondary text-secondary-foreground hover:bg-secondary">
              Retail operations platform
            </Badge>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">
              Run products, pricing, and checkout from one store dashboard.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/85">
              EaseSpotter gives vendors the tools to manage product catalogs, scan sales, update inventory, publish app-ready store data, and control team access.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {isLoading ? (
                <div className="h-11 w-40 rounded-md bg-white/20" aria-hidden="true" />
              ) : user ? (
                <Button size="lg" onClick={() => navigate("/dashboard")} className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
                  Open Dashboard <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
                  Start Managing Products <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => navigate("/stores")} className="border-white/70 bg-white/10 text-white hover:bg-white hover:text-primary">
                View Store Directory
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main className="bg-gradient-to-b from-white via-[#fbf9ff] to-[#f8fbff]">
        <section className="border-b border-slate-200/70 bg-slate-50/80">
          <div className="container mx-auto px-4 pb-12 pt-0">
            <div className="relative z-10 -mt-10 grid gap-4 md:grid-cols-3">
              {featureSummary.map((item) => (
                <MetricCard key={item.value} icon={item.icon} value={item.value} label={item.label} />
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16 md:py-20">
          <SectionHeading
            eyebrow="Dashboard modules"
            title="Core Features"
            description="The MVP focuses on the daily work of running a store: adding products, selling items, tracking stock, publishing store data, and managing team access."
          />

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="group border-outline-variant/70 bg-white/95 transition-all duration-200 hover:-translate-y-0.5 hover:border-secondary/40 hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-md bg-orange-100 text-orange-600 transition-colors group-hover:bg-orange-500 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-950">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="border-y border-slate-200/70 bg-white/80 py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">Store workflow</div>
                <h2 className="text-3xl font-bold text-slate-950">Built Around the Store Workflow</h2>
                <p className="mt-4 max-w-xl text-muted-foreground">
                  EaseSpotter is not just a marketing site. The dashboard supports the flow from catalog setup to checkout and app publishing.
                </p>
                <div className="mt-7 flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-800">Sales can update inventory without leaving the cashier screen.</span>
                </div>
              </div>

              <div className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <div key={step.title} className="flex gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#006b72] text-sm font-bold text-white">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-950">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#fbf9ff]">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <SectionHeading
              eyebrow="Daily controls"
              title="Operational Tools"
              description="Supporting features help vendors keep daily store work organized without exposing unfinished modules."
            />

            <div className="grid gap-5 md:grid-cols-2">
              {operatingFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:border-secondary/40 hover:shadow-md">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-950">{feature.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16 md:py-20">
          <div className="overflow-hidden rounded-md bg-[#006b72] text-white shadow-lg">
            <div className="grid gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-10">
              <div>
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">Start from the dashboard</div>
                <h2 className="text-3xl font-bold">Ready to manage your store catalog?</h2>
                <p className="mt-3 max-w-2xl text-white/80">
                  Create products, scan sales, update stock, and publish store data from one vendor dashboard.
                </p>
              </div>
              {isLoading ? (
                <div className="h-11 w-40 rounded-md bg-white/20" aria-hidden="true" />
              ) : user ? (
                <Button size="lg" onClick={() => navigate("/dashboard")} className="bg-orange-500 text-white hover:bg-orange-600">
                  Open Dashboard
                </Button>
              ) : (
                <Button size="lg" onClick={() => navigate("/auth")} className="bg-orange-500 text-white hover:bg-orange-600">
                  Get Started
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <img src={LogoImg} alt="EaseSpotter Logo" className="h-8" />
              <span className="font-bold text-lg">EaseSpotter</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} EaseSpotter. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-10 max-w-3xl">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">{eyebrow}</div>
      <h2 className="text-3xl font-bold text-slate-950">{title}</h2>
      <p className="mt-3 text-muted-foreground">{description}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, value, label }: { icon: typeof Package; value: string; label: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 shadow-md shadow-slate-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-slate-900/10">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-lg font-semibold text-slate-950">{value}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{label}</p>
    </div>
  );
}
