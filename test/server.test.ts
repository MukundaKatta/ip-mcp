import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { info, contains, expandV6 } from '../src/server.js';

test('classifies a public IPv4', () => {
  const r = info('8.8.8.8');
  assert.equal(r.version, 4);
  assert.equal(r.is_private, false);
  assert.equal(r.is_loopback, false);
});

test('classifies private RFC 1918 ranges', () => {
  assert.equal(info('10.0.0.1').is_private, true);
  assert.equal(info('172.20.0.1').is_private, true);
  assert.equal(info('172.32.0.1').is_private, false); // outside 172.16-31
  assert.equal(info('192.168.1.1').is_private, true);
});

test('classifies IPv4 loopback + link-local + multicast', () => {
  assert.equal(info('127.0.0.1').is_loopback, true);
  assert.equal(info('169.254.1.1').is_link_local, true);
  assert.equal(info('224.0.0.1').is_multicast, true);
});

test('classifies an IPv6 address', () => {
  const r = info('::1');
  assert.equal(r.version, 6);
  assert.equal(r.is_loopback, true);

  assert.equal(info('fe80::1').is_link_local, true);
  assert.equal(info('fc00::1').is_private, true);
  assert.equal(info('ff02::1').is_multicast, true);
});

test('contains v4 CIDR membership', () => {
  assert.equal(contains('10.0.0.0/8', '10.1.2.3'), true);
  assert.equal(contains('10.0.0.0/8', '11.0.0.1'), false);
  assert.equal(contains('192.168.1.0/24', '192.168.1.99'), true);
  assert.equal(contains('192.168.1.0/24', '192.168.2.1'), false);
});

test('contains v6 CIDR membership', () => {
  assert.equal(contains('2001:db8::/32', '2001:db8:0:1::1'), true);
  assert.equal(contains('2001:db8::/32', '2001:db9::1'), false);
});

test('expandV6 fills in :: shorthand', () => {
  assert.equal(expandV6('::1'), '0000:0000:0000:0000:0000:0000:0000:0001');
  assert.equal(expandV6('2001:db8::1'), '2001:0db8:0000:0000:0000:0000:0000:0001');
});

test('rejects malformed addresses', () => {
  assert.throws(() => info('not an ip'));
  assert.throws(() => info('999.999.999.999'));
  assert.throws(() => contains('10.0.0.0/8', 'not.an.ip.address'));
});
