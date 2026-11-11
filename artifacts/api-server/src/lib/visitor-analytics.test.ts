import test from "node:test";
import assert from "node:assert/strict";
import { classifyVisitorAudience, classifyVisitorBrowser, classifyVisitorDevice, normalizeVisitorCountry } from "./visitor-analytics";

test("visitor audience is classified by authenticated role without storing identity", () => {
  assert.equal(classifyVisitorAudience("owner"), "admin");
  assert.equal(classifyVisitorAudience("admin"), "admin");
  assert.equal(classifyVisitorAudience("learner"), "learner");
  assert.equal(classifyVisitorAudience(null), "visitor");
  assert.equal(classifyVisitorAudience(undefined), "visitor");
});

test("visitor country accepts only a normalized two-letter proxy country code", () => {
  assert.equal(normalizeVisitorCountry(" us "), "US");
  assert.equal(normalizeVisitorCountry("ET"), "ET");
  assert.equal(normalizeVisitorCountry(undefined), "XX");
  assert.equal(normalizeVisitorCountry("USA"), "XX");
  assert.equal(normalizeVisitorCountry("1=1"), "XX");
  assert.equal(normalizeVisitorCountry("XX"), "XX");
});

test("visitor device classification stores only broad device categories", () => {
  assert.equal(classifyVisitorDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari/604.1"), "mobile");
  assert.equal(classifyVisitorDevice("Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36"), "mobile");
  assert.equal(classifyVisitorDevice("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/123.0"), "desktop");
  assert.equal(classifyVisitorDevice(undefined), "unknown");
});

test("visitor browser classification excludes full user agent strings", () => {
  assert.equal(classifyVisitorBrowser("Mozilla/5.0 Chrome/122.0 Safari/537.36"), "chrome");
  assert.equal(classifyVisitorBrowser("Mozilla/5.0 Edg/122.0 Chrome/122.0"), "edge");
  assert.equal(classifyVisitorBrowser("Mozilla/5.0 Version/17.0 Safari/605.1"), "safari");
  assert.equal(classifyVisitorBrowser(undefined), "other");
});
