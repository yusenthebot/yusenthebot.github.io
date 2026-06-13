import * as THREE from "three";

// Strict monochrome contract: every color in the 3D layer must satisfy
// r==g==b. gray() is the only color constructor used here.
export function gray(v) {
  return new THREE.Color(v, v, v);
}

// Brushed subframe / hinges / pistons. Reads as tight ordered shimmer in dither.
export const brushedMetal = new THREE.MeshStandardMaterial({
  color: gray(0.66),
  metalness: 0.9,
  roughness: 0.32,
});

// Outer armor shells — the light-gray Optimus PANELS that ride over the black
// skeleton. DoubleSide so the inner face stays readable when a panel hinges
// open. Roughness low enough for real highlight masses — the dither needs
// bright regions to sculpt the form, and the panels must read clearly LIGHTER
// than the exposed black joints they cover.
export const mattePolymer = new THREE.MeshStandardMaterial({
  color: gray(0.68),
  metalness: 0.08,
  roughness: 0.6,
  side: THREE.DoubleSide,
});

// The black inner SKELETON + exposed mechanical joints (ball shoulders, elbow
// pads, pelvis actuator block, knee/ankle hinges). Pulled dark so the light
// panels above read as a distinct layer — the core Optimus light-over-black.
export const darkPolymer = new THREE.MeshStandardMaterial({
  color: gray(0.09),
  metalness: 0.2,
  roughness: 0.78,
  side: THREE.DoubleSide,
});

// The cranium DOME — a medium-dark matte helmet shell. Dark enough to read as
// a sleek Optimus helmet (clearly LOWER luma than the body's light panels) but
// not so dark it dissolves into the void: it dithers to a distinct mid-dark
// gray so the head keeps a readable silhouette. High roughness + zero metal so
// the rim light can't flare its edge into a bright "hair-flick" crescent — it
// just falls off softly to the dark visor. Pairs with the near-black visor:
// dark dome + dark visor + one thin bright seam = the blank Optimus head.
export const darkHelmet = new THREE.MeshStandardMaterial({
  color: gray(0.13),
  metalness: 0.0,
  roughness: 0.98,
  side: THREE.DoubleSide,
});

// Visor. No transmission (too heavy) — near-black clearcoat with very low
// roughness reads as glass; depthWrite off so the emissive eye rings behind
// it can still bloom through. Opacity pushed HIGH and base color to true
// black so the face resolves as a near-black mass under the dither floor —
// the visor must be the darkest panel of the figure (a blank Optimus visor),
// NOT a pale dithered oval. clearcoat keeps a single tight specular glint so
// it still reads as glossy glass, not flat paint. The eye rings (toneMapped
// off, bloomed) are the only thing that escapes the visor's darkness, and
// only when an interaction state pushes them bright.
export const darkGlass = new THREE.MeshPhysicalMaterial({
  color: gray(0.0),
  metalness: 0.0,
  // matte near-black: high roughness, NO clearcoat. The old glossy clearcoat
  // threw tight specular glints across the visor that dithered into bright
  // dots reading as faint eyes/sparkle on the face. A pure matte black visor
  // resolves as one clean near-black mass under the dither's shadow floor —
  // the blank dark Optimus face. The eye rings (toneMapped emissive) are the
  // ONLY thing that punches through, and only when an interaction state flares
  // them; at idle the face stays a featureless dark panel.
  roughness: 0.85,
  clearcoat: 0.0,
  transparent: true,
  opacity: 0.98,
  depthWrite: false,
});

// The core. toneMapped off so the bloom pass keys off raw HDR values —
// the one smooth-white hole punched in the dither world.
export const emissiveCore = new THREE.MeshStandardMaterial({
  color: gray(1),
  emissive: gray(1),
  emissiveIntensity: 2.8,
  toneMapped: false,
});

// The ONE accent: Optimus' cyan face/neck seam, translated to a thin WHITE
// EMISSIVE line. toneMapped off so its bloomed pixels exceed the dither
// bypass-luma and escape the Bayer pass (same trick as the core/eye rings) —
// the seam reads as a clean glowing edge, not a dot-stippled gray. Lower
// intensity than the core: it's a hairline, not a hole in the world.
export const brightEmissiveSeam = new THREE.MeshStandardMaterial({
  color: gray(1),
  emissive: gray(1),
  emissiveIntensity: 2.2,
  toneMapped: false,
});

// Bright machined inner edges — what makes an opened shell read as solid stock.
export const innerLip = new THREE.MeshStandardMaterial({
  color: gray(0.847),
  metalness: 0.85,
  roughness: 0.25,
});

// Per-part clone so hover can brighten one part's edge without touching the rest.
export function makeLip() {
  const m = innerLip.clone();
  m.emissive = gray(1);
  m.emissiveIntensity = 0;
  return m;
}

export function makeEmissive(intensity = 1.8) {
  return new THREE.MeshStandardMaterial({
    color: gray(1),
    emissive: gray(1),
    emissiveIntensity: intensity,
    toneMapped: false,
  });
}
