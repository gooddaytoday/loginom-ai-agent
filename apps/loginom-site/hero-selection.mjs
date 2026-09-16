// Persist the NEXT scene, using stable names so stored values are unambiguous.
export const HERO_VARIANTS = Object.freeze(['clouds', 'glyphs', 'ribbons', 'voids']);
export const HERO_STORAGE_KEY = 'loginom-dock.hero.next-variant.v1';

export function variantAfter(variant) {
  return HERO_VARIANTS[(HERO_VARIANTS.indexOf(variant) + 1) % HERO_VARIANTS.length];
}

export function persistNextVariant(storage, selected) {
  try {
    storage?.setItem(HERO_STORAGE_KEY, variantAfter(selected));
  } catch { /* Render the selected scene even when persistence is unavailable. */ }
}

export function selectNextVariant(storage) {
  let index = 0;
  try {
    const stored = storage?.getItem(HERO_STORAGE_KEY);
    const savedIndex = HERO_VARIANTS.indexOf(stored);
    if (savedIndex >= 0) index = savedIndex;
  } catch { /* Storage can be disabled without disabling the landing. */ }
  persistNextVariant(storage, HERO_VARIANTS[index]);
  return HERO_VARIANTS[index];
}
