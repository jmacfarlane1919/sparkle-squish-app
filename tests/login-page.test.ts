import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoginPage from "@/app/login/page";
import { LoginScreen } from "@/components/login-screen";

const leakedEmail = "postgres://leak-user:leak-pass@db.example/shop";
const leakedPassword = "not-the-demo-password";

function markup(props: { needsSetup: boolean; error?: string }) {
  return renderToStaticMarkup(createElement(LoginScreen, { ...props, next: "/", demoHint: false }));
}

describe("public login page", () => {
  it("starts with an empty email and does not render env values", () => {
    const previousEmail = process.env.OWNER_EMAIL;
    const previousPassword = process.env.OWNER_PASSWORD;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.OWNER_EMAIL = leakedEmail;
    process.env.OWNER_PASSWORD = leakedPassword;
    process.env.DATABASE_URL = leakedEmail;
    try {
      const page = markup({ needsSetup: false });
      expect(page).toContain('name="email"');
      expect(page).toContain('name="password"');
      expect(page).not.toMatch(/name="email"[^>]*value=/);
      expect(page).not.toMatch(/name="password"[^>]*value=/);
      expect(page).not.toContain(leakedEmail);
      expect(page).not.toContain("leak-pass");
      expect(page).not.toContain(leakedPassword);
      expect(page).not.toContain("postgres://");
      expect(page).not.toContain("OWNER_EMAIL");
      expect(page).not.toContain("DATABASE_URL");
    } finally {
      process.env.OWNER_EMAIL = previousEmail;
      process.env.OWNER_PASSWORD = previousPassword;
      process.env.DATABASE_URL = previousDatabase;
    }
  });

  it("does not copy owner env values into the page the public route renders", async () => {
    const previousEmail = process.env.OWNER_EMAIL;
    const previousPassword = process.env.OWNER_PASSWORD;
    process.env.OWNER_EMAIL = leakedEmail;
    process.env.OWNER_PASSWORD = leakedPassword;
    try {
      const page = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
      expect(page).not.toContain(leakedEmail);
      expect(page).not.toContain(leakedPassword);
      expect(page).not.toContain("postgres://");
      expect(page).not.toMatch(/name="email"[^>]*value=/);
    } finally {
      process.env.OWNER_EMAIL = previousEmail;
      process.env.OWNER_PASSWORD = previousPassword;
    }
  });

  it("does not put a secret into the first-run form either", () => {
    const page = markup({ needsSetup: true });
    expect(page).not.toMatch(/name="email"[^>]*value=/);
    expect(page).not.toContain("postgres://");
    expect(page).toContain("Save and sign in");
  });
});
