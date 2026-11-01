import type { Server } from "node:net";
import { Server as HttpsServer } from "node:https";
import Test from "supertest/lib/test.js";

// Supertest serves each request from `app.listen(0)`, which binds the dual-stack wildcard `[::]`,
// and then connects to 127.0.0.1. On macOS the OS may hand out a port that is free on `[::]` but
// already held on 127.0.0.1 by another local app (VS Code, chat clients, …); the request then
// reaches that app and comes back as a foreign 404 or "socket hang up". Lab 4 roughly doubled the
// requests per run, which made the collision show up in about one run in three. Connecting over the
// IPv6 loopback instead always reaches our own `[::]` listener: if another process held that port
// on IPv6, the bind would have failed. The bind itself is unchanged (it must stay synchronous —
// supertest reads `address()` right after `listen()`).
type Internal = { _server?: Server; serverAddress(app: Server, path: string): string };
(Test.prototype as unknown as Internal).serverAddress = function (this: Internal, app: Server, path: string) {
  if (!app.address()) this._server = app.listen(0);
  const { port } = app.address() as { port: number };
  return `${app instanceof HttpsServer ? "https" : "http"}://[::1]:${port}${path}`;
};
