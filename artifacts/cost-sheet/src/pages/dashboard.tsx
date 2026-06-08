import { useGetDashboardSummary, useGetQuotesByStructure, useGetQuotesByUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatINR } from "@/lib/costCalculator";

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary();
  const { data: structureData } = useGetQuotesByStructure();
  const { data: userData } = useGetQuotesByUser();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of all quoting activity</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{summary?.totalQuotes || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{summary?.totalCustomers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quotes This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{summary?.quotesThisMonth || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Quote Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono text-primary">{formatINR(summary?.avgQuotePrice || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Quotes by Structure Type</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={structureData || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis dataKey="structureType" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.1)' }} contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Quotes by User</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userData || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="userName" type="category" tick={{ fontSize: 12 }} width={100} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.1)' }} contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }} />
                <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
