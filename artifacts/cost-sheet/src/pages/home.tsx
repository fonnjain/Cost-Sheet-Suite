import { useGetMe, useGetDashboardSummary } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/costCalculator";
import { ArrowRight, Calculator, FileText, TrendingUp } from "lucide-react";

export default function Home() {
  const { data: user } = useGetMe();
  const { data: summary } = useGetDashboardSummary();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Select an action to get started with your quotes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/rm-prices">
          <Card className="hover-elevate cursor-pointer border-l-4 border-l-accent bg-card/50 backdrop-blur transition-colors hover:bg-accent/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Step 01</CardTitle>
              <TrendingUp className="h-5 w-5 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-1">RM Prices</div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                Update base rates <ArrowRight className="h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/calculator">
          <Card className="hover-elevate cursor-pointer border-l-4 border-l-primary bg-card/50 backdrop-blur transition-colors hover:bg-primary/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Step 02-04</CardTitle>
              <Calculator className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-1">Calculator</div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                Build a new cost sheet <ArrowRight className="h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard">
          <Card className="hover-elevate cursor-pointer border-l-4 border-l-muted-foreground bg-card/50 backdrop-blur transition-colors hover:bg-secondary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Reporting</CardTitle>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-1">Dashboard</div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                View insights & history <ArrowRight className="h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8 space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Brief Stats</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Quotes This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono">{summary?.quotesThisMonth || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono">{summary?.totalQuotes || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Price / MT</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono text-primary">{formatINR(summary?.avgQuotePrice || 0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold truncate">{summary?.topCustomer || '-'}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
