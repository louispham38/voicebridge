import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
  try {
    const stripe = getStripe();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!existing?.stripe_customer_id) {
      return NextResponse.json({ plan: "free", status: "active" });
    }

    const subs = await stripe.subscriptions.list({
      customer: existing.stripe_customer_id,
      status: "active",
      limit: 1,
    });

    const admin = getSupabaseAdmin();

    if (subs.data.length > 0) {
      const sub = subs.data[0];
      await admin
        .from("subscriptions")
        .update({
          stripe_subscription_id: sub.id,
          plan: "pro",
          status: "active",
          current_period_end: new Date(
            sub.current_period_end * 1000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return NextResponse.json({
        plan: "pro",
        status: "active",
        current_period_end: new Date(
          sub.current_period_end * 1000
        ).toISOString(),
      });
    }

    await admin
      .from("subscriptions")
      .update({
        plan: "free",
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({ plan: "free", status: "active" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
