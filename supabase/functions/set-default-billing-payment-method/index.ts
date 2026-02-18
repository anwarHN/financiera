const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders, status: 200 });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 405
    });
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: "PayPal default payment method must be configured from PayPal."
    }),
    {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 400
    }
  );
});
