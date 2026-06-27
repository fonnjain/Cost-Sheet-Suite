import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListUsers, useUpdateUser, useDeleteUser, useUnlockTwiceMonthly, useGetRmPricesHistory, getGetRmPricesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Unlock, Shield, Trash2, UserCog } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Admin() {
  const { data: users, isLoading: loadingUsers } = useListUsers();
  const { data: history, isLoading: loadingHistory } = useGetRmPricesHistory();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const unlockWindow = useUnlockTwiceMonthly();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateUser.mutateAsync({ id, data: { isActive } });
      toast({ title: "Updated", description: "User status updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleRoleChange = async (id: number, role: 'admin' | 'user') => {
    try {
      await updateUser.mutateAsync({ id, data: { role } });
      toast({ title: "Updated", description: "User role updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "Deleted", description: "User deleted" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleUnlock = async () => {
    try {
      await unlockWindow.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetRmPricesQueryKey() });
      toast({ title: "Unlocked", description: "Twice-monthly window unlocked for the rest of the day." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground">Manage users and system settings</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50">
          <CardHeader className="bg-card/50 border-b border-border/50">
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              <CardTitle>User Management</CardTitle>
            </div>
            <CardDescription>Control who has access to the suite and their roles.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUsers ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                ) : users?.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="pl-4 font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(v: 'admin' | 'user') => handleRoleChange(u.id, v)}>
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="bottom">
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch 
                        checked={u.isActive} 
                        onCheckedChange={(v) => handleToggleActive(u.id, v)} 
                      />
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50 border-t-4 border-t-accent">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Unlock className="h-5 w-5 text-accent" />
                <CardTitle>Window Override</CardTitle>
              </div>
              <CardDescription>Manually open the Twice-Monthly RM price window.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleUnlock} disabled={unlockWindow.isPending} className="w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground">
                {unlockWindow.isPending ? "Unlocking..." : "Unlock Window Today"}
              </Button>
            </CardContent>
          </Card>
          
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">System Info</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">1.0.0</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono text-emerald-500">Connected</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <CardTitle>RM Prices Audit Log</CardTitle>
          <CardDescription>History of all price updates.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Updated By</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHistory ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : history?.slice(0, 10).map((h: any) => (
                <TableRow key={h.id}>
                  <TableCell className="pl-4 font-mono text-sm">
                    {format(new Date(h.createdAt), 'dd MMM yyyy, HH:mm')}
                  </TableCell>
                  <TableCell>{h.createdByName}</TableCell>
                  <TableCell>
                    {h.isWindowUnlocked ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Unlocked Window</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-card">Standard</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
