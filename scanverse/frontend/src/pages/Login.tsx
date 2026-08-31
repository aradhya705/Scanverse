import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

interface FormValues {
  email: string;
  password: string;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate("/dashboard");
    } catch (err: any) {
      setServerError(err?.response?.data?.detail || "Incorrect email or password.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo size={28} />
          <span className="font-display text-lg font-semibold">ScanVerse</span>
        </Link>

        <div className="card p-8">
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-ink/50">Sign in to keep scanning.</p>

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
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium">Password</label>
                <Link to="/forgot-password" className="text-xs text-brand hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                {...register("password", { required: "Password is required" })}
              />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {serverError && <p className="text-sm text-red-500">{serverError}</p>}

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-ink/50">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
