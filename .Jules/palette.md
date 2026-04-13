## 2024-05-15 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Found multiple instances across `Chatbot`, `Toast`, and `PipelineTestUI` components where icon-only buttons lacked `aria-label` attributes and keyboard focus indicators (`focus-visible`). This is a recurring accessibility gap for custom UI components using Material Symbols.
**Action:** Always add descriptive `aria-label` and `focus-visible` ring styles to buttons that rely solely on icons for visual communication.
