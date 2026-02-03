import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import capyLogo from "@/assets/capy-logo.png";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updatePassword, session } = useAuth();

  useEffect(() => {
    // Check if we have a valid recovery session
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get("type");
    
    if (type !== "recovery" && !session) {
      toast({
        title: "Invalid reset link",
        description: "Please request a new password reset link.",
        variant: "destructive",
      });
      navigate("/forgot-password");
    }
  }, [session, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in both password fields.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await updatePassword(password);
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setSuccess(true);
        setTimeout(() => {
          navigate("/auth");
        }, 2000);
      }
    } catch (err) {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <img src={capyLogo} alt="Capy logo" className="h-20 w-20" />
          <span className="text-3xl font-extrabold text-foreground">Capy</span>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border-forest bg-card p-8">
          {success ? (
            <div className="text-center space-y-4">
              <i className="fa-solid fa-check h-16 w-16 text-forest mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">Password updated!</h1>
              <p className="text-muted-foreground">
                Redirecting you to sign in...
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
                <p className="mt-2 text-muted-foreground">
                  Enter your new password below
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="font-semibold">New password</Label>
                  <div className="relative">
                    <i className="fa-solid fa-lock absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 h-14 text-base rounded-xl border-2"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="font-semibold">Confirm password</Label>
                  <div className="relative">
                    <i className="fa-solid fa-lock absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-12 h-14 text-base rounded-xl border-2"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full gap-2 h-14 text-base font-bold rounded-xl" disabled={loading}>
                  {loading ? "Updating..." : "Update password"}
                  {!loading && <i className="fa-solid fa-arrow-right h-5 w-5" />}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
