import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLinks } from "../src/assets/loader.js";

test("loadLinks resolves ok:true with parsed links on a successful response", async () => {
  const links = [{ alias: "docs", url: "https://example.com/docs" }];
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => links
  });
  const result = await loadLinks(fakeFetch, "links.json");
  assert.deepEqual(result, { ok: true, links });
});

test("loadLinks resolves ok:false with the HTTP status when the response is not ok", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 404,
    json: async () => {
      throw new Error("should not be called");
    }
  });
  const result = await loadLinks(fakeFetch, "links.json");
  assert.equal(result.ok, false);
  assert.match(result.message, /HTTP 404/);
});

test("loadLinks resolves ok:false when the fetch call itself rejects", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await loadLinks(fakeFetch, "links.json");
  assert.equal(result.ok, false);
  assert.match(result.message, /network down/);
});

test("loadLinks resolves ok:false when the response body fails to parse as JSON", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("Unexpected token < in JSON");
    }
  });
  const result = await loadLinks(fakeFetch, "links.json");
  assert.equal(result.ok, false);
  assert.match(result.message, /Unexpected token/);
});

test("loadLinks includes the requested url in the failure message", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error("should not be called");
    }
  });
  const result = await loadLinks(fakeFetch, "/custom/links.json");
  assert.match(result.message, /\/custom\/links\.json/);
});

test("loadLinks never rejects across any failure mode", async () => {
  await assert.doesNotReject(
    loadLinks(async () => {
      throw new Error("boom");
    }, "links.json")
  );
  await assert.doesNotReject(
    loadLinks(
      async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("should not be called");
        }
      }),
      "links.json"
    )
  );
});
