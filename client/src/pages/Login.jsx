import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { LogIn } from "lucide-react";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: "", password: "" } });

  const redirectTo = location.state?.from?.pathname || "/dashboard";

  async function onSubmit(values) {
    setFormError("");
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}.`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // Map server field errors onto the form; otherwise show a banner.
      if (error.errors) {
        Object.entries(error.errors).forEach(([field, message]) =>
          setError(field, { type: "server", message })
        );
      } else {
        setFormError(error.message);
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Sign in to CheckWise</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Enter your credentials to reach your exams and results.
      </p>

      {formError && (
        <p role="alert" className="mt-5 rounded-lg border border-fail-100 bg-fail-50 p-3 text-sm text-fail-700">
          {formError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="teacher@school.edu"
          error={errors.email?.message}
          {...register("email", {
            required: "Email is required.",
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: "Enter a valid email address." },
          })}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          {...register("password", { required: "Password is required." })}
        />

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {!isSubmitting && <LogIn size={18} aria-hidden="true" />}
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-600">
        New to CheckWise?{" "}
        <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Create a teacher account
        </Link>
      </p>
    </div>
  );
}
