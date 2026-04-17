## 2024-05-24 - Accessibility for Framer Motion Icon Buttons
**Learning:** Icon-only buttons implemented using `<motion.button>` often miss `aria-label`s and `focus-visible` styles, rendering them inaccessible to screen readers and keyboard users, despite visual animations. Adding Tailwind `focus-visible` styles directly to the `className` works seamlessly with Framer Motion.
**Action:** Always verify keyboard focus states and screen reader descriptions when implementing custom animated icon buttons (e.g., FABs or embedded actions).
