import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase-server";

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

    let customerId = existing?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        plan: "free",
        status: "active",
      });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://web-nine-orpin-26.vercel.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${siteUrl}/dashboard?upgraded=true`,
      cancel_url: `${siteUrl}/dashboard`,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
