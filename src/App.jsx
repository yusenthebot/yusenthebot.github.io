import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Profile from "./Profile.jsx";

const Terminal = lazy(() => import("./Terminal.jsx"));
const TERMINAL_HASH = "#/terminal";
const getHash = () => window.location.hash;

class TerminalBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Terminal could not open", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="terminal-gateway" role="alert">
          <h1>The terminal couldn’t open.</h1>
          <p>You can retry, or head back to my portfolio.</p>
          <button onClick={() => window.location.reload()}>Try again</button>
          <a href="#/">Back to Portfolio</a>
        </div>
      );
    }
    return this.props.children;
  }
}

function TerminalLoading() {
  return (
    <div className="terminal-gateway" role="status">
      <span className="terminal-loading-cursor" aria-hidden="true">
        _
      </span>
      <p>Opening Terminal…</p>
      <a href="#/">Back to Portfolio</a>
    </div>
  );
}

export default function App() {
  const [openCollections, setOpenCollections] = useState({});
  const onCollectionToggle = useCallback((id, open) => {
    setOpenCollections((current) =>
      Boolean(current[id]) === open ? current : { ...current, [id]: open },
    );
  }, []);
  const profileScroll = useRef(0);
  const profileTrigger = useRef(null);
  const previousView = useRef(null);
  const subscribe = useCallback((notify) => {
    const onProfileClick = (event) => {
      if (getHash() === TERMINAL_HASH || !(event.target instanceof Element)) return;
      const entry = event.target.closest(`a[href="${TERMINAL_HASH}"]`);
      if (entry) profileTrigger.current = entry.id || null;
    };
    const onHashChange = () => {
      if (getHash() === TERMINAL_HASH) profileScroll.current = window.scrollY;
      notify();
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onProfileClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onProfileClick);
    };
  }, []);
  const hash = useSyncExternalStore(subscribe, getHash);
  const view = hash === TERMINAL_HASH ? "terminal" : "profile";

  useLayoutEffect(() => {
    const returningToProfile = previousView.current === "terminal";
    previousView.current = view;
    document.title =
      view === "terminal"
        ? "Yusen Xie | Terminal"
        : "Yusen Xie | Partner at ZENO AI";
    if (view === "terminal") {
      window.scrollTo(0, 0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById(hash.slice(1));
      const collection = section?.closest("details");
      if (section) {
        if (collection) collection.open = true;
        section.scrollIntoView();
        if (collection) section.focus({ preventScroll: true });
      } else if (returningToProfile) {
        window.scrollTo(0, profileScroll.current);
      }
      if (returningToProfile && !collection) {
        const trigger = document.getElementById(profileTrigger.current);
        const target =
          section || trigger || document.getElementById("profile-name");
        target?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, view]);

  return view === "terminal" ? (
    <div className="terminal-shell">
      <TerminalBoundary>
        <Suspense fallback={<TerminalLoading />}>
          <Terminal />
        </Suspense>
      </TerminalBoundary>
    </div>
  ) : (
    <Profile
      openCollections={openCollections}
      onCollectionToggle={onCollectionToggle}
    />
  );
}
