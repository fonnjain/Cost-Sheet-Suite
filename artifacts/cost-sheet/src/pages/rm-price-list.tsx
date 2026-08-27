import { useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetRmPrices, useGetRmOffsets } from "@workspace/api-client-react";
import { INITIAL_DATA } from "@/lib/v6/data";
import type { InitialCell } from "@/lib/v6/data";
import { buildRMPriceListView, computeAutoOverrides } from "@/lib/v6/engine";
import type { RMPriceListBlock } from "@/lib/v6/engine";

// Same default-fill pattern as rm-prices.tsx: fall back to the embedded
// INITIAL_DATA defaults for any cell not yet saved to the DB.
function defaultsFor(rec: Record<string, InitialCell>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, meta] of Object.entries(rec)) out[key] = meta.value;
  return out;
}
const DAILY_DEFAULTS = defaultsFor(INITIAL_DATA.daily);
const TWICE_DEFAULTS = defaultsFor(INITIAL_DATA.twice);

function formatInr(v: number | null): string {
  if (v == null) return "\u2013";
  return `\u20B9${Math.round(v).toLocaleString("en-IN")}`;
}

function PriceListBlockCard({ block }: { block: RMPriceListBlock }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4 border-b border-border/50 bg-card/50">
        <CardTitle className="text-lg">{block.title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap sticky left-0 bg-card">Section</TableHead>
                {block.headers.map((h) => (
                  <TableHead key={h.col} className="text-right whitespace-nowrap min-w-[150px]">
                    <div className="font-bold">{h.supplier || "\u2013"}</div>
                    <div className="text-xs font-normal text-muted-foreground">({h.make})</div>
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30">Base Price</TableHead>
                {block.headers.map((h) => (
                  <TableHead key={h.col + "-base"} className="text-right text-xs font-mono font-normal text-muted-foreground">
                    {formatInr(h.basePrice)}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30">{block.headers[0]?.transportLabel || "Load+Transport+Brokerage"}</TableHead>
                {block.headers.map((h) => (
                  <TableHead key={h.col + "-transport"} className="text-right text-xs font-mono font-normal text-muted-foreground">
                    {formatInr(h.transport)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row) => (
                <TableRow key={row.row}>
                  <TableCell className="whitespace-nowrap sticky left-0 bg-background" data-testid={`rmpricelist-section-${block.key}-${row.row}`}>
                    <div className="font-medium">{row.section}</div>
                    {row.category && <div className="text-xs text-muted-foreground">{row.category}</div>}
                  </TableCell>
                  {block.headers.map((h) => (
                    <TableCell key={h.col} className="text-right font-mono" data-testid={`rmpricelist-price-${block.key}-${row.row}-${h.col}`}>
                      {formatInr(row.prices[h.col] ?? null)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RmPriceList() {
  const { data: rmPrices, isLoading } = useGetRmPrices();
  const { data: rmOffsets } = useGetRmOffsets();

  const view = useMemo(() => {
    const daily = { ...DAILY_DEFAULTS, ...((rmPrices?.dailyData as Record<string, number>) ?? {}) };
    const twice = { ...TWICE_DEFAULTS, ...((rmPrices?.twiceMonthlyData as Record<string, number>) ?? {}) };
    const offsets = (rmOffsets?.offsetData as Record<string, number>) ?? {};
    const autoOverrides = computeAutoOverrides(daily, offsets);
    const overrides = { ...daily, ...twice, ...autoOverrides };
    return buildRMPriceListView(overrides);
  }, [rmPrices?.dailyData, rmPrices?.twiceMonthlyData, rmOffsets?.offsetData]);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm animate-pulse">Loading RM Price List…</div>
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RM Price List</h1>
          <p className="text-muted-foreground">Read-only view of the RM source sheet, grouped by material</p>
        </div>
        <div className="text-sm font-mono bg-card px-3 py-1.5 rounded-md border border-border">
          {format(new Date(), "dd-MM-yyyy")}
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-4 border-b border-border/50 bg-card/50">
          <CardTitle className="text-base">Reference</CardTitle>
          <CardDescription>Same as-of date and zinc price shown in the RM Price Console</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">RM Date: </span>
              <span className="font-mono" data-testid="rmpricelist-rmdate">{format(new Date(`${view.rmDate}T00:00:00`), "dd-MM-yyyy")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Zinc: </span>
              <span className="font-mono font-bold" data-testid="rmpricelist-zinc">{formatInr(view.zincPrice)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {view.blocks.map((block) => (
        <PriceListBlockCard key={block.key} block={block} />
      ))}
    </div>
  );
}
