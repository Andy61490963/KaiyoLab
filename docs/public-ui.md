# Public website design

The public interface uses an original, content-first implementation inspired by the layout of [Tania Rascia's About page](https://www.taniarascia.com/me/). It does not copy her biography, images, or content.

## Design decisions

- Paper and charcoal themes, a restrained berry accent, system fonts, and readable line lengths.
- Desktop sidebar from 1024px, compact tablet navigation, and a native mobile disclosure below 801px.
- Markdown remains the source of home and About content. A missing page heading gets an accessible fallback.
- No stock hero or placeholder logo in the public masthead. Custom uploaded home images remain supported.
- Search preserves combined filters; article listings are actually newest-first.
- Only known legacy default copy is normalized. Custom article bodies, project descriptions, and profile text are not translated or overwritten automatically.

## Accessibility and resilience

Navigation works without JavaScript. With JavaScript enabled, Escape returns focus to the menu control, resizing closes the menu, and search shortcuts focus the search input. Themes follow system preferences until chosen manually, synchronize across tabs, and remain usable when storage is blocked. Focus rings, a skip link, touch-sized controls, reduced-motion support, and scrollable code/table regions are included.

## Verification

Run `npm run check`, `npm test`, `npm run db:migrate`, `npm run test:integration`, `npm run build`, and `npm run test:e2e` with the documented database configuration. The new `zz-public-ui.spec.ts` runs after the existing publishing suite, uses isolated test data, checks five viewport widths in both themes, and attaches About screenshots to the Playwright report. Existing publishing tests also cover copy-code, navigation, and theme persistence.

The redesign concerns the public website. The existing administration workflow and its language are not changed by this public UI patch.
