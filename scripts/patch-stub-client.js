/* eslint-disable @typescript-eslint/no-require-imports -- plain node helper, runs outside the TS pipeline */
/**
 * SANDBOX-ONLY helper (not used by the real build pipeline — Vercel runs
 * `prisma generate` via postinstall): writes a runtime stub into
 * node_modules/.prisma/client so `new PrismaClient()` constructs and the
 * offline `next build` typecheck/prerender graph can load every module.
 * No real queries are possible through it; every model delegate throws a
 * clear error if touched at build time (all DB pages are force-dynamic,
 * so nothing should be).
 */
const fs = require("fs");
const path = require("path");
const dir = path.join(process.cwd(), "node_modules", ".prisma", "client");
fs.mkdirSync(dir, { recursive: true });

const indexJs = `'use strict';
const throwing = (name) => new Proxy({}, {
  get(_, prop) {
    if (prop === 'then') return undefined;
    return () => { throw new Error('sandbox stub: ' + name + '.' + String(prop) + ' is not runnable at build time'); };
  },
});
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (typeof prop === 'string') return throwing(prop);
        return undefined;
      },
    });
  }
  $connect() { return Promise.resolve(); }
  $disconnect() { return Promise.resolve(); }
  $on() {}
  $transaction(fn) { return Promise.resolve(typeof fn === 'function' ? fn(this) : fn); }
  $queryRaw() { return Promise.resolve([]); }
  $executeRaw() { return Promise.resolve(0); }
}
module.exports = { PrismaClient, Prisma: PrismaClient, __dirname: '', dirname: '' };
`;
fs.writeFileSync(path.join(dir, "index.js"), indexJs);
fs.writeFileSync(path.join(dir, "default.js"), "module.exports = require('./index.js');\n");
fs.writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify({ name: ".prisma/client", version: "0.0.0-sandbox", main: "index.js" }, null, 2) + "\n"
);
console.log("stub written to node_modules/.prisma/client");
