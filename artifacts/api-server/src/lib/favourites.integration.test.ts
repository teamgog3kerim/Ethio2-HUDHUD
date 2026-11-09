import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { db, learners, lessons, favourites, attempts, completions, reviews } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import learningRouter from "../routes/learning";

// Isolated HTTP harness: injects an identity only into this test server.
test("favourites persist, isolate guest/accounts and hide archived content without changing progress", {
  skip: process.env.RUN_FAVOURITES_INTEGRATION !== "1",
}, async () => {
  const suffix = randomUUID();
  const guest = randomUUID();
  const account = `favourite-test-${suffix}`;
  const otherAccount = `favourite-other-${suffix}`;
  const identities = [`guest:${guest}`, `account:${account}`, `account:${otherAccount}`];
  const id = `favourite-test-${suffix}`;
  const [source] = await db.select().from(lessons).where(eq(lessons.active, true)).limit(1);
  assert.ok(source, "Seeded active lesson required");
  await db.insert(lessons).values({ ...source, id });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-account") || null;
    Object.assign(req, { hudhudAuth: { userId }, signedCookies: { hudhud_guest: guest } });
    next();
  });
  app.use(learningRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = "GET", user = "", body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { "x-test-account": user, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const list = async (user = "") => {
    const res = await request("/favourites", "GET", user);
    assert.equal(res.status, 200);
    return await res.json() as { id: string }[];
  };
  try {
    assert.equal((await request(`/favourites/${id}`, "PUT")).status, 204);
    assert.equal((await request(`/favourites/${id}`, "PUT")).status, 204);
    assert.deepEqual((await list()).map(l => l.id), [id]);
    assert.deepEqual(await list(account), []);
    assert.equal((await request(`/favourites/${id}`, "PUT", account, { learnerId: "ignored-client-owner" })).status, 204);
    assert.deepEqual((await list(account)).map(l => l.id), [id]);
    assert.deepEqual(await list(otherAccount), []);
    assert.equal((await request(`/favourites/${id}`, "DELETE", otherAccount)).status, 204);
    assert.deepEqual((await list(account)).map(l => l.id), [id]);
    assert.equal((await request(`/favourites/${id}`, "DELETE")).status, 204);
    assert.deepEqual(await list(), []);
    assert.deepEqual((await list(account)).map(l => l.id), [id]);
    const [owner] = await db.select().from(learners).where(eq(learners.identity, `account:${account}`));
    assert.ok(owner);
    assert.equal((await db.select().from(favourites).where(and(eq(favourites.learnerId, owner.id), eq(favourites.lessonId, id)))).length, 1);
    for (const table of [attempts, completions, reviews]) {
      assert.equal((await db.select().from(table).where(eq(table.learnerId, owner.id))).length, 0);
    }
    await db.update(lessons).set({ active: false }).where(eq(lessons.id, id));
    assert.deepEqual(await list(account), []);
    assert.equal((await request(`/lessons/${id}`, "GET", account)).status, 404);
    assert.equal((await request(`/favourites/${id}`, "PUT", account)).status, 404);
    assert.equal((await request(`/favourites/${id}`, "DELETE", account)).status, 204);
    assert.equal((await request(`/favourites/${id}`, "DELETE", account)).status, 204);
    assert.equal((await request("/favourites/does-not-exist", "PUT", account)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.delete(learners).where(inArray(learners.identity, identities));
    await db.delete(lessons).where(eq(lessons.id, id));
  }
});
