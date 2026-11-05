# Interface typography

The shared scale is defined in `apps/web/src/typography.css`, imported after page styles. It keeps the selected font family, theme and density preferences. Sizes use rem units so browser text preferences remain effective.

| Role | Default size | Usage |
| --- | --- | --- |
| Page title | 28px, 24px on phones | Main workspace and subpage headings |
| Section/dialog title | 20px | Secondary sections and popup headings |
| Panel title | 16px | Cards, monitoring panels and settings cards |
| Body/button/tab | 14px | Paragraphs, actions and navigation tabs |
| Form/table label | 13px | Labels, definition terms and table cells |
| Caption | 12px | Secondary notes and small text |

These pixel equivalents assume a 16px root size. Form fields use 16px at tablet/phone widths to avoid automatic input zoom. Tabs have a minimum 40px height, increasing to 44px on phones. Terminal helper textareas keep xterm's own metrics.

Use semantic h1 for the page, h2 for sections and h3 for card titles. Existing page-header h2 variants are normalized while those pages retain their current structure. New pages should reuse the shared roles instead of adding local font-size overrides. The final stylesheet intentionally takes precedence over legacy inline and page-specific sizes.

The Monitoring action group includes provider links, period, Customize, Refresh and Export. It shares a row where space permits and wraps on smaller screens. The links retain their existing permissions and routes.

Run the production route audit after changing the scale:

```sh
ICLUSTERS_BROWSER_TOOLS=/tmp/iclusters-browser-tools/node_modules LAYOUT_PRODUCTION=1 LAYOUT_CHECK_TYPOGRAPHY=1 LAYOUT_WIDTHS=1280,768,390,320 node apps/web/scripts/audit-layout.mjs
```

The browser runtime is installed by CI. This audit uses fixture API responses, not a customer controller. Keep real-device, screen-reader and customer acceptance evidence separate.
