import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";
import { translations } from "../src/i18n/translations.js";

const require = createRequire(import.meta.url);
const compiled = transformSync(readFileSync(new URL("../src/pages/AccountIntegrationsPage.jsx", import.meta.url), "utf8"), {
  loader: "jsx", format: "cjs", jsx: "automatic",
});

function render({ state = null, busy = false, loading = false, owner = true, error = "" } = {}) {
  let hook = 0;
  const values = [state, busy, loading, error];
  const mockedRequire = (name) => {
    const moduleName = name.split("/").at(-1);
    if (name === "react") return { ...React, useState(initial) {
      const index = hook++;
      return React.useState(index < values.length ? values[index] : initial);
    } };
    if (moduleName === "TextField") return { __esModule: true, default: () => null };
    if (moduleName === "AuthContext") return { useAuth: () => ({ account: { accountId: 8, isOriginalAccount: owner },
      user: { email: "owner@example.test" }, hasModulePermission: () => false }) };
    if (moduleName === "I18nContext") return { useI18n: () => ({ t: (key) => key.split(".").reduce((value, part) => value?.[part], translations.es) || key }) };
    if (moduleName === "imprentService") return { callImprent: () => { throw new Error("Network must not be used in rendering tests"); } };
    return require(name);
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.code)(mockedRequire, module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.default));
}

const activationButton = (html) => html.match(/<button\b[^>]*>Activar Imprent<\/button>/)?.[0];

test("owner sees enabled activation even when initial status fails", () => {
  const html = render({ error: "Function not found" });
  assert.ok(activationButton(html));
  assert.doesNotMatch(activationButton(html), /disabled/);
  assert.match(html, /Function not found/);
  assert.match(html, /No se pudo consultar el estado/);
  assert.match(html, /Reintentar/);
  assert.doesNotMatch(html, /Integracion inactiva o pendiente/);
});

test("activation stays visible while loading and obeys active/busy state", () => {
  assert.match(activationButton(render({ loading: true })), /disabled/);
  const active = { isActive: true, settings: {}, templates: [] };
  assert.match(activationButton(render({ state: active })), /disabled/);
  assert.doesNotMatch(activationButton(render({ state: { ...active, isActive: false } })), /disabled/);
  assert.match(render({ busy: true }), /<button[^>]*disabled=""[^>]*>Cargando/);
});

test("non-owner cannot see activation controls", () => {
  const html = render({ owner: false });
  assert.equal(activationButton(html), undefined);
  assert.match(html, /Solo el propietario/);
});
