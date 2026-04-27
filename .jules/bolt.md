## 2024-XX-XX - Derived State Performance in Next.js/React
**Learning:** In a dashboard processing real-time extraction feeds (like `extractionFeed`), calculating derived state such as `currentFetchedAnswers` without `useMemo` blocks the main thread during high-frequency render updates because it maps and reduces over the array on every render tick.
**Action:** Always wrap heavy derived computations based on large lists or deep objects in `useMemo` to ensure they are only recalculated when their dependencies change.
