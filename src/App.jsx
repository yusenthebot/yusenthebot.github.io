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
const getView = () =>
  window.location.hash === "#/terminal" ? "terminal" : "profile";

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
      if (getView() !== "profile" || !(event.target instanceof Element)) return;
      const entry = event.target.closest('a[href="#/terminal"]');
      if (entry) profileTrigger.current = entry.id || null;
    };
    const onHashChange = () => {
      if (getView() === "terminal") profileScroll.current = window.scrollY;
      notify();
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onProfileClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onProfileClick);
    };
  }, []);
  const view = useSyncExternalStore(subscribe, getView);

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
      const section = document.getElementById(window.location.hash.slice(1));
      if (section) section.scrollIntoView();
      else window.scrollTo(0, profileScroll.current);
      if (returningToProfile) {
        const trigger = document.getElementById(profileTrigger.current);
        const target =
          section || trigger || document.getElementById("profile-name");
        target?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);

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
