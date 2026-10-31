import { describe, expect, it } from "vitest";
import { validateEmail, validateName, validatePassword } from "./validation";

describe("email validation", () => {
  it.each([
    "driver@example.com",
    "  alice+parking@sub.example.co.uk  ",
    "o'brien@example.com",
  ])("accepts a usable address: %s", (value) =>
    expect(validateEmail(value)).toBeNull(),
  );
  it.each([
    "",
    "   ",
    "driver",
    "driver@",
    "@example.com",
    "a@@example.com",
    "a b@example.com",
    "a@-bad.com",
    ".a@example.com",
    "a..b@example.com",
    "a@example..com",
    `${"a".repeat(65)}@example.com`,
  ])("rejects an invalid address: %s", (value) =>
    expect(validateEmail(value)).toEqual(expect.any(String)),
  );
});

describe("password validation", () => {
  it("enforces the minimum at the exact boundary", () => {
    expect(validatePassword("seven77")).toEqual(expect.any(String));
    expect(validatePassword("eight888")).toBeNull();
  });
  it("permits long passphrases and preserves meaningful whitespace", () => {
    expect(validatePassword("four words make a passphrase")).toBeNull();
    expect(validatePassword(" word123 ")).toBeNull();
  });
  it.each(["", "        "])(
    "rejects an empty or all-space password",
    (value) => {
      expect(validatePassword(value)).toEqual(expect.any(String));
    },
  );
});

describe("name validation", () => {
  it.each(["  Ana  ", "李小明", "Jean-Luc", "Mary O’Connor"])(
    "accepts real-world names without forcing a Western name format: %s",
    (value) => expect(validateName(value)).toBeNull(),
  );
  it.each(["", "  ", "A", "a".repeat(81), "Jane\nDoe", "Jane\u0000Doe"])(
    "rejects missing, oversized, or control-character names",
    (value) => expect(validateName(value)).toEqual(expect.any(String)),
  );
});
