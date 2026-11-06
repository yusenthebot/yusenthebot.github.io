import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const STARTUP_TIMEOUT_MS = 2000;
const STALL_TIMEOUT_MS = 2000;
const OVERALL_TIMEOUT_MS = 7000;

const ASPECT_QUERY = "(max-aspect-ratio: 3/2)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMedia(onChange) {
  const queries = [ASPECT_QUERY, MOTION_QUERY].map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener("change", onChange));
  navigator.connection?.addEventListener("change", onChange);
  return () => {
    queries.forEach((query) => query.removeEventListener("change", onChange));
    navigator.connection?.removeEventListener("change", onChange);
  };
}

function chooseVariant() {
  if (
    window.matchMedia(MOTION_QUERY).matches ||
    navigator.connection?.saveData
  ) return null;

  return window.matchMedia(ASPECT_QUERY).matches
    ? "portrait"
    : "desktop";
}

export default function IntroSequence({ onComplete }) {
  const videoRef = useRef(null);
  const skipRef = useRef(null);
  const completeRef = useRef(onComplete);
  const finishedRef = useRef(false);
  const playheadRef = useRef(0);
  const variant = useSyncExternalStore(subscribeMedia, chooseVariant);
  const mediaPath = `${import.meta.env.BASE_URL}media/intro-${variant}`;

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    videoRef.current?.pause();
    completeRef.current?.();
  }, []);

  useEffect(() => {
    if (!variant) {
      finish();
      return;
    }
    const video = videoRef.current;
    let disposed = false;
    let lastTime = -1;
    let restoring = video.readyState < 1;
    const resumeTime = playheadRef.current;
    let stallTimer;
    const startupTimer = setTimeout(finish, STARTUP_TIMEOUT_MS);
    const overallTimer = setTimeout(finish, OVERALL_TIMEOUT_MS);
    const resume = () => {
      if (resumeTime > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - 0.1));
      }
      restoring = false;
    };

    const advancing = () => {
      if (restoring || video.currentTime <= 0 || video.currentTime <= lastTime) return;
      lastTime = video.currentTime;
      playheadRef.current = video.currentTime;
      clearTimeout(startupTimer);
      clearTimeout(stallTimer);
      stallTimer = setTimeout(finish, STALL_TIMEOUT_MS);
    };
    const keydown = (event) => {
      if (event.key === "Escape") finish();
    };
    const visibility = () => {
      if (document.hidden) finish();
    };

    video.addEventListener("timeupdate", advancing);
    video.addEventListener("loadedmetadata", resume);
    if (video.readyState >= 1) resume();
    document.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", visibility);
    skipRef.current?.focus({ preventScroll: true });
    video.muted = true;
    const playback = video.play();
    playback?.catch(() => {
      if (!disposed) finish();
    });

    return () => {
      disposed = true;
      clearTimeout(startupTimer);
      clearTimeout(stallTimer);
      clearTimeout(overallTimer);
      video.removeEventListener("loadedmetadata", resume);
      video.removeEventListener("timeupdate", advancing);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      video.pause();
    };
  }, [variant, finish]);

  if (!variant) return null;

  return (
    <section className="video-intro" aria-label="Introduction" onClick={finish}>
      <video
        ref={videoRef}
        src={`${mediaPath}.mp4`}
        poster={`${mediaPath}.jpg`}
        autoPlay
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
        onEnded={finish}
        onError={finish}
        className="video-intro__film"
      />
      <div className="video-intro__topline" aria-hidden="true">YUSEN XIE / PERSONAL TERMINAL</div>
      <div className="video-intro__identity">
        <p>Partner at ZENO AI</p>
        <p>Head of Brand, Comms &amp; Partnerships</p>
        <p className="video-intro__website">
          <a href="https://zenobot.ai/" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
            zenobot.ai <span aria-hidden="true">↗</span>
          </a>
          <span className="video-intro__credit">Made by me lol</span>
        </p>
      </div>
      <button ref={skipRef} className="video-intro__skip" onClick={finish}>
        SKIP INTRO <span aria-hidden="true">↗</span>
      </button>
    </section>
  );
}
