// Legacy store replaced by modular slices in createRootStore.
// Re-export new hook under old name for compatibility.
export { useRootStore as useStore } from './createRootStore';
