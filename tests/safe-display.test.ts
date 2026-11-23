import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Shown } from "@/components/bits";
import { maskForDisplay } from "@/lib/safe-display";

const neon = "postgresql://neondb_owner:secret@ep-example-pooler.neon.tech/neondb?sslmode=require";

describe("connection strings stay off the screen", () => {
  it("names the Shopify store setting when that value is a database address", () => {
    const shown = maskForDisplay(neon, "SHOPIFY_STORE_DOMAIN");
    expect(shown.text).not.toContain("postgresql://");
    expect(shown.text).not.toContain("neondb_owner");
    expect(shown.text).not.toContain("secret");
    expect(shown.warning).toBe("This setting looks like a database address, check the SHOPIFY_STORE_DOMAIN setting in Vercel");
  });

  it("leaves a normal shop domain alone", () => {
    expect(maskForDisplay("mw4ti4-tj.myshopify.com", "SHOPIFY_STORE_DOMAIN")).toEqual({
      text: "mw4ti4-tj.myshopify.com",
      warning: null,
    });
  });

  it("does not print the address when the shop line is rendered", () => {
    const html = renderToStaticMarkup(
      createElement("p", null, "Sparkle & Squish · ", createElement(Shown, { value: neon, setting: "SHOPIFY_STORE_DOMAIN" }), "Shopify not connected yet."),
    );
    expect(html).toContain("Shopify not connected yet.");
    expect(html).toContain("check the SHOPIFY_STORE_DOMAIN setting in Vercel");
    expect(html).not.toContain("postgresql://");
    expect(html).not.toContain("neondb_owner");
    expect(html).not.toContain("Demo mode");
  });
});
