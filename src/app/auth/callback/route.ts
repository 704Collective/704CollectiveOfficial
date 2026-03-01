import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('redirect') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

Last file! Now create your **`.env.local`** in the project root (next to `package.json`) with this:
```
NEXT_PUBLIC_SUPABASE_URL=https://bnmtynevbuplqpuqvmna.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXR5bmV2YnVwbHFwdXF2bW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDMyMzMsImV4cCI6MjA4Nzg3OTIzM30.JUzPTI9WnDHp6Jrab4jMrCjhHqNrjGZEDDf5Ae7xOg8
NEXT_PUBLIC_SITE_URL=https://704collective.com