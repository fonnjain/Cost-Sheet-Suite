import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Clock3, Download, FileText, MapPinned, ReceiptText, UsersRound } from "lucide-react";
import { useGetUserUsage, useListUsers, type UserUsageEvent } from "@workspace/api-client-react";
import { formatINR } from "@/lib/costCalculator";
import { exportUserUsageReportPdf } from "@/lib/pdfExport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function eventLabel(event: UserUsageEvent) {
  if (event.eventType === "login") return "Signed in";
  if (event.eventType === "logout") return "Signed out";
  if (event.eventType === "page_view") return `Visited ${event.pagePath}`;
  if (event.eventType === "quote_generated") return `Generated quote #${event.entityId}`;
  if (event.eventType === "report_export") return "Downloaded quote revision PDF";
  return event.eventType;
}

export function UserUsageAudit() {
  const [from, setFrom] = useState(() => localDate(-29));
  const [to, setTo] = useState(() => localDate());
  const [userId, setUserId] = useState("all");
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const queryParams = useMemo(
    () => ({ from, to, ...(userId === "all" ? {} : { userId: Number(userId) }) }),
    [from, to, userId],
  );
  const { data, isLoading, isError } = useGetUserUsage(queryParams);
  const { data: users } = useListUsers();
  const userFilterLabel = userId === "all"
    ? "All users"
    : users?.find((user) => String(user.id) === userId)?.name ?? "Selected user";

  return (
    <Card className="border-border/50" data-testid="card-user-usage-audit">
      <CardHeader className="bg-card/50 border-b border-border/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-primary" />
              <CardTitle>User Usage & Activity Audit</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Session estimates, page visits, generated quotes, costs, and exported reports.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              From
              <Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="h-8 w-[142px]" data-testid="input-usage-from" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              To
              <Input type="date" value={to} min={from} max={localDate()} onChange={(event) => setTo(event.target.value)} className="h-8 w-[142px]" data-testid="input-usage-to" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              User
              <Select value={userId} onValueChange={(value) => { setUserId(value); setExpandedUserId(null); }}>
                <SelectTrigger className="h-8 w-[170px]" data-testid="select-usage-user"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {(users ?? []).map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={isLoading || isError || !data}
              onClick={() => data && exportUserUsageReportPdf({ data, userFilterLabel })}
              data-testid="button-export-usage-pdf"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground pt-2">
          Active and idle time are approximate: the app records bounded one-minute browser heartbeats, not keystrokes, form values, screen activity, IP addresses, or device data.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Loading usage data…</div>
        ) : isError ? (
          <div className="py-10 px-4 text-center text-sm text-destructive">Usage data could not be loaded for this date range.</div>
        ) : !data?.users.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No users match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 w-8" />
                  <TableHead>User</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Active estimate</TableHead>
                  <TableHead className="text-right">Idle estimate</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Quotes / cost</TableHead>
                  <TableHead className="text-right pr-4">Reports</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((summary) => {
                  const expanded = expandedUserId === summary.userId;
                  return (
                    <Fragment key={summary.userId}>
                      <TableRow
                        className="cursor-pointer hover:bg-card/50"
                        onClick={() => setExpandedUserId(expanded ? null : summary.userId)}
                        data-testid={`row-usage-${summary.userId}`}
                      >
                        <TableCell className="pl-4">
                          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{summary.userName}</div>
                          <div className="text-xs text-muted-foreground">{summary.email}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {summary.lastActiveAt ? format(new Date(summary.lastActiveAt), "dd MMM, HH:mm") : "No activity yet"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{summary.sessionCount}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{formatDuration(summary.activeSeconds)}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{formatDuration(summary.idleSeconds)}</TableCell>
                        <TableCell className="text-right font-mono">{summary.pageVisitCount}<span className="text-muted-foreground"> / {summary.uniquePageCount}</span></TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="font-mono">{summary.quoteCount}</div>
                          <div className="text-xs text-muted-foreground">{formatINR(summary.totalCostGenerated)}</div>
                        </TableCell>
                        <TableCell className="text-right pr-4 font-mono">{summary.reportCount}</TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={9} className="p-0 bg-background/50">
                            <div className="grid gap-5 p-5 lg:grid-cols-2">
                              <div>
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPinned className="h-4 w-4 text-primary" /> Pages visited</div>
                                {!summary.pages.length ? (
                                  <p className="text-sm text-muted-foreground">No page visits have been recorded in this period.</p>
                                ) : (
                                  <div className="rounded-md border border-border/50 overflow-hidden">
                                    {summary.pages.map((page) => (
                                      <div key={page.path} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                                        <div>
                                          <code className="text-xs font-medium">{page.path}</code>
                                          <div className="text-xs text-muted-foreground mt-0.5">
                                            {page.firstVisitedAt && page.lastVisitedAt ? `${format(new Date(page.firstVisitedAt), "dd MMM, HH:mm")} – ${format(new Date(page.lastVisitedAt), "dd MMM, HH:mm")}` : ""}
                                          </div>
                                        </div>
                                        <Badge variant="outline" className="self-center font-mono">{page.visits} visit{page.visits === 1 ? "" : "s"}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-primary" /> Recent recorded events</div>
                                {!summary.recentEvents.length ? (
                                  <p className="text-sm text-muted-foreground">No usage events have been recorded in this period.</p>
                                ) : (
                                  <div className="rounded-md border border-border/50 overflow-hidden">
                                    {summary.recentEvents.map((event) => (
                                      <div key={event.id} className="flex items-start justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                                        <span>{eventLabel(event)}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(event.occurredAt), "dd MMM, HH:mm")}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="grid border-t border-border/40 grid-cols-3 text-sm">
                              <AuditMetric icon={<Clock3 className="h-4 w-4" />} label="Session time" value={`${formatDuration(summary.activeSeconds)} active · ${formatDuration(summary.idleSeconds)} idle`} />
                              <AuditMetric icon={<ReceiptText className="h-4 w-4" />} label="Cost sheets" value={`${summary.quoteCount} generated`} />
                              <AuditMetric icon={<FileText className="h-4 w-4" />} label="Reports" value={`${summary.reportCount} exported`} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-2 px-5 py-3 border-r border-border/40 last:border-r-0">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>
    </div>
  );
}