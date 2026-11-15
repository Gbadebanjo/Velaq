import { redirect } from "next/navigation";
import { callName, currentUser, fullName } from "../../lib/session";
import { PLAN_NAME, getSpace, personalFeatures } from "../../lib/space";
import { Shell } from "./_shell/Shell";

export const dynamic = "force-dynamic";

/** Up to two letters for the avatar: first and last initials, else the first letter of what we call them. */
function initialsOf(first: string | null, last: string | null, fallback: string): string {
  const letter = (s: string | null) => (s ? Array.from(s.trim())[0]?.toLocaleUpperCase() ?? "" : "");
  return letter(first) + letter(last) || letter(fallback) || "?";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/app");
  const data = await getSpace();
  return (
    <Shell
      email={user.email}
      name={fullName(user)}
      initials={initialsOf(user.firstName, user.lastName, callName(user))}
      planName={PLAN_NAME[data?.space.plan ?? "free"]} groups={personalFeatures(data)}>
      {children}
    </Shell>
  );
}
