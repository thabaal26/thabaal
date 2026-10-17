# Portal design stylesheet

`src/app/dashboard/portal.css` is generated from the portal design (`thabaal-portal.html`).

- `design.css`: the design's own CSS, as extracted from `thabaal-portal.html`
- `top.css`: browser defaults the design relies on (Tailwind's base resets them), in `@layer base`
- `bottom.css`: app additions to the design classes (link tabs, app form fields…), in `@layer components`
- `unlayered.css`: the design's card surface over the app's own `.card-3d` / `.ui-card` cards

Rebuild after changing any of these:

```bash
node scripts/portal-css/build.mjs scripts/portal-css/design.css src/app/dashboard/portal.css "$PWD" \
  scripts/portal-css/top.css scripts/portal-css/bottom.css scripts/portal-css/unlayered.css
```

Everything is scoped to `.thabaal-portal` (the dashboard layout wraps every page in it). Element
rules go in `@layer base`, design classes in `@layer components`, both below Tailwind's utilities.
