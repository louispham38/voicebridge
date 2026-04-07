import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ plan: "free", status: "active" });
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", user.id)
      .single();

    if (!sub) {
      return NextResponse.json({ plan: "free", status: "active" });
    }

    return NextResponse.json(sub);
  } catch {
    return NextResponse.json({ plan: "free", status: "active" });
  }
}
