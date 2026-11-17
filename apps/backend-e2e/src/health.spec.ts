import { expect, test } from '@playwright/test';

test('health check reports the instance is up', async ({ request }) => {
  const response = await request.get('/api/v1/public/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: 'ok' });
});
