import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import Logo from "@/components/Logo";
import { forgotPassword } from "@/api/client";

interface FormValues {
  email: string;
}

export default function ForgotPassword() {
  const [sent, setSent] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await forgotPassword(values.email);
      setSent(result.detail);
      // Development-mode convenience: the backend returns the reset token
      // so the flow works without an SMTP server. Production emails it.
      setResetToken(result.reset_token ?? null);
    } catch (err: any) {
      setServerError(err?.response?.data?.detail || "Something went wrong — try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-ink">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo size={28} />
          <span className="font-display text-lg font-semibold text-ink dark:text-paper">ScanVerse</span>
        </Link>

        <div className="card p-8">
          {sent ? (
            <div>
              <h1 className="text-xl font-semibold text-ink dark:text-paper">Check your inbox</h1>
              <p className="mt-2 text-sm text-ink/60 dark:text-paper/60">{sent}</p>
              {resetToken && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs text-ink/50 dark:text-paper/50">
                    Development mode — use this reset link (it expires in 30 minutes):
                  </p>
                  <Link
                    to={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                    className="block break-all rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-medium text-brand hover:bg-brand/20"
                  >
                    Reset password →
                  </Link>
                </div>
              )}
              <Link to="/login" className="btn-secondary mt-6 w-full text-sm">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-ink dark:text-paper">Reset your password</h1>
              <p className="mt-1 text-sm text-ink/50 dark:text-paper/50">
                Enter your account email and we'll generate a reset link.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@example.com"
                    {...register("email", { required: "Email is required" })}
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                </div>

                {serverError && <p className="text-sm text-red-500">{serverError}</p>}

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                  {isSubmitting ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-ink/50 dark:text-paper/50">
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
