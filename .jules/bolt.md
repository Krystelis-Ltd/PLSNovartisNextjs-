## 2024-04-21 - Memoize Derived Data Linked to Timers
**Learning:** Components containing frequent interval timer state updates (e.g., `100ms` ticks) will synchronously trigger heavy derived computations on every tick if those computations are not memoized, blocking the main thread.
**Action:** Always wrap derived data calculations and props (such as filtering large arrays or defining component functions) in `useMemo` and `useCallback` when those properties live in a component with aggressive background `setInterval` state updates.
