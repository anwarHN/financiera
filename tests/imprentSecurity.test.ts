import assert from "node:assert/strict";
import { authorizePrinting, imprentJson, imprentRequest, PrintError, printErrorResponse } from "../supabase/functions/_shared/imprent.ts";

function client({ owner = "owner", member = true, profileAccount = 8, canRead = true, admin = false, tokenValid = true } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: tokenValid ? { id: "user" } : null }, error: null }) },
    from(table: string) {
      const query = {
        select() { return query; }, eq() { return query; },
        single: async () => ({ data: table === "accounts" ? { id: 8, createdById: owner } :
          { account_profiles: { accountId: profileAccount, isSystemAdmin: admin, permissions: { sales: { read: canRead } } } }, error: null }),
        maybeSingle: async () => ({ data: member ? { userId: "user" } : null, error: null }),
      };
      return query;
    },
  };
}

Deno.test("print access requires membership and sales permission; integration management requires owner", async () => {
  const req = new Request("https://app.test", { headers: { Authorization: "Bearer user-token" } });
  await authorizePrinting(client(), req, 8);
  await assert.rejects(authorizePrinting(client({ member: false }), req, 8), /Sin acceso/);
  await assert.rejects(authorizePrinting(client({ canRead: false }), req, 8), /Sin permiso/);
  await assert.rejects(authorizePrinting(client({ profileAccount: 9 }), req, 8), /Sin permiso/);
  await assert.rejects(authorizePrinting(client({ tokenValid: false }), req, 8), /Sesion invalida/);
  await assert.rejects(authorizePrinting(client({ admin: true }), req, 8, true), /Solo el propietario/);
  await authorizePrinting(client({ owner: "user" }), req, 8, true);
  await assert.rejects(authorizePrinting(client(), new Request("https://app.test"), 8), /Sesion requerida/);
});

Deno.test("provider transport pins server origin, disallows redirects and sanitizes upstream errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = Deno.env.get("IMPRENT_BASE_URL");
  Deno.env.set("IMPRENT_BASE_URL", "https://provider.test");
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://provider.test/api/v1/doc-generator");
      const options = init as RequestInit;
      assert.equal(options.redirect, "error");
      assert.equal(new Headers(options.headers).get("X-API-Key"), "secret");
      return Response.json({ data: { finalFile: "invoice.pdf" } });
    };
    assert.deepEqual(await imprentJson("doc-generator", {}, "secret"), { finalFile: "invoice.pdf" });
    globalThis.fetch = async () => new Response("secret-key / upstream internals", { status: 401 });
    await assert.rejects(imprentRequest("doc-generator", {}, "secret"), (err: Error) =>
      err instanceof PrintError && !err.message.includes("secret") && err.status === 502);
    assert.equal((await printErrorResponse(new Error("database secret")).json()).error.includes("secret"), false);
    Deno.env.set("IMPRENT_BASE_URL", "http://provider.test");
    await assert.rejects(imprentRequest("doc-generator"), /HTTPS/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl) Deno.env.set("IMPRENT_BASE_URL", originalUrl); else Deno.env.delete("IMPRENT_BASE_URL");
  }
});
