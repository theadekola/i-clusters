# i-Clusters Fluent-inspired SVG icon pack

Contains **70 original SVG icons**, designed for the i-Clusters private infrastructure-management interface.

## Contents

- `svg/`: individual 64×64 viewBox SVGs, transparent background, scalable at any size.
- `png-128/`: transparent PNG previews at 128×128 pixels.
- `index.html`: offline HTML gallery of all icons.
- `manifest.json`: filename, section, label and palette mappings.
- `README.md`: this guide.

## Usage

```html
<img src="/assets/icons/dashboard.svg" width="24" height="24" alt="Dashboard" />
```

To add icons to a React interface, copy `svg/` into `public/assets/icons/`:

```jsx
function SectionIcon({ name, size = 24 }) {
  return <img src={`/assets/icons/${name}.svg`} width={size} height={size} alt="" aria-hidden="true" />;
}
```

Use 20–24 px in sidebar navigation, 28–32 px in section headers, and 40–48 px on dashboard tiles. Smaller sizes may reduce the clarity of detailed pictograms.

## Design and rights

- Original vector illustrations created for the i-Clusters concept, inspired by colorful contemporary software icon aesthetics.
- No Microsoft, Proxmox, Docker, TrueNAS or ZimaOS brand logos have been copied or included. Product labels indicate navigation destinations, not brand ownership or endorsement.
- You may use, alter, recolor and redistribute these icons as part of your own software and materials.
- SVG filters, gradients and vector paths are embedded per file. No external font or network dependency is required.

## Notes

The icons are illustrative UI assets, not existing trademarked brand marks. Test their appearance at your chosen small UI sizes. Every icon is an independently usable SVG file; the HTML gallery is a preview, not a required runtime dependency.
