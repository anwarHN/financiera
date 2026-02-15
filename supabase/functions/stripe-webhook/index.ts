import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type StripeSubscription = {
  id: string;
  status: string;
  customer: string;
  items?: { data: Array<{ price?: { id?: string } }> };
  current_period_end?: number;
};

async function logBillingEvent(supabaseAdmin: ReturnType<typeof createClient>, args: { accountId?: number | null; eventType: string; stripeEventId?: string; payload: unknown }) {
  await supabaseAdmin.from("account_billing_events").insert({
    accountId: args.accountId ?? null,
    eventType: args.eventType,
    stripeEventId: args.stripeEventId ?? null,
    payload: args.payload
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { headers: corsHeaders, status: 405 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripeWebhookSecret) {
      return new Response("Missing secrets", { headers: corsHeaders, status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature", { headers: corsHeaders, status: 400 });
    }

    const body = await req.text();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
    const event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { subscription?: string; customer?: string; client_reference_id?: string };
      const accountId = Number(session.client_reference_id || 0) || null;

      if (session.subscription && session.customer && accountId) {
        const subscription = (await stripe.subscriptions.retrieve(session.subscription)) as unknown as StripeSubscription;
        const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;

        await supabaseAdmin
          .from("accounts")
          .update({
            stripeCustomerId: String(session.customer),
            stripeSubscriptionId: subscription.id,
            subscriptionPriceId: priceId,
            billingStatus: subscription.status,
            subscriptionCurrentPeriodEnd: periodEnd
          })
          .eq("id", accountId);
      }

      await logBillingEvent(supabaseAdmin, {
        accountId,
        eventType: event.type,
        stripeEventId: event.id,
        payload: event
      });
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as unknown as StripeSubscription;
      const customerId = String(subscription.customer);
      const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
      const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;

      const { data: account } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("stripeCustomerId", customerId)
        .maybeSingle();

      const accountId = account?.id ?? null;
      if (accountId) {
        await supabaseAdmin
          .from("accounts")
          .update({
            stripeSubscriptionId: subscription.id,
            subscriptionPriceId: priceId,
            billingStatus: subscription.status,
            subscriptionCurrentPeriodEnd: periodEnd
          })
          .eq("id", accountId);
      }

      await logBillingEvent(supabaseAdmin, {
        accountId,
        eventType: event.type,
        stripeEventId: event.id,
        payload: event
      });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as { customer?: string };
      const customerId = String(invoice.customer || "");
      const { data: account } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("stripeCustomerId", customerId)
        .maybeSingle();
      const accountId = account?.id ?? null;

      if (accountId) {
        await supabaseAdmin.from("accounts").update({ billingStatus: "past_due" }).eq("id", accountId);
      }

      await logBillingEvent(supabaseAdmin, {
        accountId,
        eventType: event.type,
        stripeEventId: event.id,
        payload: event
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 200
    });
  } catch (error) {
    return new Response(`Webhook Error: ${String(error)}`, {
      headers: corsHeaders,
      status: 400
    });
  }
});
