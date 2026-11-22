// Story beat windows in e2e (plan M2-25): a new game greets the player with «Берег Дніпра» on its first tick, and the
// window makes the rest of the UI inert until it is closed.
import { expect, type Page } from '@playwright/test';

/** Closes the story window named `title` (uk) with its button and waits until it is gone. */
export async function closeBeat(page: Page, title: string | RegExp): Promise<void> {
  const dialog = page.getByRole('dialog', { name: title });
  await dialog.getByRole('button').click();
  await expect(dialog).toBeHidden();
}

/** A new game's welcome beat (it fires on the first tick of a live clock). */
export const closeWelcome = (page: Page): Promise<void> => closeBeat(page, 'Берег Дніпра');
