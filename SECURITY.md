# Security Policy — Bharat GST Free Billing

**Bharat GST Free Billing** handles GST invoices, GSTINs, accounting ledgers, and party records for real Indian businesses and Chartered Accountants. Security reports are taken seriously.

## Supported Versions

Only the **latest release** receives security fixes — please update to the latest version before reporting.

| Version | Supported |
| ------- | --------- |
| Latest release (`v5.2.0` — [see Releases](https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/releases/latest)) | ✅ |
| Older versions | ❌ — please update first |

## Reporting a Vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Please report privately via **GitHub Security Advisories** (preferred):
- **[Report a private security vulnerability](https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/security/advisories/new)**

Please include:
- App version (shown in *Settings → App & updates*)
- Operating system and browser (Chrome, Edge, Firefox, Safari, or Desktop package)
- Minimal reproduction steps using **synthetic/dummy data only** (never include real client GSTINs, PANs, or live invoices)
- Expected vs actual impact

### Response Targets

| Stage | Target |
| ----- | ------ |
| Acknowledgement | within 7 days |
| Assessment & severity triage | within 14 days |
| Patch release for confirmed high/critical issues | next release cycle |

## Threat Model & Scope

Bharat GST Free Billing is **local-first and serverless by default**:
- On the web/PWA (`https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/`), business data stays in the user's own browser IndexedDB, optional user-authorized PC folder (`File System Access API` — plain JSON for Tally/Excel portability), or AES-256-GCM encrypted `.fgsb` backup archives (`Backup Center` / `Vault`).
- On desktop/local server mode (`server.js`), HTTP binds to `127.0.0.1` by default; LAN phone pairing uses a self-signed TLS listener gated by pairing code + PIN (`src/utils/phoneAccess.js`).
- Optional 5G/Wi-Fi WebRTC P2P sync uses WebRTC DataChannels authenticated with a 6-digit Counter PIN and 5-attempt lockout (`src/utils/webrtcP2pSync.js`).

### In Scope
- Stored or reflected XSS / HTML injection via invoice fields, party names, imported CSV/XLSX/Tally XML/AIS JSON, or OCR text
- Content Security Policy (CSP) bypasses
- Unauthorized network access to local `server.js` / phone-access endpoints without valid pairing
- Cryptographic weaknesses in AES-256-GCM `.fgsb` / local vault sealing (`src/utils/vaultCrypto.js`)
- Supply-chain vulnerabilities in shipped runtime dependencies (`npm audit --omit=dev`)

### Out of Scope
- Attacks requiring prior local OS compromise or physical unlocked device access
- `devDependencies`-only advisories that are never shipped to runtime bundles
- Unverified scanner output without a working proof-of-concept

## Official Distribution

Download desktop builds and verify releases **only** from:
- **Repository Releases:** https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/releases
- **Official Web / Offline PWA:** https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/
