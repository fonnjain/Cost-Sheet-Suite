import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storeToken } from "@/lib/auth";

const ALLOWED_USER_NAMES = ["Varun", "Sambit", "Rajesh", "Sundar", "Bunty", "Sanjay", "Alok", "Richa", "AI Tools"];

export default function Login() {
  const [email, setEmail] = useState("");
  const login = useLogin();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      const response = await login.mutateAsync({ data: { email } });
      const raw = response as unknown as { token?: string };
      if (raw.token) {
        storeToken(raw.token);
      }
      toast({ title: "Welcome back", description: "Logged in successfully" });
      setLocation("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to login";
      toast({ variant: "destructive", title: "Access Denied", description: msg });
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-xl shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-10 w-10 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-xl">VT</div>
            <span className="font-bold tracking-tight text-xl">VIJAY TRANSMISSION</span>
          </div>
          <CardTitle className="text-2xl tracking-tight">Cost Sheet Suite</CardTitle>
          <CardDescription>Enter your authorized email address to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-login">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                data-testid="input-email"
                type="email"
                placeholder="yourname@vijaytransmission.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background"
                autoComplete="email"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Authorized users: {ALLOWED_USER_NAMES.join(" · ")}
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <Button
                data-testid="button-login"
                type="submit"
                className="w-full font-bold"
                disabled={login.isPending}
              >
                {login.isPending ? "Signing in…" : "Sign In"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full cursor-not-allowed opacity-40"
                disabled
                title="Coming soon"
                data-testid="button-otp"
              >
                Mobile OTP — Coming Soon
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
