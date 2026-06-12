// Terminal-styled loader shown while the lazy 3D chunk streams in.
// Kept in its own module so App can import it statically without pulling the
// heavy Scene/three code into the main bundle (keeps the lazy import effective).
// Monochrome, JetBrains Mono — matches the BOOTING line in the design spec.
export default function BootFallback() {
  const lines = [
    "> BOOTING UNIT V...",
    "> mounting kinematic tree",
    "> calibrating servos",
    "> [ ok ] render online",
  ];
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      <div className="text-left">
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              color: i === 0 ? "#fff" : "#666",
              fontSize: 12,
              letterSpacing: 1,
              lineHeight: 2,
            }}
          >
            {l}
            {i === lines.length - 1 && (
              <span style={{ animation: "blink-cursor 0.8s infinite" }}> _</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
