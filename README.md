# ip-mcp

[![npm](https://img.shields.io/npm/v/@mukundakatta/ip-mcp.svg)](https://www.npmjs.com/package/@mukundakatta/ip-mcp)
[![mcp](https://img.shields.io/badge/protocol-MCP-blue.svg)](https://modelcontextprotocol.io)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

MCP server: classify, test, and expand IPv4/IPv6 addresses. No external
deps — uses Node's built-in `net` plus first-principles bit math.

## Tools

### `info`

```json
{ "address": "10.0.0.1" }
```

→

```json
{
  "address": "10.0.0.1",
  "version": 4,
  "is_private": true,
  "is_loopback": false,
  "is_link_local": false,
  "is_multicast": false,
  "is_unspecified": false
}
```

Works for both v4 (RFC 1918) and v6 (ULA fc00::/7, link-local fe80::/10, multicast ff00::/8).

### `contains`

```json
{ "cidr": "192.168.1.0/24", "address": "192.168.1.99" }
```

→ `{ "contains": true }`

Works for both v4 and v6 CIDR blocks. Mismatched versions throw.

### `expand`

```json
{ "address": "2001:db8::1" }
```

→ `{ "expanded": "2001:0db8:0000:0000:0000:0000:0000:0001" }`

## Configure

```json
{ "mcpServers": { "ip": { "command": "npx", "args": ["-y", "@mukundakatta/ip-mcp"] } } }
```

## License

MIT.
