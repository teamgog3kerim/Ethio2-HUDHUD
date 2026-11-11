import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/ethiodeploy-beacon.ts', import.meta.url), 'utf8');

function loadModule({ allowed = true, sendBeacon = () => true } = {}) {
  const exports = {};
  const window = { navigator: { sendBeacon } };
  let consentAllowed = allowed;
  const analytics = { visitorAnalyticsAllowed: () => consentAllowed };
  const moduleCode = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(moduleCode, {
    exports,
    require: () => analytics,
    window,
  });
  return {
    ...exports,
    window,
    sent: () => consentAllowed,
    setAllowed: (value) => { consentAllowed = value; },
  };
}

const validId = 'bcb94b75-63da-42f8-9f1a-46c3df7d9130';

test('EthioDeploy payload contains only the project, normalized path, blank referrer, and rotating ID', () => {
  const beacon = loadModule();
  const payload = JSON.parse(beacon.createEthioDeployBeaconPayload('/lesson', validId));
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    project: 'ethio2-hudhud',
    path: '/lesson',
    referrer: '',
    visitorId: validId,
  });
});

test('administrative paths and unnormalized paths are excluded from the external beacon', () => {
  const beacon = loadModule();
  assert.equal(beacon.createEthioDeployBeaconPayload('/admin', validId), null);
  assert.equal(beacon.createEthioDeployBeaconPayload('/admin/users', validId), null);
  assert.equal(beacon.createEthioDeployBeaconPayload('/lesson/private-id', validId), null);
  assert.equal(beacon.createEthioDeployBeaconPayload('/learn', 'not-a-uuid'), null);
});

test('beacon sends only after the visitor analytics consent check passes', () => {
  const calls = [];
  const beacon = loadModule({
    allowed: false,
    sendBeacon: (...args) => { calls.push(args); return true; },
  });
  beacon.sendEthioDeployBeacon('/learn', validId);
  assert.equal(calls.length, 0);
  beacon.setAllowed(true);
  beacon.sendEthioDeployBeacon('/learn', validId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://ethiodeploy.com/api/beacon');
  assert.equal(JSON.parse(calls[0][1]).visitorId, validId);
});
