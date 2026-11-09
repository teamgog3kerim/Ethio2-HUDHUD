import type { Page } from '@playwright/test';
import { test, expect, lesson, conversation, otherLesson, switchIdentity } from './favourites-fixture';

const saved = (page: Page) => page.getByRole('region', { name: 'المحفوظات', exact: true });
const button = (page: Page, id: string) => page.getByTestId(`favourite-${id}`);
async function openSaved(page: Page) {
  await page.getByTestId('button-saved-items').click();
  await expect(saved(page)).toBeVisible();
}
async function backToLearn(page: Page) {
  await page.getByTestId(page.viewportSize()!.width < 1024 ? 'tab-learn' : 'nav-learn').click();
}
async function save(page: Page, id: string, key?: 'Enter' | 'Space') {
  const control = button(page, id);
  await expect(control).toBeEnabled();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect(control).toHaveAccessibleName('حفظ لوقت لاحق');
  if (key) {
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press(key);
  } else await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(control).toHaveAccessibleName('إزالة من المحفوظات');
}

test('favourites: lesson and conversation persist after reload and remove from saved view', async ({ page, favourites }) => {
  await page.goto(`/lesson/${lesson.id}`);
  await switchIdentity(page, 'learner-a');
  await save(page, lesson.id);
  await page.goto(`/lesson/${conversation.id}`);
  await save(page, conversation.id);
  await page.reload();
  await expect(button(page, conversation.id)).toHaveAttribute('aria-pressed', 'true');
  await backToLearn(page);
  await openSaved(page);
  for (const item of [lesson, conversation]) {
    await expect(saved(page).getByRole('link', { name: item.content.titleAr, exact: false })).toHaveAttribute('href', `/lesson/${item.id}`);
    await expect(button(page, item.id)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.goto('/learn?view=saved');
  await page.reload();
  await expect(saved(page).getByRole('link')).toHaveCount(2);
  await expect(saved(page)).toContainText('محادثة');
  await expect(saved(page)).toContainText('درس');
  for (const item of [lesson, conversation]) {
    await expect(button(page, item.id)).toBeEnabled();
    await button(page, item.id).click();
    await expect(button(page, item.id)).toHaveCount(0);
  }
  await expect(saved(page)).toContainText('لا مواد محفوظة بعد');
  await page.reload();
  await expect(saved(page).getByRole('link')).toHaveCount(0);
  expect([...favourites.saves.get('learner-a')!]).toEqual([]);
  expect(favourites.writes.map(w => [w.method, w.id, w.identity])).toEqual([
    ['PUT', lesson.id, 'learner-a'], ['PUT', conversation.id, 'learner-a'],
    ['DELETE', lesson.id, 'learner-a'], ['DELETE', conversation.id, 'learner-a'],
  ]);
});

test('favourites: guest, signed-out and switched accounts never display another identity saves', async ({ page, favourites }) => {
  favourites.saves.get('learner-b')!.add(otherLesson.id);
  await page.goto(`/lesson/${lesson.id}`);
  await save(page, lesson.id);
  await backToLearn(page);
  await openSaved(page);
  await expect(button(page, lesson.id)).toBeVisible();
  await switchIdentity(page, 'learner-a');
  await expect(saved(page)).toContainText('لا مواد محفوظة بعد');
  await expect(button(page, lesson.id)).toHaveCount(0);
  await page.getByRole('button', { name: 'البرنامج', exact: true }).click();
  await save(page, lesson.id);
  // Conversation detail exercises the same shared cache outside the listing.
  await page.goto(`/lesson/${conversation.id}`);
  await save(page, conversation.id);
  await backToLearn(page);
  await openSaved(page);
  await expect(saved(page).getByRole('link')).toHaveCount(2);

  // Actual sign-out confirmation UI, with only the auth adapter substituted.
  if (page.viewportSize()!.width < 1024) {
    await page.getByTestId('nav-account-mobile').click();
    await page.getByTestId('button-signout-account').click();
  } else {
    await page.getByTestId('button-signout').filter({ visible: true }).click();
  }
  await page.getByTestId('button-signout-confirm').click();
  await expect(page).toHaveURL('/');
  await openSaved(page);
  await expect(button(page, conversation.id)).toHaveCount(0);
  await expect(saved(page).getByRole('link')).toHaveCount(1); // guest's own save
  await expect(button(page, lesson.id)).toHaveAttribute('aria-pressed', 'true');

  // Delay the new identity's response: stale saves must not be visible while
  // fetching, not merely disappear once the new response has arrived.
  favourites.holdReads = true;
  await switchIdentity(page, 'learner-b');
  await expect.poll(() => favourites.pendingReads.length).toBeGreaterThan(0);
  await expect(saved(page).getByRole('link')).toHaveCount(0);
  favourites.holdReads = false;
  for (const release of favourites.pendingReads.splice(0)) release();
  await expect(button(page, otherLesson.id)).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, lesson.id)).toHaveCount(0);
  await expect(button(page, conversation.id)).toHaveCount(0);
  await page.reload();
  await openSaved(page);
  await expect(saved(page).getByRole('link')).toHaveCount(1);
  await expect(button(page, otherLesson.id)).toBeVisible();

  // Return in the same mounted client, then directly switch A -> B again.
  await switchIdentity(page, 'learner-a');
  await expect(saved(page).getByRole('link')).toHaveCount(2);
  await expect(button(page, lesson.id)).toBeVisible();
  await expect(button(page, conversation.id)).toBeVisible();
  await switchIdentity(page, 'learner-b');
  await expect(saved(page).getByRole('link')).toHaveCount(1);
  await expect(button(page, otherLesson.id)).toBeVisible();
  // Detail controls must also discard an account's saved state while mounted.
  await switchIdentity(page, 'learner-a');
  await saved(page).getByRole('link', { name: conversation.content.titleAr, exact: false }).click();
  await expect(button(page, conversation.id)).toHaveAttribute('aria-pressed', 'true');
  await switchIdentity(page, 'learner-b');
  await expect(button(page, conversation.id)).toHaveAttribute('aria-pressed', 'false');
  await expect(button(page, conversation.id)).toBeEnabled();
  expect([...favourites.saves.get('learner-a')!]).toEqual([lesson.id, conversation.id]);
});

test('favourites: open saved view refreshes archived items without navigation or reload', async ({ page, favourites }) => {
  favourites.saves.get(null)!.add(lesson.id).add(conversation.id);
  await page.clock.install();
  await page.goto('/learn?view=saved');
  await expect(saved(page).getByRole('link')).toHaveCount(2);
  const reads = favourites.reads.length;
  favourites.archived.add(lesson.id);
  await page.clock.fastForward(31_000);
  await expect.poll(() => favourites.reads.length).toBeGreaterThan(reads);
  await expect(button(page, lesson.id)).toHaveCount(0);
  await expect(button(page, conversation.id)).toBeVisible();
  favourites.archived.add(conversation.id);
  await page.clock.fastForward(31_000);
  await expect(saved(page)).toContainText('لا مواد محفوظة بعد');
  await expect(saved(page).getByRole('link')).toHaveCount(0);
  await expect(page).toHaveURL('/learn?view=saved');
  expect(favourites.writes).toEqual([]); // refresh never issues a learner delete
});

test('favourites: Enter and Space activate save controls on lesson, conversation and saved view', async ({ page, favourites }) => {
  for (const [item, key] of [[lesson, 'Enter'], [conversation, 'Space']] as const) {
    await page.goto(`/lesson/${item.id}`);
    await save(page, item.id, key);
  }
  await backToLearn(page);
  await openSaved(page);
  for (const [item, key] of [[lesson, 'Space'], [conversation, 'Enter']] as const) {
    const control = button(page, item.id);
    await expect(control).toBeEnabled();
    await expect(control).toHaveAccessibleName('إزالة من المحفوظات');
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press(key);
    await expect(control).toHaveCount(0);
  }
  await expect(saved(page)).toContainText('لا مواد محفوظة بعد');
  expect(favourites.writes.map(w => w.method)).toEqual(['PUT', 'PUT', 'DELETE', 'DELETE']);
});
