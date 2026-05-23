filepath = r"C:\Users\adamk\704collective\supabase\functions\approve-business-application\index.ts"
with open(filepath, "r", encoding="utf-8-sig") as f:
    c = f.read()

old = """    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;"""

new = """    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authorization: super_admin only - this function charges cards
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authedUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authedUser?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: authedProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authedUser.id)
      .maybeSingle();
    if (!authedProfile || authedProfile.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;"""

if old not in c:
    print("OLD STRING NOT FOUND")
    exit(1)

c = c.replace(old, new, 1)

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(c)

with open(filepath, "rb") as f:
    first4 = list(f.read(4))
lines = c.split("\n")
print(f"Saved. First 4 bytes: {first4}. Lines: {len(lines)}")

# Spot-check
for i, line in enumerate(lines):
    if any(kw in line for kw in ["Authorization: super_admin", "authHeader", "authedUser", "authedProfile", "super_admin required", "Missing authorization", "Invalid token", "STRIPE_SECRET_KEY"]):
        print(f"  {i+1}|{line.rstrip()}")
