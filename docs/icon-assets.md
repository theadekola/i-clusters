# Local image and icon assets

i-Clusters ships its logos in `apps/web/public/assets`. No CDN requests are needed. Navigation, headers, topology symbols, actions, hardware, status indicators and file operations use the shared Fluent-inspired SVG set in `public/assets/icons`. The 70 supplied SVGs are preserved unchanged. Matching controls and system identity tiles fill the remaining gaps.

## OS detection

VM detail logos use QEMU Guest Agent OS ID/name/pretty-name first, then the configured Proxmox OS type. CT details use the reported container OS type. Docker host identity uses its reported OperatingSystem value. Ubuntu and Debian therefore use their actual logos in the OS panels. Generic Linux stays generic; unsupported or missing values use a neutral computer/container icon. Guest names and IP addresses are not OS evidence. No additional per-row API calls are made to obtain logos.

The included OS families are Ubuntu, Debian, Linux, Alpine, Arch, Fedora, Red Hat, CentOS, Rocky Linux, AlmaLinux, openSUSE, FreeBSD, OpenBSD, Android, macOS, Linux Mint, Kali, Raspberry Pi OS, NixOS, Gentoo and Windows.

Docker application logos resolve from known image repository names, including registry prefixes, tags and digests. Unknown or custom images keep a container icon. An image logo does not imply a verified application health state or a new integration capability.

## Identity and accessibility

A shared BrandIcon component controls sizing, local paths and failed-image fallbacks. Logos next to text are decorative to avoid duplicate screen-reader announcements. Standalone marks can provide an accessible label. i-Clusters has an SVG favicon, Apple touch icon and 192/512 pixel application icons. The web manifest provides install metadata; it does not add offline operation.

## Sources

The local `assets/brands/manifest.json` records each SVG source at an immutable upstream commit. `assets/brands/NOTICE.txt` and the included CC0/MIT license texts provide provenance and attribution. About → Credits links to the notice and lists available OS logos.

## Shared Fluent-style icons

`PageIcon` serves the supplied feature files, including `/assets/icons/dashboard.svg`. `BrandIcon` uses the supplied Proxmox/Docker/TrueNAS artwork and matching raised tiles containing the existing licensed OS/application identity marks. Identity detection still uses reported metadata; visual styling never guesses an OS or service.

`src/icons.ts` provides all 131 named action components used by the UI. They render SVG hosts containing the local icon image, retaining existing click/ref behaviour, `.lucide-*` animation hooks and dimensions. The visual pictograms come from the Fluent-style files, not the previous outline React components. Charts, sparklines, topology connection lines and scannable QR geometry remain data graphics.

Icons beside visible text are decorative. Standalone icons accept accessible labels; icon-only buttons retain their existing button labels and keyboard behaviour. Images have fixed dimensions and switch to a local dimensional fallback if loading fails. The application logo and installation icons retain their product identity.

### Maintaining the set

1. Put supplied originals in `apps/web/public/assets/icons` and keep `pack-manifest.json` and `PACK-README.md` alongside them.
2. Add a newly required action export to `scripts/fluent-icon-names.json`; map it to a supplied icon when its meaning matches, or generate its dimensional control pictogram.
3. Run `npm run icons:build -w apps/web`. The generator preserves the supplied 70 files and writes missing assets, the action/brand registry and SHA-256/source metadata. It reads Lucide vector definitions as data; it does not load a remote icon service.
4. Run the web tests and production build. Verify image requests and small sizes in light/dark modes and at desktop/mobile widths.

`public/assets/icons/NOTICE.txt` records supplied artwork, derived Lucide ISC pictograms and identity-mark licences. Source assets under `assets/brands` and the earlier preview catalogues are retained for provenance and reproducibility; UI components use the new `/assets/icons` paths.
