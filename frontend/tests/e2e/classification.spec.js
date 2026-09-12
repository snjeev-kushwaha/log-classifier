/**
 * Browser-level end-to-end tests. These run against a real rendered page
 * (via Playwright's webServer, see playwright.config.js) with the backend
 * network calls intercepted, so the suite is deterministic and doesn't
 * require a live FastAPI + Groq deployment to run in CI. Point baseURL at
 * a real backend and remove the route mocks to run this as a true
 * full-stack e2e suite in a staging environment.
 */
import { test, expect } from "@playwright/test";

test.describe("Hybrid log classifier UI", () => {
  test("classifies a log via the regex path and displays the result", async ({ page }) => {
    await page.route("**/api/v1/classify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          text: "Multiple login failures occurred on user 9052 account",
          label: "security_alert",
          confidence: 1.0,
          method_used: "regex",
          needs_human_review: false,
        }),
      });
    });

    await page.goto("/");
    await page.getByTestId("log-textarea").fill("Multiple login failures occurred on user 9052 account");
    await page.getByTestId("classify-button").click();

    await expect(page.getByTestId("classification-result")).toBeVisible();
    await expect(page.getByTestId("result-label")).toHaveText("security_alert");
    await expect(page.getByTestId("method-badge")).toHaveText("Regex");
  });

  test("shows a client-side validation error without calling the API", async ({ page }) => {
    let apiCalled = false;
    await page.route("**/api/v1/classify", async (route) => {
      apiCalled = true;
      await route.continue();
    });

    await page.goto("/");
    await page.getByTestId("classify-button").click();

    await expect(page.getByTestId("input-error")).toBeVisible();
    expect(apiCalled).toBe(false);
  });

  test("surfaces a backend error without crashing the page", async ({ page }) => {
    await page.route("**/api/v1/classify", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      });
    });

    await page.goto("/");
    await page.getByTestId("log-textarea").fill("some log line");
    await page.getByTestId("classify-button").click();

    await expect(page.getByTestId("api-error")).toBeVisible();
    await expect(page.getByTestId("api-error")).toContainText("Internal server error");
  });

  test("low-confidence LLM result can be confirmed via the human review flow", async ({ page }) => {
    await page.route("**/api/v1/classify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          text: "a genuinely novel log pattern",
          label: "unclassified",
          confidence: 0.42,
          method_used: "llm",
          needs_human_review: true,
          reasoning: "No strong match to any known category",
        }),
      });
    });
    await page.route("**/api/v1/feedback", async (route) => {
      await route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/");
    await page.getByTestId("log-textarea").fill("a genuinely novel log pattern");
    await page.getByTestId("classify-button").click();

    await expect(page.getByTestId("review-flag")).toBeVisible();
    await page.getByTestId("confirm-correct-button").click();
    await expect(page.getByTestId("review-flag")).not.toBeVisible();
  });

  test("full user journey: type, classify, and see a confidence percentage", async ({ page }) => {
    await page.route("**/api/v1/classify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          text: "disk io saturation detected on volume data-02",
          label: "resource_usage",
          confidence: 0.88,
          method_used: "ml",
          needs_human_review: false,
        }),
      });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /hybrid log classifier/i })).toBeVisible();

    await page.getByTestId("log-textarea").fill("disk io saturation detected on volume data-02");
    await page.getByTestId("classify-button").click();

    await expect(page.getByTestId("result-confidence")).toHaveText("88%");
    await expect(page.getByTestId("method-badge")).toHaveText("ML (BERT + LogReg)");
  });
});
