import { supabase } from "@/lib/supabase";

// Connect GitHub for repo access via Supabase's GitHub provider. We LINK it to
// the user's existing (magic-link) account rather than using it as the login,
// and request the `repo` scope so import/commit/push work. After the redirect,
// the GitHub access token arrives as session.provider_token and is captured in
// authStore → githubStore (so the existing repo API keeps working unchanged).
export async function connectGithubOAuth(): Promise<{ error?: string }> {
  if (!supabase) return { error: "Sign in first to connect GitHub." };
  const options = {
    scopes: "repo",
    redirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined,
  };
  // The identity link lives at the account level, but the provider_token (the
  // actual GitHub access token) isn't persisted across origins/devices. If GitHub
  // is already linked (e.g. linked on another domain), linkIdentity fails with
  // `identity_already_exists` — so re-authenticate via OAuth to mint a fresh
  // provider_token instead of trying to link again.
  let linked = false;
  try {
    const { data } = await supabase.auth.getUser();
    linked = !!data.user?.identities?.some((i) => i.provider === "github");
  } catch { /* assume not linked → linkIdentity */ }

  const { error } = linked
    ? await supabase.auth.signInWithOAuth({ provider: "github", options })
    : await supabase.auth.linkIdentity({ provider: "github", options });
  // On success the browser redirects to GitHub; control doesn't return here.
  return { error: error?.message };
}
