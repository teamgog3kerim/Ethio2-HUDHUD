import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimLoginWelcome, claimSignupWelcome, isNewGoogleSignup, markLoginWelcome,
  scheduleWelcomeDismiss, WELCOME_DURATION_MS,
} from './signup-welcome';

const now = Date.UTC(2026, 9, 24, 9);

test('a genuinely new Google account in its first session is welcomed', () => {
  assert.equal(isNewGoogleSignup(now - 3000, now - 1000, true, now), true);
});

test('ordinary logins, linked old accounts, and non-Google signups are excluded', () => {
  assert.equal(isNewGoogleSignup(now - 86400000, now, true, now), false);
  assert.equal(isNewGoogleSignup(now - 180000, now, true, now), false);
  assert.equal(isNewGoogleSignup(now - 3000, now - 1000, false, now), false);
  assert.equal(isNewGoogleSignup(now - 600000, now - 599000, true, now), false);
});

test('missing or implausible timestamps never trigger a welcome', () => {
  assert.equal(isNewGoogleSignup(NaN, now, true, now), false);
  assert.equal(isNewGoogleSignup(now, NaN, true, now), false);
  assert.equal(isNewGoogleSignup(now + 60000, now + 61000, true, now), false);
  assert.equal(isNewGoogleSignup(now, now - 60000, true, now), false);
});

test('the same learner gets one welcome, not another on navigation or remount', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(claimSignupWelcome('new-google-learner', storage), true);
  assert.equal(claimSignupWelcome('new-google-learner', storage), false);
  assert.equal(values.get('hh-signup-welcome:new-google-learner'), '1');
  values.set('hh-signup-welcome:previously-welcomed', '1');
  assert.equal(claimSignupWelcome('previously-welcomed', storage), false);
  assert.equal(claimSignupWelcome('another-new-learner', storage), true);
});

test('login welcome appears only after a successful login marker is claimed once', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  markLoginWelcome('returning-learner', storage);
  assert.equal(claimLoginWelcome('different-user', storage), false);
  assert.equal(values.has('hudhud:login-welcome'), false);
  markLoginWelcome('returning-learner', storage);
  assert.equal(claimLoginWelcome('returning-learner', storage), true);
  assert.equal(claimLoginWelcome('returning-learner', storage), false);
});

test('blocked storage is safe and still prevents repeated welcomes in-page', () => {
  const storage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.equal(claimSignupWelcome('storage-blocked-learner', storage), true);
  assert.equal(claimSignupWelcome('storage-blocked-learner', storage), false);
  assert.equal(claimLoginWelcome('storage-blocked-learner', storage), false);
  assert.equal(claimSignupWelcome('', storage), false);
});

test('automatic dismissal happens at 2000ms, not sooner', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let dismissed = false;
  scheduleWelcomeDismiss(() => { dismissed = true; });
  t.mock.timers.tick(WELCOME_DURATION_MS - 1);
  assert.equal(dismissed, false);
  t.mock.timers.tick(1);
  assert.equal(dismissed, true);
});

test('early dismissal/unmount cancels the automatic callback', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const cancel = scheduleWelcomeDismiss(() => { calls += 1; });
  t.mock.timers.tick(500);
  cancel();
  t.mock.timers.tick(WELCOME_DURATION_MS);
  assert.equal(calls, 0);
});
