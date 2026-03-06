export class DecayEngine {
  /**
   * Applies exponential decay with category-specific lambda and strength.
   * If lambda === 0, no decay is applied.
   */
  calculateScore(
    originalScore: number,
    lastAccessed: number,
    lambda: number,
    strength = 1,
  ): number {
    if (lambda === 0) {
      return originalScore * strength;
    }

    const now = Date.now();
    const deltaT = now - lastAccessed;
    return (originalScore * strength) * Math.exp(-lambda * deltaT);
  }
}
