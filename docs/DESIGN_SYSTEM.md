# My Studio design system

## Direction

Typography and spacing follow measurements taken from Mobbin's public pages (https://mobbin.com): content first, colour from screenshots and project icons, quiet grey fills, black pill buttons. Layout follows dashboard references: a left sidebar with a workspace card, ⌘K search and grouped navigation; a breadcrumb header; stat tiles; a central screenshot viewer with a details panel. The design is original; no Mobbin or Google assets are used.

## Typeface

Google Sans Flex (SIL OFL 1.1, from `@fontsource-variable/google-sans-flex`, bundled locally) — the open release of the Google Sans used on m3.material.io. The `opsz` build (weight + optical size, 120 KB for Latin) is loaded and `font-optical-sizing: auto` gives large text the display shapes and body text the text shapes, like Google Sans and Google Sans Text on that site. Weights follow m3.material.io: 475 headlines, 500 labels, buttons and emphasis, 400 text; no negative tracking; labels +0.1px.

## Scale

- Body 16/24 weight 400. Controls, nav and names 16px weight 500, +0.1px.
- Page headline 80/80 weight 475 (56px on secondary pages); section headline 44/48; subtitle 20/26 weight 440 in #707070.
- Chips 12/16 weight 500, 8px radius, 4px × 8px padding, 4px gaps.
- Pill toggle 44px tall with 4px padding and 36px items; buttons 44px pills.
- Feature cards: `rgba(64,64,64,.06)` fill, 24px radius, 335 × 330 proportion, title 20/26 at 24px top padding, 20px gaps; the screenshot bleeds off the bottom-right edge and scrolls on hover.
- Content width 1044px.

## Charts

One series per chart, never two y-axes. Accent `#257de0` (dark `#338ced`, both validated) for the current period, grey for context, 10% area wash, 2px lines, hairline grid, crosshair tooltip, keyboard stepping and a table view. Deltas show an arrow and text, never colour alone.

## Themes and motion

Light and dark tokens in `app/style.css`; dark is the default when the system prefers it. Motion is short and disabled for reduced-motion preferences. Layouts are checked at 375, 768 and 1440 px without sideways scrolling.
