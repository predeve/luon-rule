import { describe, expect, test } from "bun:test";

import { initial, r, rule, RuleError } from "../src/index.ts";

describe("Luon Rule", () => {
  test("provides one canonical object and a short alias", () => {
    expect(r).toBe(rule);
  });

  test("uses type initial values when input is missing", () => {
    const before = Date.now();
    expect(r.string().parse(undefined)).toBe("");
    expect(r.number().parse(undefined)).toBe(0);
    expect(r.password().parse(undefined)).toBe("");
    expect(r.boolean().parse(undefined)).toBeFalse();
    expect(r.array(r.string()).parse(undefined)).toEqual([]);
    expect(r.date().parse(undefined).getTime()).toBeGreaterThanOrEqual(before);
  });

  test("handles required, nullable and custom defaults", () => {
    expect(() => r.string().required().parse(undefined)).toThrow(RuleError);
    expect(r.string().nullable().parse(undefined)).toBeNull();
    expect(r.string().default("Luon").parse(undefined)).toBe("Luon");
  });

  test("parses common API formats", () => {
    const format = r.object({
      email: r.email(160).required(),
      page: r.int(1, 100).coerce(),
      role: r.enum(["admin", "user"]),
    });
    expect(format.parse({
      email: " USER@EXAMPLE.COM ",
      page: "2",
    })).toEqual({
      email: "user@example.com",
      page: 2,
      role: "admin",
    });
  });

  test("creates initial objects", () => {
    expect(initial({
      active: r.boolean(),
      name: r.string(),
      score: r.number(),
    })).toEqual({ active: false, name: "", score: 0 });
    expect(r.initial({ active: r.boolean(), name: r.string() }))
      .toEqual({ active: false, name: "" });
  });

  test("composes object formats and keeps declared passthrough values", () => {
    const base = r.object({
      disabled: r.boolean(),
      size: r.enum(["sm", "md", "lg"]),
    });
    const button = base.extend({
      label: r.string().optional(),
      value: r.any().optional(),
    }).passthrough();

    expect(button.parse({ extra: "kept", size: "lg", value: 7 }))
      .toEqual({
        disabled: false,
        extra: "kept",
        size: "lg",
        value: 7,
      });
    expect(() => button.parse({ size: "xl" })).toThrow("allowed value");
  });

  test("creates and validates UUID values", () => {
    const value = r.uuid().parse(undefined);

    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(r.uuid().parse(value)).toBe(value);
    expect(() => r.uuid().parse("not-a-uuid")).toThrow("Expected a UUID");
  });

  test("defines an automatic ID sequence start", () => {
    expect(r.id().start).toBe(1);
    expect(r.id(10_000).start).toBe(10_000);
    expect(r.id(10_000).parse(undefined)).toBe(0n);
    expect(() => r.id(0)).toThrow("positive safe integer");
    expect(() => r.id(1.5)).toThrow("positive safe integer");
  });

  test("keeps database modifiers concise", () => {
    const fields = {
      body: r.string(1_000).db("Text"),
      id: r.uuid().id(),
      rank: r.int().index(),
      updatedAt: r.date().updated(),
    };

    expect(Object.keys(fields)).toEqual(["body", "id", "rank", "updatedAt"]);
  });
});
