/** Yields one frame so spinners paint before CPU-heavy crypto work. */
export const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80));
