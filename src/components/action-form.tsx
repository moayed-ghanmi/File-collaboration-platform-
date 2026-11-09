"use client";

import { useActionState, useId, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "./ui";

export type ActionState = { error?: string; success?: string } | null;
export type FormAction = (state: ActionState, form: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the action's error/success message. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  /** Ask before submitting (destructive actions). */
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={confirm ? (e) => void (!window.confirm(confirm) && e.preventDefault()) : undefined}
    >
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant,
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** A role picker that submits its form as soon as the value changes. */
export function AutoSubmitSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const { pending } = useFormStatus();
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
