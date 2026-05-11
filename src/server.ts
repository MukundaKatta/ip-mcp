#!/usr/bin/env node
/**
 * ip MCP server. Three tools: `info`, `contains`, `expand`.
 *
 * `info` classifies an address (v4 or v6, private/loopback/link-local/
 * unspecified/multicast). `contains` tests CIDR membership. `expand`
 * gives both compact and full forms of an IPv6 address.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import net from 'node:net';

const VERSION = '0.1.0';

export type IPVersion = 4 | 6;

export interface IPInfo {
  address: string;
  version: IPVersion;
  is_private: boolean;
  is_loopback: boolean;
  is_link_local: boolean;
  is_multicast: boolean;
  is_unspecified: boolean;
}

function v4Octets(addr: string): number[] | null {
  if (net.isIPv4(addr) !== true) return null;
  return addr.split('.').map((s) => Number(s));
}

function v6Groups(addr: string): bigint | null {
  if (net.isIPv6(addr) !== true) return null;
  // Expand `::` and normalize.
  const expanded = expandV6(addr);
  let out = 0n;
  for (const g of expanded.split(':')) {
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

export function expandV6(addr: string): string {
  if (!net.isIPv6(addr)) throw new Error('not a valid IPv6: ' + addr);
  // Handle embedded IPv4 (e.g. `::ffff:1.2.3.4`).
  let s = addr;
  const v4Match = s.match(/(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    const [a, b, c, d] = v4Match[2].split('.').map(Number);
    const g7 = ((a << 8) | b).toString(16);
    const g8 = ((c << 8) | d).toString(16);
    s = v4Match[1] + g7 + ':' + g8;
  }
  const parts = s.split('::');
  let groups: string[];
  if (parts.length === 1) {
    groups = parts[0].split(':');
  } else {
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  }
  return groups.map((g) => g.padStart(4, '0').toLowerCase()).join(':');
}

export function info(addr: string): IPInfo {
  if (net.isIPv4(addr)) {
    const oct = v4Octets(addr)!;
    const [a, b] = oct;
    return {
      address: addr,
      version: 4,
      is_private:
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168),
      is_loopback: a === 127,
      is_link_local: a === 169 && b === 254,
      is_multicast: a >= 224 && a <= 239,
      is_unspecified: addr === '0.0.0.0',
    };
  }
  if (net.isIPv6(addr)) {
    const expanded = expandV6(addr);
    const firstGroup = parseInt(expanded.slice(0, 4), 16);
    return {
      address: addr,
      version: 6,
      is_private: (firstGroup & 0xfe00) === 0xfc00, // fc00::/7 ULA
      is_loopback: expanded === '0000:0000:0000:0000:0000:0000:0000:0001',
      is_link_local: (firstGroup & 0xffc0) === 0xfe80, // fe80::/10
      is_multicast: (firstGroup & 0xff00) === 0xff00, // ff00::/8
      is_unspecified: expanded === '0000:0000:0000:0000:0000:0000:0000:0000',
    };
  }
  throw new Error('not a valid IP address: ' + addr);
}

/**
 * Test whether `addr` is contained in `cidr` (e.g. `10.0.0.0/8`).
 * Works for both v4 and v6.
 */
export function contains(cidr: string, addr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  if (!prefixStr) throw new Error('cidr must include /prefix');
  const prefix = Number(prefixStr);
  if (net.isIPv4(network) && net.isIPv4(addr)) {
    if (prefix < 0 || prefix > 32) throw new Error('v4 prefix must be 0..32');
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const nNum = v4ToInt(network);
    const aNum = v4ToInt(addr);
    return (nNum & mask) === (aNum & mask);
  }
  if (net.isIPv6(network) && net.isIPv6(addr)) {
    if (prefix < 0 || prefix > 128) throw new Error('v6 prefix must be 0..128');
    const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
    const nBig = v6Groups(network)!;
    const aBig = v6Groups(addr)!;
    return (nBig & mask) === (aBig & mask);
  }
  throw new Error('cidr/address must be same version');
}

function v4ToInt(addr: string): number {
  const oct = v4Octets(addr)!;
  return ((oct[0] << 24) | (oct[1] << 16) | (oct[2] << 8) | oct[3]) >>> 0;
}

const server = new Server({ name: 'ip', version: VERSION }, { capabilities: { tools: {} } });

const TOOLS = [
  {
    name: 'info',
    description: 'Classify an IPv4 or IPv6 address: version + private/loopback/link-local/multicast/unspecified flags.',
    inputSchema: {
      type: 'object',
      properties: { address: { type: 'string' } },
      required: ['address'],
    },
  },
  {
    name: 'contains',
    description: 'Check whether an IP address is inside a CIDR block (e.g. 10.0.0.0/8).',
    inputSchema: {
      type: 'object',
      properties: { cidr: { type: 'string' }, address: { type: 'string' } },
      required: ['cidr', 'address'],
    },
  },
  {
    name: 'expand',
    description: 'Expand a compact IPv6 address to its full eight-group form.',
    inputSchema: {
      type: 'object',
      properties: { address: { type: 'string' } },
      required: ['address'],
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === 'info') {
      const a = args as unknown as { address: string };
      return jsonResult(info(a.address));
    }
    if (name === 'contains') {
      const a = args as unknown as { cidr: string; address: string };
      return jsonResult({ contains: contains(a.cidr, a.address) });
    }
    if (name === 'expand') {
      const a = args as unknown as { address: string };
      return jsonResult({ expanded: expandV6(a.address) });
    }
    return errorResult('unknown tool: ' + name);
  } catch (err) {
    return errorResult('ip tool failed: ' + (err as Error).message);
  }
});

function jsonResult(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}
function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`ip MCP server v${VERSION} ready on stdio\n`);
}
