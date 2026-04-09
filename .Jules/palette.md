## 2024-05-24 - Accessibility of Icon-Only Buttons using Material Symbols
**Learning:** Icon-only buttons using `material-symbols-outlined` across the app are missing `aria-label` attributes, which makes them inaccessible to screen readers. In addition, there are missing proper keyboard focus visible states.
**Action:** When adding or updating icon-only buttons, always ensure that an `aria-label` is provided and keyboard accessibility (`focus-visible` styles) is clearly visible.
