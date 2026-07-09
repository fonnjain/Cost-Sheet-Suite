import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetUserPassword, useUnlockTwiceMonthly, useToggleDailyLock, useGetRmPricesHistory, useGetRmPrices, useGetUserActivity, useGetMe, getGetRmPricesQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Unlock, Lock, Shield, Trash2, UserCog, FileText, ChevronDown, ChevronRight, UserPlus, KeyRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Admin() {
  const { data: users, isLoading: loadingUsers } = useListUsers();
  const { data: history, isLoading: loadingHistory } = useGetRmPricesHistory();
  const { data: activity, isLoading: loadingActivity } = useGetUserActivity();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<'admin' | 'user'>("user");
  const { data: rmPrices } = useGetRmPrices();
  const { data: me } = useGetMe();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetUserPassword();
  const unlockWindow = useUnlockTwiceMonthly();
  const toggleDailyLock = useToggleDailyLock();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isWindowOpen = !!rmPrices?.isWindowUnlocked;
  const isOverrideOn = !!rmPrices?.isWindowOverride;
  const isScheduleOpen = isWindowOpen && !isOverrideOn;
  const isDailyLocked = !!rmPrices?.isDailyLocked;

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleAddUser = async () => {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name || !email) {
      toast({ variant: "destructive", title: "Error", description: "Name and email are required" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ variant: "destructive", title: "Error", description: "Enter a valid email address" });
      return;
    }
    try {
      await createUser.mutateAsync({ data: { name, email, role: newRole } });
      await invalidateUsers();
      setNewName("");
      setNewEmail("");
      setNewRole("user");
      toast({ title: "User added", description: `${name} can now log in with the default password.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateUser.mutateAsync({ id, data: { isActive } });
      await invalidateUsers();
      toast({ title: "Updated", description: "User status updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleRoleChange = async (id: number, role: 'admin' | 'user') => {
    try {
      await updateUser.mutateAsync({ id, data: { role } });
      await invalidateUsers();
      toast({ title: "Updated", description: "User role updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteUser.mutateAsync({ id });
      await invalidateUsers();
      toast({ title: "Deleted", description: "User deleted" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleResetPassword = async (id: number, name: string) => {
    const isSelf = me?.id === id;
    const message = isSelf
      ? "Reset YOUR OWN password to the default? You will be logged out immediately and must log back in with the default password, then set a new one."
      : `Reset ${name}'s password to the default? They will be logged out and must set a new password on next login.`;
    if (!confirm(message)) return;
    try {
      await resetPassword.mutateAsync({ id });
      await invalidateUsers();
      toast({ title: "Password reset", description: `${name} is back on the default password.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleToggleDailyLock = async () => {
    const nextLocked = !isDailyLocked;
    try {
      await toggleDailyLock.mutateAsync({ data: { locked: nextLocked } });
      await queryClient.invalidateQueries({ queryKey: getGetRmPricesQueryKey() });
      toast({
        title: nextLocked ? "Locked" : "Unlocked",
        description: nextLocked
          ? "RM file inputs are locked for today. They reopen automatically tomorrow."
          : "RM file inputs are unlocked.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleToggleWindow = async () => {
    const nextUnlocked = !isOverrideOn;
    try {
      await unlockWindow.mutateAsync({ data: { unlocked: nextUnlocked } });
      await queryClient.invalidateQueries({ queryKey: getGetRmPricesQueryKey() });
      toast({
        title: nextUnlocked ? "Unlocked" : "Locked",
        description: nextUnlocked
          ? "Twice-monthly window unlocked for the rest of the day."
          : "Twice-monthly window locked.",
      });
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
            <div className="p-4 border-b border-border/50 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4 text-primary" />
                Add User
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="input-new-user-name"
                />
                <Input
                  type="email"
                  placeholder="email@vijaytransmission.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-testid="input-new-user-email"
                />
                <Select value={newRole} onValueChange={(v: 'admin' | 'user') => setNewRole(v)}>
                  <SelectTrigger className="w-full sm:w-[110px]" data-testid="select-new-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddUser}
                  disabled={createUser.isPending}
                  className="font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
                  data-testid="button-add-user"
                >
                  {createUser.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                New users log in with the default password and must change it on first login.
              </p>
            </div>
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
                    <TableCell className="text-right pr-4 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResetPassword(u.id, u.name)}
                        disabled={resetPassword.isPending}
                        className="text-muted-foreground hover:bg-accent/10 hover:text-accent"
                        title="Reset password to default"
                        data-testid={`button-reset-password-${u.id}`}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} className="text-destructive hover:bg-destructive/10" data-testid={`button-delete-user-${u.id}`}>
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
                {isDailyLocked ? (
                  <Lock className="h-5 w-5 text-accent" />
                ) : (
                  <Unlock className="h-5 w-5 text-accent" />
                )}
                <CardTitle>Daily RM Lock</CardTitle>
              </div>
              <CardDescription>
                {isDailyLocked
                  ? "RM file inputs are locked. They auto-lock daily at 2:00 PM; unlock to reopen them for the rest of today."
                  : "RM file inputs auto-lock daily at 2:00 PM. You can also lock them now."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleToggleDailyLock}
                disabled={toggleDailyLock.isPending}
                className={
                  isDailyLocked
                    ? "w-full font-bold bg-muted hover:bg-muted/80 text-foreground border border-border"
                    : "w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
                }
              >
                {toggleDailyLock.isPending
                  ? isDailyLocked
                    ? "Unlocking..."
                    : "Locking..."
                  : isDailyLocked
                    ? "Unlock RM Inputs"
                    : "Lock RM Inputs Today"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/50 border-t-4 border-t-accent">
            <CardHeader>
              <div className="flex items-center gap-2">
                {isWindowOpen ? (
                  <Unlock className="h-5 w-5 text-accent" />
                ) : (
                  <Lock className="h-5 w-5 text-accent" />
                )}
                <CardTitle>Window Override</CardTitle>
              </div>
              <CardDescription>
                {isScheduleOpen
                  ? "The window is open by schedule today (1st/16th); no override needed."
                  : isOverrideOn
                    ? "The Twice-Monthly RM price window is currently open."
                    : "Manually open the Twice-Monthly RM price window."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleToggleWindow}
                disabled={unlockWindow.isPending || isScheduleOpen}
                className={
                  isOverrideOn
                    ? "w-full font-bold bg-muted hover:bg-muted/80 text-foreground border border-border"
                    : "w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
                }
              >
                {unlockWindow.isPending
                  ? isOverrideOn
                    ? "Locking..."
                    : "Unlocking..."
                  : isScheduleOpen
                    ? "Open by Schedule"
                    : isOverrideOn
                      ? "Lock Window"
                      : "Unlock Window Today"}
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
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>User Quote Activity</CardTitle>
          </div>
          <CardDescription>Quotes generated by each user. Tap a user to see their quotes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 w-8"></TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right pr-4">Quotes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingActivity ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : !activity?.length ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No quotes yet</TableCell></TableRow>
              ) : activity.map((a) => (
                <Fragment key={a.userName}>
                  <TableRow
                    className="cursor-pointer hover:bg-card/50"
                    onClick={() => setExpandedUser(expandedUser === a.userName ? null : a.userName)}
                    data-testid={`row-activity-${a.userName}`}
                  >
                    <TableCell className="pl-4">
                      {expandedUser === a.userName
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium">{a.userName}</TableCell>
                    <TableCell className="text-right pr-4 font-mono">{a.quoteCount}</TableCell>
                  </TableRow>
                  {expandedUser === a.userName && (
                    <TableRow key={`${a.userName}-detail`}>
                      <TableCell colSpan={3} className="p-0 bg-background/50">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="pl-8">Customer</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Structure</TableHead>
                                <TableHead>Rev</TableHead>
                                <TableHead className="pr-4">Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {a.quotes.map((q) => (
                                <TableRow key={q.id}>
                                  <TableCell className="pl-8 text-sm max-w-[220px] truncate">{q.customerName}</TableCell>
                                  <TableCell className="text-sm">{q.projectRef}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{q.structureType}</TableCell>
                                  <TableCell className="font-mono text-sm">Rev {q.revision}</TableCell>
                                  <TableCell className="pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                    {format(new Date(q.createdAt), 'dd MMM yyyy, HH:mm')}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
