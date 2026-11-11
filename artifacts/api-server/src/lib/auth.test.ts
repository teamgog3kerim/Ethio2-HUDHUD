import assert from "node:assert/strict";
import test from "node:test";
import { makePasswordHash, usernameKey, validatePassword, verifyPassword } from "./auth";

test("account passwords are stored as salted scrypt hashes and compared safely", async () => {
  const password = "correct horse battery staple";
  const first = await makePasswordHash(password);
  const second = await makePasswordHash(password);
  assert.match(first, /^scrypt\$32768\$/);
  assert.notEqual(first, second, "each account password hash uses a fresh salt");
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
});

test("username matching is case-insensitive and passwords have bounded safe lengths", () => {
  assert.equal(usernameKey("  Learn_User "), "learn_user");
  assert.equal(validatePassword("123456"), true);
  assert.equal(validatePassword("12345"), false);
  assert.equal(validatePassword(`a${"\0"}23456`), false);
  assert.equal(validatePassword("x".repeat(129)), false);
});
