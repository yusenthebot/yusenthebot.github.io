import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const connection = navigator.connection;
const subscribeMotion = (notify) => {
  reducedMotion.addEventListener("change", notify);
  connection?.addEventListener("change", notify);
  return () => {
    reducedMotion.removeEventListener("change", notify);
    connection?.removeEventListener("change", notify);
  };
};
const getMotionPreference = () =>
  reducedMotion.matches || Boolean(connection?.saveData);
const subscribeVisibility = (notify) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const getPageVisibility = () => !document.hidden;

export default function RobotPortal() {
  const frame = useRef(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const staticPreferred = useSyncExternalStore(
    subscribeMotion,
    getMotionPreference,
  );
  const pageVisible = useSyncExternalStore(
    subscribeVisibility,
    getPageVisibility,
  );
  const animated =
    !paused && !staticPreferred && visible && pageVisible && !failed;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      className="robot-portal"
      ref={frame}
      aria-label="Enter my interactive world"
    >
      <a
        id="robot-terminal-image"
        className="robot-portal__image"
        href="#/terminal"
        aria-label="Enter my world — interactive Terminal"
      >
        <img
          src={`${import.meta.env.BASE_URL}images/${animated ? "v-robot.gif" : "v-portrait.webp"}`}
          alt="V, my pixel robot companion"
          width="1268"
          height="1436"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </a>
      <a
        id="robot-terminal-entry"
        className="robot-portal__enter"
        href="#/terminal"
      >
        Enter my world <span aria-hidden="true">↗</span>
      </a>
      <div className="robot-portal__control">
        {staticPreferred || failed ? (
          <span>Still portrait</span>
        ) : (
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={
              paused ? "Play robot animation" : "Pause robot animation"
            }
          >
            <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>{" "}
            {paused ? "Play" : "Pause"}
          </button>
        )}
      </div>
    </aside>
  );
}
