import React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import LogoImg from "../../assets/EaseSpotter.png";

export default function RootHeader() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();

  const linkClassName = (href: string) =>
    [
      "relative cursor-pointer text-sm font-medium transition-colors after:absolute after:left-0 after:-bottom-2 after:h-0.5 after:w-full after:origin-left after:rounded-full after:bg-secondary after:transition-transform",
      location === href
        ? "text-primary after:scale-x-100"
        : "text-foreground/80 hover:text-primary after:scale-x-0 hover:after:scale-x-100",
    ].join(" ");

  const NavLinks = (
    <>
      <Link href="/stores">
        <span className={linkClassName("/stores")}>
          Stores
        </span>
      </Link>
      <Link href="/features">
        <span className={linkClassName("/features")}>
          Features
        </span>
      </Link>
      <Link href="/pricing">
        <span className={linkClassName("/pricing")}>
          Pricing
        </span>
      </Link>
      <Link href="/about">
        <span className={linkClassName("/about")}>
          About
        </span>
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-outline-variant/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64">
                  <nav className="mt-8 flex flex-col gap-4">
                    {NavLinks}
                  </nav>
                  <div className="mt-6 flex flex-col gap-2">
                    {isLoading ? (
                      <div className="h-10 rounded-md bg-muted" />
                    ) : user ? (
                      <Button onClick={() => navigate('/dashboard')}>Dashboard</Button>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => navigate('/auth')}>Login</Button>
                        <Button onClick={() => navigate('/auth')}>Get Started</Button>
                      </>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <img src={LogoImg} alt="EaseSpotter Logo" className="h-8" />
                <span className="font-bold text-xl">EaseSpotter</span>
              </div>
            </Link>
          </div>
          <nav className="hidden md:flex items-center space-x-8">
            {NavLinks}
          </nav>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-10 w-28 rounded-md bg-muted" aria-hidden="true" />
            ) : user ? (
              <Button onClick={() => navigate('/dashboard')} className="gap-2">
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/auth')}
                  className="text-sm font-medium"
                >
                  Login
                </Button>
                <Button
                  onClick={() => navigate('/auth')}
                  className="bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
