import * as THREE from "three";

// Strict monochrome contract: every color in the 3D layer must satisfy
// r==g==b. gray() is the only color constructor used here.
export function gray(v) {
  return new THREE.Color(v, v, v);
}

// Brushed subframe / hinges / pistons. Reads as tight ordered shimmer in dither.
export const brushedMetal = new THREE.MeshStandardMaterial({
  color: gray(0.62),
  metalness: 0.9,
  roughness: 0.35,
});

// Outer armor shells. DoubleSide so the inner face stays readable when a
// panel hinges open.
export const mattePolymer = new THREE.MeshStandardMaterial({
  color: gray(0.604),
  metalness: 0.08,
  roughness: 0.8,
  side: THREE.DoubleSide,
});

// Actuator housings, internal frames, recessed panels.
export const darkPolymer = new THREE.MeshStandardMaterial({
  color: gray(0.11),
  metalness: 0.2,
  roughness: 0.75,
  side: THREE.DoubleSide,
});

// Visor. No transmission (too heavy) — near-black clearcoat with low
// roughness reads as glass; depthWrite off so the emissive eye rings
// behind it blend through.
export const darkGlass = new THREE.MeshPhysicalMaterial({
  color: gray(0.02),
  metalness: 0.25,
  roughness: 0.08,
  clearcoat: 1.0,
  clearcoatRoughness: 0.06,
  transparent: true,
  opacity: 0.45,
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
