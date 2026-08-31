import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import Logo from "@/components/Logo";
import { resetPassword } from "@/api/client";

interface FormValues {
  password: string;
  confirm: string;
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await resetPassword(token, values.password);
      setDone(true);
    } catch (err: any) {
      setServerError(err?.response?.data?.detail || "Couldn't reset your password — try again.");
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-ink">
        <div className="card w-full max-w-sm p-8 text-center">
          <h1 className="text-xl font-semibold">Missing reset token</h1>
          <p className="mt-2 text-sm text-ink/60">This link is incomplete. Request a new one below.</p>
          <Link to="/forgot-password" className="btn-primary mt-6 w-full text-sm">
            Request a reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-ink">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo size={28} />
          <span className="font-display text-lg font-semibold text-ink dark:text-paper">ScanVerse</span>
        </Link>

        <div className="card p-8">
          {done ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold">Password updated</h1>
              <p className="mt-2 text-sm text-ink/60">You can now sign in with your new password.</p>
              <button onClick={() => navigate("/login")} className="btn-primary mt-6 w-full text-sm">
                Sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Choose a new password</h1>
              <p className="mt-1 text-sm text-ink/50">At least 8 characters, with letters and numbers.</p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">New password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    {...register("password", {
                      required: "Password is required",
                      minLength: { value: 8, message: "At least 8 characters" },
                      validate: {
                        letter: (v) => /[a-zA-Z]/.test(v) || "Must include at least one letter",
                        number: (v) => /[0-9]/.test(v) || "Must include at least one number",
                      },
                    })}
                  />
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    {...register("confirm", {
                      required: "Please confirm your password",
                      validate: (v) => v === watch("password") || "Passwords don't match",
                    })}
                  />
                  {errors.confirm && <p className="mt-1 text-xs text-red-500">{errors.confirm.message}</p>}
                </div>

                {serverError && <p className="text-sm text-red-500">{serverError}</p>}

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                  {isSubmitting ? "Updating…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
