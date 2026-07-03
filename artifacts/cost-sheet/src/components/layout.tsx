import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, LogOut, User as UserIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { clearToken } from "@/lib/auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });
  const logout = useLogout();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/login");
    }
  }, [user, isLoading, isError, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (isError || !user) {
    return null;
  }

  const handleLogout = async () => {
    await logout.mutateAsync();
    clearToken();
    queryClient.clear();
    setLocation("/login");
  };

  const NavLink = ({ href, children, testId, base }: { href: string; children: React.ReactNode; testId: string; base?: string }) => {
    const active = location === href || location.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors ${
          active
            ? "text-primary border-b-2 border-primary pb-0.5"
            : `${base ?? "text-muted-foreground"} hover:text-primary`
        }`}
        data-testid={testId}
      >
        {children}
      </Link>
    );
  };

  const NavLinks = () => (
    <>
      <NavLink href="/rm-prices" testId="nav-rm-prices">RM Prices</NavLink>
      <NavLink href="/rm-price-list" testId="nav-rm-price-list">RM Price List</NavLink>
      <NavLink href="/rm-data-variation" testId="nav-rm-data-variation">RM Variation</NavLink>
      <NavLink href="/calculator" testId="nav-calculator">Calculator</NavLink>
      <NavLink href="/dashboard" testId="nav-dashboard">Dashboard</NavLink>
      <NavLink href="/review" testId="nav-review">Review</NavLink>
      {user.role === "admin" && (
        <NavLink href="/admin" testId="nav-admin" base="text-red-400">Admin</NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
        <div className="container flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-hamburger">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[240px] sm:w-[300px]">
                <nav className="flex flex-col gap-4 mt-8">
                  <NavLinks />
                </nav>
              </SheetContent>
            </Sheet>
            <Link href="/" className="flex items-center gap-2" data-testid="link-home">
              <div className="h-8 w-8 bg-primary rounded-sm flex items-center justify-center text-primary-foreground font-bold text-sm">VT</div>
              <span className="font-bold hidden sm:inline-block tracking-tight">VIJAY TRANSMISSION</span>
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <NavLinks />
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium" data-testid="text-username">{user.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-secondary text-xs uppercase tracking-wider text-secondary-foreground">{user.role}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 lg:p-8 container mx-auto">
        {children}
      </main>
    </div>
  );
}
