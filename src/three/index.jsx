import Scene from "./Scene.jsx";
import BootFallback from "./BootFallback.jsx";

// Re-exported for convenience; App should import it from ./BootFallback.jsx
// directly so the lazy import of this module stays effective (no static pull).
export { BootFallback };

// Right-panel 3D entry point. App lazy-imports this; it composes the Scene.
// Subsystem components are added as children of <Scene> here during integrate.
export default function VPanel() {
  return <Scene />;
}
