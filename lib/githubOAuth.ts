import { supabase } from "@/lib/supabase";

// Connect GitHub for repo access via Supabase's GitHub provider. We LINK it to
// the user's existing (magic-link) account rather than using it as the login,
// and request the `repo` scope so import/commit/push work. After the redirect,
// the GitHub access token arrives as session.provider_token and is captured in
// authStore → githubStore (so the existing repo API keeps working unchanged).
export async function connectGithubOAuth(): Promise<{ error?: string }> {
  if (!supabase) return { error: "Sign in first to connect GitHub." };
  const { error } = await supabase.auth.linkIdentity({
    provider: "github",
    options: {
      scopes: "repo",
      redirectTo: typeof window !== "undefined" ? window.location.href : undefined,
    },
  });
  // On success the browser redirects to GitHub; control doesn't return here.
  return { error: error?.message };
}
