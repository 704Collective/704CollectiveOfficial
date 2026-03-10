import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // ── Admin auth check ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    // Allow service role (for cron/internal calls) or admin JWT
    if (token !== serviceRoleKey) {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", claimsData.claims.sub)
        .eq("role", "admin")
        .single();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get tasks assigned in the last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: tasks, error: tasksError } = await supabase
      .from("admin_tasks")
      .select("id, title, description, priority, due_date, assigned_to, status")
      .not("assigned_to", "is", null)
      .gte("assigned_at", twentyFourHoursAgo.toISOString())
      .neq("status", "blocked");

    if (tasksError) throw tasksError;

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ message: "No new task assignments in the last 24 hours" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group tasks by assignee
    const tasksByAssignee: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (!task.assigned_to) continue;
      if (!tasksByAssignee[task.assigned_to]) {
        tasksByAssignee[task.assigned_to] = [];
      }
      tasksByAssignee[task.assigned_to].push(task);
    }

    const assigneeIds = Object.keys(tasksByAssignee);
    if (assigneeIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No assignees to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get assignee profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", assigneeIds)
      .is("deleted_at", null);

    if (profilesError) throw profilesError;

    let emailsSent = 0;

    for (const profile of profiles || []) {
      const assignedTasks = tasksByAssignee[profile.id];
      if (!assignedTasks || assignedTasks.length === 0) continue;

      const firstName = profile.full_name?.split(" ")[0] || "there";

      const priorityEmoji: Record<string, string> = {
        urgent: "🔴",
        high: "🟠",
        medium: "🟡",
        low: "🟢",
      };

      const taskListHtml = assignedTasks
        .map((t) => {
          const emoji = priorityEmoji[t.priority || "medium"] || "🟡";
          const dueStr = t.due_date
            ? ` — Due: ${new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "";
          return `<li style="margin-bottom:8px;">${emoji} <strong>${t.title}</strong>${dueStr}</li>`;
        })
        .join("");

      const taskCount = assignedTasks.length;
      const subject =
        taskCount === 1
          ? `New task assigned: ${assignedTasks[0].title}`
          : `${taskCount} new tasks assigned to you`;

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333;">
          <h2 style="color:#000;">Hey ${firstName} 👋</h2>
          <p>You have <strong>${taskCount} new task${taskCount > 1 ? "s" : ""}</strong> assigned to you on 704 Collective:</p>
          <ul style="list-style:none;padding:0;">
            ${taskListHtml}
          </ul>
          <div style="margin-top:24px;">
            <a href="https://704collective.com/admin?section=tasks"
               style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
              View Task Board →
            </a>
          </div>
          <p style="margin-top:32px;font-size:13px;color:#888;">— 704 Collective</p>
        </div>
      `;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "704 Collective <hello@704collective.com>",
          to: [profile.email],
          subject,
          html,
        }),
      });

      if (emailRes.ok) {
        emailsSent++;
      } else {
        const errText = await emailRes.text();
        console.error(`Failed to send to ${profile.email}:`, errText);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Digest sent to ${emailsSent} admin(s)`,
        tasks_count: tasks.length,
        emails_sent: emailsSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Task digest error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
