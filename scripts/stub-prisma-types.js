/* eslint-disable @typescript-eslint/no-require-imports -- plain node helper, runs outside the TS pipeline */
/**
 * SANDBOX-ONLY (pairs with patch-stub-client.js): any-typed TypeScript stub
 * for @prisma/client so tsc can run OFFLINE (prisma engines can't be
 * downloaded in this sandbox). Vercel's real `postinstall: prisma generate`
 * produces the genuine typed client — the real codegen check happens there.
 * A fresh `npm i` overwrites the stub; re-run this script after that.
 */
const fs = require("fs");
const path = require("path");
const clientDir = path.join(process.cwd(), "node_modules", "@prisma", "client");
fs.writeFileSync(
  path.join(clientDir, "index.d.ts"),
  `// SANDBOX any-typed stub — see scripts/stub-prisma-types.js
export declare class PrismaClient {
  constructor(options?: any);
  [model: string]: any;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $on(event: string, cb: (event: any) => void): void;
  $transaction(fn: any): Promise<any>;
  $queryRaw<T = any>(...args: any[]): Promise<T>;
  $queryRawUnsafe<T = any>(...args: any[]): Promise<T>;
  $executeRaw(...args: any[]): Promise<number>;
  $executeRawUnsafe(...args: any[]): Promise<number>;
}
export declare namespace Prisma {
  type InputJsonValue = any;
  type InputJsonObject = any;
  type InputJsonArray = any;
  type NullableJsonNullValueInput = any;
  type JsonValue = any;
  type JsonObject = any;
  type PrismaClientOptions = any;
  const DbNull: any;
  const JsonNull: any;
  const AnyNull: any;
}
export default PrismaClient;
`
);
fs.writeFileSync(
  path.join(clientDir, "index.js"),
  `// SANDBOX runtime stub — real queries are impossible here by design
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (typeof prop === "string") {
          return new Proxy(
            {},
            {
              get: () => () => {
                throw new Error("sandbox stub: " + prop + "." + String(prop) + " is not runnable offline");
              },
            }
          );
        }
        return undefined;
      },
    });
  }
  $connect() { return Promise.resolve(); }
  $disconnect() { return Promise.resolve(); }
  $on() {}
  $transaction(fn) { return Promise.resolve(typeof fn === "function" ? fn(this) : fn); }
  $queryRaw() { return Promise.resolve([]); }
  $queryRawUnsafe() { return Promise.resolve([]); }
  $executeRaw() { return Promise.resolve(0); }
}
module.exports = {
  PrismaClient,
  // sentinel values mirroring the real enums — irrelevant at runtime here (no query ever runs)
  Prisma: { DbNull: { toJSON: () => null }, JsonNull: { toJSON: () => null }, AnyNull: { toJSON: () => null } },
  default: PrismaClient,
};
`
);
// The package's "." export resolves via default.d.ts / default.js (see its
// exports map) — point those at the stubs above.
fs.writeFileSync(path.join(clientDir, "default.d.ts"), 'export * from "./index";\n');
fs.writeFileSync(
  path.join(clientDir, "default.js"),
  `module.exports = {\n  ...require("./index.js"),\n  PrismaClient: require("./index.js").PrismaClient,\n};\n`
);
console.log("prisma type+runtime stub restored (incl. . default entry)");
