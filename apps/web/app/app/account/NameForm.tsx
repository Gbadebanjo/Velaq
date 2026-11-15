"use client";

import { useActionState } from "react";
import { Field, FormMessage, Submit } from "../../_auth/fields";
import type { FormState } from "../../_auth/actions";
import { updateName } from "./actions";

/** Edit the name on the account. Shown on the account page. */
export function NameForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action] = useActionState(updateName, {} as FormState);
  return (
    <form action={action} noValidate className="name-form">
      <FormMessage message={state.message} notice={state.notice} />
      <div className="field-pair">
        <Field label="First name" name="firstName" autoComplete="given-name" required maxLength={80} defaultValue={state.values?.firstName ?? firstName} error={state.fields?.firstName} />
        <Field label="Last name" name="lastName" autoComplete="family-name" required maxLength={80} defaultValue={state.values?.lastName ?? lastName} error={state.fields?.lastName} />
      </div>
      <div><Submit pending="Saving…">Save name</Submit></div>
    </form>
  );
}
