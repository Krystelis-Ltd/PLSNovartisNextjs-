## 2024-05-20 - [Timer Tick Performance Sink in Dashboard]
**Learning:** Components with frequent state updates (like `extractionTimeMs` updating every 100ms during the Dashboard's extraction phase) can cause severe synchronous main thread blocking if derived data (like parsing extraction feeds or re-extracting dynamic prompts) isn't memoized.
**Action:** Always wrap heavy derived computations in `useMemo` and inline functions in `useCallback` when a component relies on interval timers or high-frequency ticks to decouple visual updates from business logic execution.
