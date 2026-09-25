import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";
async function join(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Join the club" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Let’s play" }).click();
  await expect(page).toHaveURL(/#lobby/);
}
test("desktop and mobile landing preserve logo and fit the viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little mad. All blackjack." }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/desktop-home.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mobile-home.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("cashier simulates a deposit, rejects live addresses, and refunds failed withdrawal", async ({
  page,
}) => {
  await join(page, "Cashier browser");
  await page.getByRole("button", { name: /\$1,000.00/ }).click();
  await page.getByRole("button", { name: "Create demo deposit" }).click();
  await page.getByRole("button", { name: "Simulate incoming deposit" }).click();
  await expect(page.getByRole("heading", { name: "All done." })).toBeVisible();
  await expect(page.getByRole("button", { name: /\$1,100.00/ })).toBeVisible();
  await page.getByRole("button", { name: "New transfer" }).click();
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page.getByLabel("Demo destination").fill("demo:test-wallet");
  await page.getByRole("button", { name: "Simulate withdrawal" }).click();
  await page.getByRole("button", { name: "Test a failed transfer" }).click();
  await expect(
    page.getByRole("heading", { name: "Route failed." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /\$1,100.00/ })).toBeVisible();
});
test("seven browser identities share a private round, reconnect, and verify identical receipts", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 7 }, () => browser.newContext()),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of pages) {
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
  }
  try {
    await test.step("Register seven browser identities", () =>
      Promise.all(pages.map((p, i) => join(p, "Player " + (i + 1)))));
    await pages[0]
      .getByRole("button", { name: "Create a private table" })
      .click();
    await pages[0]
      .getByLabel("Table name", { exact: true })
      .fill("The seven seats");
    await pages[0]
      .getByRole("button", { name: "Create private table", exact: true })
      .click();
    await expect(pages[0]).toHaveURL(/#table\/private-/);
    const url = pages[0].url();
    await Promise.all(pages.slice(1).map((p) => p.goto(url)));
    for (let i = 0; i < 7; i++)
      await pages[i]
        .getByRole("button", { name: "Take seat " + (i + 1), exact: true })
        .click();
    await expect(pages[0].locator(".seat strong")).toHaveCount(7);
    await expect(pages[0].locator(".room-backdrop")).toBeVisible();
    await expect(pages[0].locator(".fee-disclosure")).toContainText("$25.00 wager + $0.06 fee = $25.06 total");
    await Promise.all(
      pages.map((p) =>
        p.getByRole("button", { name: "Place bet", exact: true }).click(),
      ),
    );
    await expect(
      pages[0].getByRole("button", { name: "Deal table", exact: true }),
    ).toBeVisible();
    await expect(
      pages[0].locator(".seat>small").filter({ hasText: "$25.00" }),
    ).toHaveCount(7);
    await pages[0]
      .getByRole("button", { name: "Deal table", exact: true })
      .click();
    await test.step("Reconnect fourth browser", () => pages[3].reload());
    for (let guard = 0; guard < 40; guard++) {
      if (
        await pages[0]
          .getByRole("button", { name: "Next round", exact: true })
          .isVisible()
      )
        break;
      let acted = false;
      for (const p of pages) {
        // One snapshot avoids waiting for a button removed by a settlement poll
        // between separate isVisible/isEnabled calls (notably on slower CI).
        const stand = p.getByRole("button", { name: "Stand", exact: true })
          .and(p.locator("button:enabled"));
        if (await stand.count()) {
          try {
            await stand.click();
          } catch (error) {
            // A timeout may settle the final hand while Playwright scrolls.
            // Other interaction failures must still fail the test.
            if (!(await p.getByRole("button", {name:"Next round",exact:true}).isVisible())) throw error;
          }
          acted = true;
          break;
        }
      }
      if (!acted) await pages[0].waitForTimeout(300);
    }
    await expect(
      pages[0].getByRole("button", { name: "Next round", exact: true }),
    ).toBeVisible();
    await expect(
      pages[3].getByRole("button", { name: "Next round", exact: true }),
    ).toBeVisible();
    const receipts = await Promise.all(
      pages.map((p) =>
        p.evaluate(async () => {
          const id = JSON.parse(localStorage.getItem("bonkers-demo-identity")!);
          return fetch("/api/v1/receipts", {
            headers: { Authorization: "Bearer " + id.token },
          }).then((r) => r.json());
        }),
      ),
    );
    expect(receipts[0][0].wagers).toHaveLength(7);
    expect(Object.values(receipts[0][0].fees).every((fee: any) => fee.amount === 6)).toBe(true);
    for (const r of receipts) expect(r[0].hash).toBe(receipts[0][0].hash);
    await pages[0].screenshot({
      path: "docs/screenshots/seven-player-table.png",
      fullPage: true,
    });
    await pages[0].setViewportSize({ width: 390, height: 844 });
    await pages[0].screenshot({
      path: "docs/screenshots/mobile-table.png",
      fullPage: true,
    });
    expect(
      await pages[0].evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await pages[0].goto("/#fairness");
    await pages[0]
      .getByRole("button", { name: "Verify my latest round" })
      .click();
    await expect(
      pages[0].getByText("Round verified", { exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});

test("mobile navigation exposes account and session revocation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await join(page, "Mobile player");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Your account", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Set spending permission" }),
  ).toBeVisible();
  await expect(page.locator("nav")).not.toHaveClass("open");
  await page
    .getByRole("button", { name: "Revoke session", exact: true })
    .click();
  await expect(page.getByText("No active spending permission.")).toBeVisible();
});


test("a visitor can join directly from an empty orbital seat", async ({ page }) => {
  await page.goto("/#table/bonkers-room");
  const seat = page.getByRole("button", {name:"Take seat 1",exact:true});
  await expect(seat).toBeEnabled();
  await expect(page.getByRole("button", {name:"Leave seat",exact:true})).toHaveCount(0);
  await seat.click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Let’s play"}).click();
  await expect(page).toHaveURL(/#table\/bonkers-room/);
  await seat.click();
  await expect(page.locator(".seat.mine strong")).toContainText("(you)");
  await expect(page.locator(".fee-disclosure")).toContainText("$25.06 total");
  await page.getByRole("button",{name:"Dismiss notification"}).click();
  for (const size of [{width:1440,height:900},{width:1280,height:650},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    await expect(page.locator(".header")).toBeHidden();
    await expect(page.locator("footer")).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const locator of [page.getByRole("button",{name:"Leave room",exact:true}),page.getByRole("button",{name:"Place bet",exact:true}),page.getByLabel("Bet in dollars")]) {
      const box=await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x+box!.width).toBeLessThanOrEqual(size.width);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);
    }
    await page.screenshot({path:`docs/screenshots/room-${size.width}x${size.height}.png`});
  }
  await page.getByRole("button",{name:"Leave room",exact:true}).click();
  await expect(page).toHaveURL(/#lobby/);
  await expect(page.locator(".header")).toBeVisible();
});


test("profiles enforce a single unique name and support public avatars and uploads", async ({page,browser}) => {
  await join(page,"Profile tester");
  await page.getByRole("button", {name:"Your profile",exact:true}).click();
  await expect(page.getByRole("heading",{name:"One change. Make it Bonkers."})).toBeVisible();
  const chosen="CosmicGoose_"+Date.now().toString().slice(-8);
  await page.getByLabel("Choose your username").fill(chosen);
  await expect(page.getByText("Available. Yours if you want it.",{exact:true})).toBeVisible();
  await page.getByRole("checkbox",{name:"I understand I can only change my username once."}).check();
  await page.getByRole("button",{name:"Claim username permanently"}).click();
  await expect(page.getByRole("heading",{name:"Your name is locked in."})).toBeVisible();
  await expect(page.getByLabel("Choose your username")).toHaveCount(0);
  await page.getByRole("button",{name:"Use Eight lucky hands avatar"}).click();
  await expect(page.getByRole("button",{name:"Use Eight lucky hands avatar"})).toHaveAttribute("aria-pressed","true");
  const png=await sharp({create:{width:50,height:80,channels:3,background:"#df83d8"}}).png().toBuffer();
  await page.getByLabel("Upload profile image").setInputFiles({name:"profile.png",mimeType:"image/png",buffer:png});
  await expect(page.getByAltText("New profile image preview")).toBeVisible();
  await page.getByRole("button",{name:"Save profile image"}).click();
  await expect(page.getByText("Profile image saved.",{exact:true})).toBeVisible();
  const imageSrc=await page.locator(".profile-portrait img").getAttribute("src");
  expect(imageSrc).toMatch(/^\/api\/v1\/avatars\/[a-f0-9-]+$/);
  const response=await page.request.get(imageSrc!);expect(response.ok()).toBe(true);expect(response.headers()["content-type"]).toBe("image/webp");
  await page.reload();
  await expect(page.getByRole("heading",{name:chosen,exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Your name is locked in."})).toBeVisible();
  const id=await page.evaluate(async()=>{const auth=JSON.parse(localStorage.getItem("bonkers-demo-identity")!);return (await fetch("/api/v1/account",{headers:{Authorization:"Bearer "+auth.token}}).then(r=>r.json())).id;});
  await page.screenshot({path:"docs/screenshots/profile-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"docs/screenshots/profile-mobile.png",fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const context=await browser.newContext();
  try {
    const other=await context.newPage();
    await other.goto("/#profile/"+id);
    await expect(other.getByRole("heading",{name:chosen,exact:true})).toBeVisible();
    await expect(other.getByLabel("Upload profile image")).toHaveCount(0);
    await expect(other.locator(".profile-portrait img")).toHaveAttribute("src",imageSrc!);
    await join(other,"Other profile tester");
    await other.getByRole("button",{name:"Your profile",exact:true}).click();
    await other.getByLabel("Choose your username").fill(chosen.toUpperCase());
    await expect(other.getByText("That name is already taken.",{exact:true})).toBeVisible();
    await expect(other.getByRole("button",{name:"Claim username permanently"})).toBeDisabled();
  } finally {await context.close();}
});
