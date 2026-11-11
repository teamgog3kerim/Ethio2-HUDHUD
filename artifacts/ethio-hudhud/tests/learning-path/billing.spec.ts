import type { Page } from '@playwright/test';
import { test, expect, status, account, lesson, conversation } from './billing-fixture';

async function layout(page: Page, lang: 'ar' | 'en') {
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Billing UI must fit the viewport without horizontal scrolling').toBe(true);
}

for (const lang of ['ar', 'en'] as const) {
  test.describe(`billing ${lang}`, () => {
    test.beforeEach(async ({ billing, page }) => {
      billing.lang = lang;
      await page.addInitScript(language => localStorage.setItem('hh-lang', language), lang);
    });
    const text = (ar: string, en: string) => lang === 'ar' ? ar : en;

    test('day-three guest prompt links to signup/plans; account copy does not offer progress transfer', async ({ page, billing }) => {
      await page.goto('/learn');
      const banner = page.getByTestId('banner-trial-expired');
      await expect(banner).toContainText(text('لا ينتقل تقدم الضيف تلقائيًا', 'Guest progress does not transfer automatically'));
      await expect(banner).toContainText(text('التعلم ما زال مفتوحًا', 'Learning stays open'));
      await expect(page.getByTestId('link-trial-signup')).toHaveAttribute('href', '/sign-up');
      await expect(page.getByTestId('link-trial-plans')).toHaveAttribute('href', '/premium');
      await layout(page, lang);
      await page.getByTestId('link-trial-plans').click();
      await expect(page).toHaveURL('/choose-plan');
      await expect(page.getByTestId('text-trial-expired')).toContainText(text('الدروس ما زالت مفتوحة', 'Lessons remain open'));
      await page.getByTestId('button-choose-monthly').check();
      await expect(page.getByTestId('button-plan-signup')).toBeVisible();
      await account(page, true);
      await expect(page.getByTestId('button-plan-signup')).toHaveCount(0);
      await expect(page.getByTestId('link-trial-signup')).toHaveCount(0);
      await expect(banner).toContainText(text('اطّلع على الخطط', 'See the plans'));
      await expect(banner).not.toContainText(text('تقدم الضيف', 'Guest progress'));
      await expect.poll(() => billing.reads.includes('billing-account')).toBe(true);
      // Read-only fixture rejects all profile/progress/transfer writes.
      await page.reload();
      await expect(page.getByTestId('button-plan-signup')).toHaveCount(0);
      await expect(page.getByTestId('text-trial-expired')).toBeVisible();
      await layout(page, lang);
    });

    test('pricing uses contract offers and unavailable checkout has no fake subscribe buttons', async ({ page }) => {
      await page.goto('/premium');
      await expect(page).toHaveURL('/choose-plan');
      await expect(page.getByTestId('text-price-monthly')).toContainText('$29');
      await expect(page.getByTestId('text-total-monthly')).toContainText('$174');
      await expect(page.getByTestId('text-price-six_month')).toContainText('$149');
      await expect(page.getByTestId('text-total-six_month')).toContainText(text('6 أشهر', '6 months'));
      await expect(page.getByTestId('text-savings')).toContainText('$25 (14.4%)');
      for (const id of ['monthly', 'six_month']) {
        await expect(page.getByTestId(`button-subscribe-${id}`)).toHaveCount(0);
        await expect(page.getByTestId(`button-choose-${id}`)).toHaveAttribute('href', `/sign-up?plan=${id}`);
        await expect(page.getByTestId('button-live-checkout')).toHaveCount(0);
        await expect(page.getByTestId('button-sandbox-checkout')).toHaveCount(0);
      }
      await expect(page.getByTestId('text-plans-note')).toContainText(text('الدفع غير متاح', 'Payment is currently unavailable'));
      await expect(page.getByTestId('text-pricing-note')).toContainText(text('لا ترسل بريداً إلكترونياً', 'do not send email'));
      await layout(page, lang);
    });

    test('expired trial never blocks lesson reading or conversation exercises in the open pilot', async ({ page }) => {
      for (const item of [lesson, conversation]) {
        await page.goto(`/lesson/${item.id}`);
        await expect(page.getByTestId('banner-trial-expired')).toBeVisible();
        await expect(page.getByTestId('text-lesson-position')).toBeVisible();
        const next = page.getByTestId('button-next-word');
        while (await next.isVisible()) await next.click();
        await page.getByTestId('button-start-quiz').click();
        await expect(page.getByTestId('button-option-0')).toBeEnabled();
      }
    });

    test('one-minute polling changes active countdown into expired prompt on the mounted page', async ({ page, billing }) => {
      const b = billing.records.get(null)!;
      b.trial = { ...b.trial, state: 'active', daysRemaining: 1 };
      await page.clock.install();
      await page.goto('/premium');
      await expect(page.getByTestId('text-trial-remaining')).toContainText(text('1 يوم متبقٍ', '1 day(s) left'));
      await expect(page.getByTestId('text-trial-countdown')).toContainText(text('متبقٍ 1 يوم', '1 day(s) left'));
      await expect(page.getByTestId('banner-trial-expired')).toHaveCount(0);
      const reads = billing.reads.length;
      b.trial = status().trial;
      await page.clock.fastForward(61_000);
      await expect.poll(() => billing.reads.length).toBeGreaterThan(reads);
      await expect(page.getByTestId('banner-trial-expired')).toBeVisible();
      await expect(page.getByTestId('text-trial-expired')).toBeVisible();
      await expect(page.getByTestId('text-trial-countdown')).toHaveCount(0);
      await expect(page).toHaveURL('/choose-plan');
    });

    test('returning to the window refreshes billing before the next poll', async ({ page, context, billing }) => {
      await page.goto('/premium');
      await expect(page.getByTestId('banner-trial-expired')).toBeVisible();
      const reads = billing.reads.length;
      // Use real tab visibility, which is the focus signal React Query v5 uses.
      const other = await context.newPage();
      await other.goto('about:blank');
      await other.bringToFront();
      billing.records.get(null)!.trial = { ...status().trial, state: 'active', daysRemaining: 2 };
      await page.bringToFront();
      // Headless Chromium may keep all tabs visible; dispatch the browser's
      // public visibility event too (never call refetch or the query client).
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
      await expect.poll(() => billing.reads.length).toBeGreaterThan(reads);
      await expect(page.getByTestId('text-trial-countdown')).toContainText(text('متبقٍ 2 يوم', '2 day(s) left'));
      await expect(page.getByTestId('banner-trial-expired')).toHaveCount(0);
      await other.close();
    });

    test('loading and failure never block learning; pricing retry restores offers', async ({ page, billing }) => {
      billing.hold = true;
      await page.goto('/premium');
      await expect.poll(() => billing.pending.length).toBeGreaterThan(0);
      await expect(page.locator('main .skel').first()).toBeVisible();
      await expect(page.getByTestId('billing-notice')).toHaveCount(0);
      await expect(page.getByTestId('card-plan-monthly')).toHaveCount(0);
      await layout(page, lang);
      billing.fail = true;
      billing.release();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.getByTestId('billing-notice')).toHaveCount(0);
      await expect(page.getByTestId('card-plan-monthly')).toHaveCount(0);
      await layout(page, lang);
      billing.fail = false;
      await page.getByTestId('button-retry').click();
      await expect(page.getByTestId('card-plan-monthly')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      billing.fail = true;
      billing.hold = true;
      // A fresh page clears the successful response; verify that both pending
      // billing and a failed first response leave lesson controls usable.
      await page.goto(`/lesson/${conversation.id}`);
      await page.reload();
      await expect.poll(() => billing.pending.length).toBeGreaterThan(0);
      await expect(page.getByTestId('billing-notice')).toHaveCount(0);
      await page.getByTestId('button-start-quiz').click();
      await expect(page.getByTestId('button-option-0')).toBeEnabled();
      const failure = page.waitForResponse(r => r.url().endsWith('/api/billing/status') && r.status() === 503);
      billing.release();
      await failure;
      await expect(page.getByTestId('billing-notice')).toHaveCount(0);
      await expect(page.getByTestId('button-option-0')).toBeEnabled();
    });

    for (const [kind, ar, en] of [
      ['complimentary_expiring', 'منحتك المجانية تنتهي قريبًا', 'Your complimentary access ends soon'],
      ['renewal_due', 'موعد التجديد يقترب', 'Renewal is coming up'],
      ['course_expiring', 'وصول الدورة ينتهي قريبًا', 'Your course access ends soon'],
    ] as const) {
      test(`${kind} is labelled as its own expiry type and in-app only`, async ({ page, billing }) => {
        const b = billing.records.get(null)!;
        b.reminder = { kind, expiresAt: '2026-10-24T12:00:00Z', daysRemaining: 4, delivery: 'in_app' };
        if (kind === 'complimentary_expiring') {
          b.plan = 'complimentary';
          b.source = 'admin_grant';
          b.accessExpiresAt = b.reminder.expiresAt;
        }
        await page.goto('/premium');
        const reminder = page.getByTestId('text-billing-reminder');
        await expect(reminder).toContainText(text(ar, en));
        await expect(reminder).toContainText(text('4 يوم', '4 day(s)'));
        await expect(reminder).toContainText(text('تنبيه داخل التطبيق فقط', 'In-app alert only'));
        const date = await page.evaluate(({ date, lang }) =>
          new Date(date).toLocaleDateString(lang, { dateStyle: 'medium' }),
        { date: b.reminder.expiresAt, lang });
        await expect(reminder).toContainText(date);
        for (const other of ['منحتك المجانية تنتهي قريبًا', 'موعد التجديد يقترب', 'وصول الدورة ينتهي قريبًا',
          'Your complimentary access ends soon', 'Renewal is coming up', 'Your course access ends soon']) {
          if (other !== text(ar, en)) await expect(reminder).not.toContainText(other);
        }
        if (kind === 'complimentary_expiring') {
          await expect(page.getByTestId('text-complimentary-expiry')).toContainText(text('منحة مجانية حتى', 'Complimentary access until'));
          await expect(page.getByTestId('text-access-expiry')).toBeVisible();
          await expect(page.getByTestId('card-billing')).toContainText(text('انتهاء المنحة', 'Complimentary expiry'));
          await expect(page.getByTestId('card-trial')).toHaveCount(0);
          await expect(page.getByTestId('banner-trial-expired')).toHaveCount(0);
          await expect(page.getByTestId('text-plan')).toHaveText(text('منحة مجانية', 'Complimentary'));
        }
        await layout(page, lang);
      });
    }
  });
}
