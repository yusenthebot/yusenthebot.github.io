# Yusen Xie — Visual résumé & Terminal

A visual résumé is the default view, using the Terminal's JetBrains Mono and VT323
fonts on a light surface. It presents six work/research entries, two education
entries with official institution marks, two featured cases and two expandable
collections containing six selected projects. A personal science-communication
section adds Xiaohongshu and Douyin account entries, each with a 3×3 gallery:
nine original technical diagrams and nine distinct episode frames. Every tile and
the full grid can be enlarged. The supplied portrait appears in the header.
An animated V entry opens the optional interactive Terminal.

## Local development

```sh
npm install
npm run dev
npm run build
npm run preview
```

## Views

- `/`: résumé, selected work and contact links.
- `/#/terminal`: pre-rendered intro, V, commands, games and audio.
- `/#experience`, `/#education`, `/#work`, `/#creator`, `/#more-work`, `/#contact`: section anchors.

Hash navigation works on GitHub Pages without server rewrites. Browser Back/Forward
switches views; returning to the résumé restores its scroll position. Terminal
JavaScript and video load only on entry. Leaving cancels pending timers, animations
and audio. Reduced-motion and data-saving preferences skip the intro.

Collection summaries show every project name before expansion. Multiple collections
can stay open; their state survives a visit to Terminal and back.

The locally hosted robot GIF only animates while visible, with pause and reduced
motion/data-saving fallbacks. Selected-work images open in a native dialog with
keyboard/Escape support. Print styling omits navigation and the robot entry.

## Editing

- `src/profile.js`: identity, work, education, project selection and image captions.
- `src/Profile.jsx` and `src/profile.css`: résumé, image viewer and light styling.
- `src/RobotPortal.jsx`: animated companion and Terminal entry.
- `src/App.jsx`: view selection, lazy loading and focus/scroll restoration.
- `src/Terminal.jsx`: interactive portfolio and intro/session state.
- `src/intro.jsx` and `public/media`: responsive pre-rendered intro.
- `public/images`: original project images; provenance in `docs/PORTFOLIO_SOURCES.md`.

Work and education were checked against the owner's LinkedIn; Vector's unspecified
dates remain unspecified. CMU remains in progress. Junyun and the Chinese name are
excluded at the owner's request. The portrait and social profile codes were supplied
by the owner. The Xiaohongshu link was resolved from its code; Douyin uses its
original scan card and account ID. Xiaohongshu topics were checked on the public
profile; the diagrams use local originals. Douyin frames represent locally produced
work; publication of those episodes has not been independently verified.

## Publishing

Pushing to `main` runs `.github/workflows/deploy.yml` to build and deploy GitHub Pages.
The visual résumé is the published entry page; the interactive Terminal remains
available from its navigation and robot entry.
