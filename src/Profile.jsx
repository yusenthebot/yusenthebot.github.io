import { useEffect, useRef, useState } from "react";
import {
  education,
  experience,
  profile,
  featuredProjects,
  projectCollections,
  creatorContent,
  zLab,
} from "./profile.js";
import RobotPortal from "./RobotPortal.jsx";

function Link({ href, children, className = "", internal = false, ...props }) {
  return (
    <a
      href={href}
      className={className}
      {...(!internal && { target: "_blank", rel: "noopener noreferrer" })}
      {...props}
    >
      {children}
    </a>
  );
}

function SectionHeading({ id, children, detail }) {
  return (
    <div className="resume-section-heading">
      <h2 id={id}>
        <span aria-hidden="true">[ </span>
        {children}
        <span aria-hidden="true"> ]</span>
      </h2>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function OrganizationLogo({ logo, name }) {
  return (
    <Link
      href={logo.href}
      className={`organization-logo organization-logo--${logo.theme || "light"}`}
      aria-label={`${name} website`}
    >
      <img
        src={`${import.meta.env.BASE_URL}images/logos/${logo.file}`}
        alt=""
        width="56"
        height="56"
        loading="lazy"
      />
    </Link>
  );
}

function Evidence({ image, onOpen, title }) {
  if (!image) return null;
  return (
    <figure className="resume-evidence">
      <button
        className="resume-evidence__image"
        type="button"
        onClick={() => onOpen({ ...image, title })}
        aria-label={`Enlarge image: ${title}`}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/${image.file}`}
          alt={image.alt}
          className={image.pixelated ? "pixel-image" : undefined}
          width={image.width}
          height={image.height}
          loading="lazy"
        />
        <span aria-hidden="true">↗</span>
      </button>
      <figcaption>{image.caption}</figcaption>
    </figure>
  );
}

function ImageViewer({ image, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      className="resume-image-viewer"
      ref={dialogRef}
      aria-label={`Image: ${image.title}`}
      onClose={(event) => {
        // A StrictMode cleanup can queue a close event before the dialog reopens.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current.close();
      }}
    >
      <div className="resume-image-viewer__bar">
        <span>{image.title}</span>
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current.close()}
          aria-label="Close image"
        >
          [ Close × ]
        </button>
      </div>
      <img
        src={`${import.meta.env.BASE_URL}images/${image.file}`}
        alt={image.alt}
        className={image.pixelated ? "pixel-image" : undefined}
        width={image.width}
        height={image.height}
      />
      <p>{image.caption}</p>
    </dialog>
  );
}

function ProjectScope({ items }) {
  return (
    <dl className="project-scope">
      {items.map((item) => (
        <div key={item.title}>
          <dt>{item.title}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

function FeaturedProject({ item, onOpen }) {
  return (
    <article
      className={`featured-project featured-project--${item.type}`}
      id={`project-${item.id}`}
    >
      <div className="featured-project__body">
        <p className="resume-entry__context">
          {item.period} / {item.context}
        </p>
        <div className="featured-project__heading">
          <h3>{item.title}</h3>
          {item.badge && <span className="project-license">{item.badge}</span>}
        </div>
        <p className="featured-project__subtitle">{item.subtitle}</p>
        <p className="resume-entry__description">{item.description}</p>
        {item.detail && <p className="resume-entry__detail">{item.detail}</p>}
        <ProjectScope items={item.scope} />
        <div className="resume-entry__links">
          <Link href={item.href}>{item.link} ↗</Link>
          {item.note && <span>{item.note}</span>}
          {item.licenseHref && (
            <Link href={item.licenseHref}>Apache 2.0 ↗</Link>
          )}
        </div>
      </div>
      <Evidence image={item.image} onOpen={onOpen} title={item.title} />
    </article>
  );
}

function ProjectCollection({ collection, open, onToggle, onOpen }) {
  return (
    <details
      className="project-collection"
      open={open}
      onToggle={(event) => onToggle(collection.id, event.currentTarget.open)}
    >
      <summary
        aria-label={`${collection.title}, ${collection.projects.length} projects`}
      >
        <span className="collection-toggle" aria-hidden="true" />
        <span className="collection-summary">
          <span className="collection-title">
            {collection.title}{" "}
            <span>{String(collection.projects.length).padStart(2, "0")}</span>
          </span>
          <span className="collection-preview">
            {collection.projects.map((item) => item.title).join(" / ")}
          </span>
        </span>
        <span className="collection-action" aria-hidden="true" />
      </summary>
      <div className="collection-content">
        <p>{collection.description}</p>
        <div className="collection-grid">
          {collection.projects.map((item) => (
            <article
              className="collection-project"
              id={`project-${item.id}`}
              key={item.id}
            >
              <p className="resume-entry__period">{item.period}</p>
              <h4>
                {item.href ? (
                  <Link href={item.href}>{item.title} ↗</Link>
                ) : (
                  item.title
                )}
              </h4>
              <p className="resume-entry__description">{item.description}</p>
              {item.detail && (
                <p className="resume-entry__detail">{item.detail}</p>
              )}
              <Evidence image={item.image} title={item.title} onOpen={onOpen} />
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}

function CreatorCollection({ collection, onOpen }) {
  return (
    <div className="creator-collection">
      <div
        className={`creator-nine-grid creator-nine-grid--${collection.channelId}`}
        role="group"
        aria-label={collection.title}
      >
        {collection.items.map((item) => (
          <button
            className="creator-tile"
            type="button"
            key={item.id}
            onClick={() => onOpen(item)}
            aria-label={`Enlarge image: ${item.title}`}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/${item.thumbnailFile}`}
              alt={item.alt}
              width={item.width}
              height={item.height}
              loading="lazy"
            />
            <span>{item.shortTitle}</span>
          </button>
        ))}
      </div>
      <div className="creator-collection__heading">
        <h4>{collection.title}</h4>
        <button
          type="button"
          onClick={() => onOpen({ ...collection.image, title: collection.title })}
          aria-label={`View full grid: ${collection.title}`}
        >
          View full grid ↗
        </button>
      </div>
      <p>{collection.description}</p>
    </div>
  );
}

function CreatorSection({ onOpen }) {
  return (
    <section className="resume-section creator-section" id="creator" aria-labelledby="creator-title">
      <SectionHeading id="creator-title" detail="Science communication">
        AI & Robotics
      </SectionHeading>
      <p className="creator-intro">{creatorContent.introduction}</p>
      <div className="creator-platforms">
        {creatorContent.channels.map((channel) => {
          const collection = creatorContent.collections.find(
            (item) => item.channelId === channel.id,
          );
          return (
            <article className="creator-platform" key={channel.id}>
              <div className={`creator-channel creator-channel--${channel.id}`}>
                <div>
                  <h3><span lang="zh-CN">{channel.platform}</span> / {channel.english}</h3>
                  <p>@{channel.handle} <span>· ID {channel.accountId}</span></p>
                </div>
                <div className="creator-channel__links">
                  {channel.href && <Link href={channel.href}>Visit profile ↗</Link>}
                  <button type="button" onClick={() => onOpen(channel.code)} aria-label={`Show ${channel.english} profile code`}>
                    Scan to follow ↗
                  </button>
                </div>
              </div>
              {collection && <CreatorCollection collection={collection} onOpen={onOpen} />}
            </article>
          );
        })}
      </div>
      <div className="resume-entry__links">
        <Link href={profile.x}>X · @YusenTheBot ↗</Link>
      </div>
    </section>
  );
}

export default function Profile({ openCollections, onCollectionToggle }) {
  const [selectedImage, setSelectedImage] = useState(null);
  return (
    <div className="profile-page" id="top">
      <a className="skip-content" href="#profile-content">
        Skip to content
      </a>
      <header className="resume-toolbar">
        <div className="resume-toolbar__inner">
          <a
            href="#top"
            className="resume-home"
            aria-label="Yusen Xie, back to top"
          >
            <span aria-hidden="true">&gt;_</span> yusen / résumé
          </a>
          <nav className="view-switch" aria-label="View">
            <a href="#/" aria-current="page">
              Portfolio
            </a>
            <a id="open-terminal" href="#/terminal">
              Terminal ↗
            </a>
          </nav>
        </div>
      </header>
      <main className="resume-document" id="profile-content" tabIndex={-1}>
        <section className="resume-identity" aria-labelledby="profile-name">
          <div className="resume-identity__text">
            <h1 id="profile-name" tabIndex={-1}>
              Yusen Xie
              <span className="resume-cursor" aria-hidden="true">
                _
              </span>
            </h1>
            <p className="resume-position">
              Partner at <Link href={profile.company}>ZENO AI ↗</Link>
            </p>
            <div className="resume-roles">
              <p className="resume-role">{profile.title}</p>
              <p className="resume-role">
                <Link href={zLab.href}>{zLab.role} ↗</Link>
              </p>
            </div>
            <p className="resume-intro">{profile.introduction}</p>
            <div className="resume-socials">
              <a href={`mailto:${profile.email}`}>Email ↗</a>
              <Link href={profile.github}>GitHub ↗</Link>
              <Link href={profile.linkedin}>LinkedIn ↗</Link>
              <Link href={profile.x}>X ↗</Link>
              <Link href={creatorContent.channels[0].href}><span lang="zh-CN">小红书</span> ↗</Link>
              <button type="button" onClick={() => setSelectedImage(creatorContent.channels[1].code)} aria-label="Show Douyin profile code">
                <span lang="zh-CN">抖音</span> ↗
              </button>
            </div>
          </div>
          {profile.portrait && (
            <Link
              className="resume-portrait"
              href={profile.linkedin}
              aria-label="Yusen Xie on LinkedIn"
            >
              <img
                src={`${import.meta.env.BASE_URL}images/${profile.portrait}`}
                alt="Yusen Xie"
                width="160"
                height="160"
                fetchPriority="high"
              />
            </Link>
          )}
        </section>

        <nav className="resume-index" aria-label="On this page">
          <a href="#experience">Experience</a>
          <a href="#education">Education</a>
          <a href="#work">Featured work</a>
          <a href="#creator">Science content</a>
          <a href="#more-work">Selected projects</a>
          <a href="#contact">Contact</a>
        </nav>

        <section
          className="resume-section"
          id="experience"
          aria-labelledby="experience-title"
        >
          <SectionHeading id="experience-title">Experience</SectionHeading>
          {experience.map((item) => (
            <article className="resume-entry career-entry" key={item.id}>
              <p className="resume-entry__period">{item.period}</p>
              <OrganizationLogo logo={item.logo} name={item.organization} />
              <div className="resume-entry__body">
                <h3>{item.organization}</h3>
                <p className="resume-entry__role">{item.role}</p>
                <p className="resume-entry__description">{item.description}</p>
                {item.initiative && (
                  <div className="resume-initiative">
                    <h4>{item.initiative.role}</h4>
                    <p className="resume-entry__description">
                      {item.initiative.description}
                    </p>
                    <div className="resume-entry__links">
                      <Link href={item.initiative.href}>zlab.bot ↗</Link>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>

        <section
          className="resume-section"
          id="education"
          aria-labelledby="education-title"
        >
          <SectionHeading id="education-title">Education</SectionHeading>
          {education.map((item) => (
            <article
              className="resume-entry education-entry"
              key={item.institution}
            >
              <p className="resume-entry__period">{item.period}</p>
              <OrganizationLogo logo={item.logo} name={item.institution} />
              <div className="resume-entry__body">
                <h3>{item.institution}</h3>
                <p className="resume-entry__description">{item.program}</p>
                <p className="resume-entry__detail">{item.detail}</p>
              </div>
            </article>
          ))}
        </section>

        <section
          className="resume-section"
          id="work"
          aria-labelledby="work-title"
        >
          <SectionHeading id="work-title">Featured work</SectionHeading>
          {featuredProjects.map((item) => (
            <FeaturedProject
              key={item.id}
              item={item}
              onOpen={setSelectedImage}
            />
          ))}
        </section>

        <CreatorSection onOpen={setSelectedImage} />

        <section
          className="resume-section"
          id="more-work"
          aria-labelledby="more-work-title"
        >
          <SectionHeading id="more-work-title" detail="Six selected projects">
            Selected projects
          </SectionHeading>
          <div className="project-collections">
            {projectCollections.map((collection) => (
              <ProjectCollection
                key={collection.id}
                collection={collection}
                open={Boolean(openCollections[collection.id])}
                onToggle={onCollectionToggle}
                onOpen={setSelectedImage}
              />
            ))}
          </div>
          <div className="resume-entry__links project-archive-link">
            <Link href={profile.github}>More on GitHub ↗</Link>
          </div>
        </section>

        <section className="resume-world" aria-labelledby="world-title">
          <RobotPortal />
          <div>
            <p className="resume-world__eyebrow">
              THE OTHER SIDE OF THIS WEBSITE
            </p>
            <h2 id="world-title">A little more me.</h2>
            <p>
              Meet V, explore my projects, and play around in the interactive
              Terminal.
            </p>
          </div>
        </section>

        <section
          className="resume-section resume-contact"
          id="contact"
          aria-labelledby="contact-title"
        >
          <SectionHeading id="contact-title">Get in touch</SectionHeading>
          <p>
            For collaborations, partnerships, or a conversation about what comes
            next.
          </p>
          <div className="resume-contact__links">
            <a href={`mailto:${profile.email}`}>{profile.email} ↗</a>
            <Link href={profile.x}>X · @YusenTheBot ↗</Link>
          </div>
        </section>
        <footer className="resume-footer">
          <span>Yusen Xie</span>
          <a href="#top">Back to top ↑</a>
        </footer>
      </main>
      {selectedImage && (
        <ImageViewer
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}
