import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { UserPlus } from "lucide-react";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

export default function Register() {
  const { register: signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: "", email: "", password: "", confirmPassword: "" } });

  const password = watch("password");

  async function onSubmit({ confirmPassword, ...values }) {
    setFormError("");
    try {
      const user = await signUp(values);
      toast.success(`Welcome to CheckWise, ${user.name.split(" ")[0]}.`);
      navigate("/dashboard", { replace: true });
    } catch (error) {
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
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Create your teacher account</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Start checking exams automatically. It takes less than a minute.
      </p>

      {formError && (
        <p role="alert" className="mt-5 rounded-lg border border-fail-100 bg-fail-50 p-3 text-sm text-fail-700">
          {formError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Maria Santos"
          error={errors.name?.message}
          {...register("name", {
            required: "Full name is required.",
            minLength: { value: 2, message: "Name must be at least 2 characters." },
          })}
        />

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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use at least 8 characters."
          error={errors.password?.message}
          {...register("password", {
            required: "Password is required.",
            minLength: { value: 8, message: "Password must be at least 8 characters." },
          })}
        />

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword", {
            required: "Please confirm your password.",
            validate: (value) => value === password || "Passwords do not match.",
          })}
        />

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {!isSubmitting && <UserPlus size={18} aria-hidden="true" />}
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
