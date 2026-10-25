import type { Page } from 'playwright';

export interface OnboardingResult { shown: boolean; controls: 'motion' | 'touch' | 'keyboard' | null; continuedWith: string | null }
/** Exercise the real first-run sheet. Never seed completion storage or remove a modal. */
export async function completeLandingOnboarding(page: Page, options: { controls?: 'motion' | 'touch'; touch?: boolean; timeout?: number } = {}): Promise<OnboardingResult> {
  const dialog = page.getByTestId('settings-dialog');
  try { await dialog.waitFor({ state: 'visible', timeout: options.timeout ?? 2000 }); }
  catch { return { shown: false, controls: null, continuedWith: null }; }
  const activate = async (id: string) => {
    const control = dialog.getByTestId(id);
    if (options.touch) await control.tap(); else await control.click();
  };
  const choice = options.controls ?? 'touch';
  const id = choice === 'motion' ? 'controls-motion' : 'controls-touch';
  const mobileControls = await dialog.getByTestId(id).isVisible();
  if (mobileControls) await activate(id);
  const continuedWith = await dialog.getByTestId('settings-close').innerText();
  await activate('settings-close');
  await dialog.waitFor({ state: 'hidden' });
  return { shown: true, controls: mobileControls ? choice : 'keyboard', continuedWith };
}

/** Controls now live in Settings; invoke the visible Settings button as a user would. */
export async function openControlSettings(page: Page): Promise<void> {
  const dialog = page.getByTestId('settings-dialog');
  if (!await dialog.isVisible()) await page.getByTestId('settings-open').click();
  await dialog.waitFor({ state: 'visible' });
}
export async function closeControlSettings(page: Page): Promise<void> {
  const dialog = page.getByTestId('settings-dialog');
  if (await dialog.isVisible()) { await dialog.getByTestId('settings-close').click(); await dialog.waitFor({ state: 'hidden' }); }
}
