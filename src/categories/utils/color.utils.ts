/**
 * Lightens a hex color by a given percentage
 * @param hex - Hex color string (e.g., '#FF5733')
 * @param percent - Percentage to lighten (0-100)
 * @returns Lightened hex color string
 */
export function lightenColor(hex: string, percent: number = 20): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Lighten by percentage
  const newR = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
  
  // Convert back to hex
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * Gets the next subcategory color by lightening the parent or last sibling color
 * @param parentColor - Parent category color
 * @param existingSubcategories - Array of existing subcategories with color property
 * @returns Next color for new subcategory
 */
export function getNextSubcategoryColor(
  parentColor: string | null | undefined,
  existingSubcategories: Array<{ color: string | null }>
): string {
  const baseColor = parentColor || '#95A5A6'; // Default gray if no parent color
  
  if (!existingSubcategories || existingSubcategories.length === 0) {
    // First subcategory: lighten parent by 20%
    return lightenColor(baseColor, 20);
  }
  
  // Get the last subcategory's color
  const lastSubcategory = existingSubcategories[existingSubcategories.length - 1];
  const lastColor = lastSubcategory?.color || baseColor;
  
  // Lighten the last subcategory color by 15% more
  return lightenColor(lastColor, 15);
}