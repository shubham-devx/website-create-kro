"use strict";

// Security: Prevent accidental globals
if (typeof window !== "undefined") {
  Object.defineProperty(window, "__PORTFOLIO_BNAO_SECURE__", {
    value: true,
    writable: false,
    configurable: false,
  });
}

const STORAGE_KEY = "portfolio-bnao-draft-v1";
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for safety
const MAX_INPUT_LENGTH = 1000;
const MAX_LIST_ITEMS = 20;
const MAX_SKILLS_ITEMS = 12;
const MAX_URL_LENGTH = 200;

// Element references with null checks
const form = document.querySelector("#portfolioForm");
const preview = document.querySelector("#portfolioPreview");
const saveStatus = document.querySelector("#saveStatus");
const aboutCount = document.querySelector("#aboutCount");
const toast = document.querySelector("#toast");
const photoFile = document.querySelector("#profilePhotoFile");
const photoInput = form?.elements?.namedItem("profilePhoto");
const photoThumbnail = document.querySelector("#photoThumbnail");
const removePhotoButton = document.querySelector("#removePhoto");
const exportSection = document.querySelector("#portfolioExport");
const registrationDialog = document.querySelector("#registrationDialog");
const registrationForm = document.querySelector("#registrationForm");
const registrationError = document.querySelector("#registrationError");

// Validate critical elements exist
if (!form || !preview) {
  console.error("Critical form elements missing. Application cannot initialize.");
  document.body.innerHTML = "<p>Error: Application failed to initialize.</p>";
  throw new Error("Missing required DOM elements");
}

let saveTimer;
let toastTimer;
let generatedPortfolio = "";
let generatedCanonicalUrl = "";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePortfolioZip(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  let offset = 0;
  const u16 = (view, at, value) => view.setUint16(at, value, true);
  const u32 = (view, at, value) => view.setUint32(at, value, true);

  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50); u16(localView, 4, 20); u16(localView, 6, 0x0800);
    u16(localView, 8, 0); u32(localView, 14, checksum); u32(localView, 18, data.length); u32(localView, 22, data.length);
    u16(localView, 26, nameBytes.length); local.set(nameBytes, 30);
    chunks.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50); u16(centralView, 4, 20); u16(centralView, 6, 20);
    u16(centralView, 8, 0x0800); u16(centralView, 10, 0); u32(centralView, 16, checksum);
    u32(centralView, 20, data.length); u32(centralView, 24, data.length); u16(centralView, 28, nameBytes.length);
    u32(centralView, 42, offset); central.set(nameBytes, 46);
    directory.push(central);
    offset += local.length + data.length;
  }

  const directorySize = directory.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50); u16(endView, 8, directory.length); u16(endView, 10, directory.length);
  u32(endView, 12, directorySize); u32(endView, 16, offset);
  return new Blob([...chunks, ...directory, end], { type: "application/zip" });
}

function downloadPortfolioZip() {
  if (!generatedPortfolio) return;
  const readme = `# Your Portfolio\n\nThis is a self-contained static website generated with Website Create Kro. Its styles and any profile photo are included in the page; no build tools or runtime dependencies are required.\n\n## Preview locally\n\nOpen index.html in a modern web browser.\n\n## Deploy\n\nUpload the contents of this folder to any static hosting provider. The entry page is index.html and no build command is needed.\n\n## Search visibility\n\nThe page includes a search title and description, social sharing metadata, and structured profile data based only on details entered in the builder. When a public URL is provided, robots.txt and sitemap.xml are also included. After deployment, submit the public URL to your search provider for indexing. Search engines determine when and where a page appears; metadata cannot guarantee rankings.\n`;
  const entries = [["index.html", generatedPortfolio], ["README.md", readme]];
  if (generatedCanonicalUrl) {
    const origin = new URL(generatedCanonicalUrl).origin;
    entries.push(["robots.txt", `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`]);
    entries.push(["sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${generatedCanonicalUrl}</loc></url></urlset>\n`]);
  }
  const blob = makePortfolioZip(entries);  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-portfolio.zip";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const themeColors = {
  violet: "#7660ca",
  green: "#5d9874",
  orange: "#d8865d",
};

const fontFamilies = {
  modern: "Arial, Helvetica, sans-serif",
  editorial: "Georgia, 'Times New Roman', serif",
  classic: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'Courier New', monospace",
};

// Security: Sanitize input length
function sanitizeLength(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.substring(0, maxLength || MAX_INPUT_LENGTH);
}

function readForm() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).substring(0, MAX_INPUT_LENGTH);
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttribute(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function safeUrl(value) {
  const trimmed = String(value ?? "").trim().substring(0, MAX_URL_LENGTH);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    // Validate against malicious patterns
    const href = url.href;
    if (href.includes("javascript:") || href.includes("data:") || href.includes("vbscript:")) {
      return "";
    }
    return href;
  } catch {
    return "";
  }
}

function normalizeCanonicalUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return "";
  try {
    const url = new URL(safe);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function renderPremiumPortfolio(data) {
  const name = sanitizeLength(data.name?.trim() || "Your Name", 60);
  const role = sanitizeLength(data.role?.trim() || "Portfolio", 80);
  const email = sanitizeLength(data.email?.trim() || "", 120);
  const phone = sanitizeLength(data.phone?.trim() || "", 30);
  const location = sanitizeLength(data.location?.trim() || "", 80);
  const about = sanitizeLength(data.about?.trim() || "", 700);
  const seoTitle = sanitizeLength(data.seoTitle?.trim() || `${name} — ${role}`, 60);
  const seoDescription = sanitizeLength(data.seoDescription?.trim() || about || `${name} — ${role}. Explore selected work and get in touch.`, 160);
  const canonicalUrl = normalizeCanonicalUrl(data.canonicalUrl);
  const photo = /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(data.profilePhoto || "") ? data.profilePhoto : "";
  const palette = { violet: ["#a995ff", "#100f16"], green: ["#a7d88c", "#101510"], orange: ["#ffad7a", "#17110e"] };
  const [accent, dark] = palette[data.theme] || palette.violet;
  const fonts = { modern: "Arial, Helvetica, sans-serif", editorial: "Georgia, 'Times New Roman', serif", classic: "system-ui, sans-serif", mono: "'Courier New', monospace" };
  const font = fonts[data.font] || fonts.modern;
  const designs = ["awwwards", "apple", "cinematic", "swiss", "brutalist", "luxury", "developer", "designer", "future", "bento"];
  const contentText = `${role} ${data.about || ""} ${data.skills || ""} ${data.project1 || ""}`.toLowerCase();
  const inferred = /photograph|film|camera/.test(contentText) ? "cinematic" : /design|ux|ui|visual|art director/.test(contentText) ? "designer" : /develop|engineer|program|software|frontend|backend|data/.test(contentText) ? "developer" : /business|consult|finance|law|strategy|executive/.test(contentText) ? "luxury" : /market|brand|growth|content/.test(contentText) ? "awwwards" : "swiss";
  const design = data.design === "auto" || !designs.includes(data.design) ? inferred : data.design;
  const projects = [1, 2].map((n) => ({ name: sanitizeLength(data[`project${n}`]?.trim() || "", 90), description: sanitizeLength(data[`project${n}Description`]?.trim() || "", 180) })).filter((p) => p.name);
  const skills = [...(data.skills || "").split(","), ...(data.otherSkills || "").split(",")].map((s) => sanitizeLength(s.trim(), 50)).filter(Boolean).slice(0, 24);
  const experience = (data.experience || "").split(/\r?\n/).map((s) => sanitizeLength(s.trim(), 300)).filter(Boolean).slice(0, 20);
  const education = (data.education || "").split(/\r?\n/).map((s) => sanitizeLength(s.trim(), 300)).filter(Boolean).slice(0, 20);
  const links = [
    ["LinkedIn", safeUrl(data.linkedin)], ["GitHub", safeUrl(data.github)], ["Website", safeUrl(data.website)],
    [sanitizeLength(data.otherLinkLabel?.trim() || "More", 35), safeUrl(data.otherLink)],
  ].filter(([, url]) => url);
  const docs = [["Resume", safeUrl(data.resume)], ["Certificate", safeUrl(data.certificate)]].filter(([, url]) => url);
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    ...(data.role?.trim() ? { jobTitle: role } : {}),
    description: seoDescription,
    ...(email ? { email } : {}),
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    ...(skills.length ? { knowsAbout: skills } : {}),
    ...(links.length ? { sameAs: links.map(([, url]) => url) } : {}),
  };
  const structuredData = JSON.stringify(personSchema).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const esc = escapeHtml;
  const projectsHtml = projects.length ? projects.map((p, i) => `<article class="work-item reveal" id="project-${i + 1}" tabindex="0"><div class="work-art art-${i + 1}" aria-hidden="true"><span>0${i + 1}</span><i></i></div><div class="work-meta"><div><span class="eyebrow">SELECTED WORK</span><h3>${esc(p.name)}</h3>${p.description ? `<p>${esc(p.description)}</p>` : ""}</div><span class="work-arrow" aria-hidden="true">↗</span></div></article>`).join("") : `<article class="work-item empty-work"><div class="work-art art-1" aria-hidden="true"><span>+</span><i></i></div><div class="work-meta"><div><span class="eyebrow">YOUR WORK</span><h3>Projects take shape here</h3><p>Add a project in the builder to feature it in this space.</p></div></div></article>`;
  const sliderControls = projects.length > 1 ? `<div class="slider-controls" aria-label="Project slider controls"><div class="slider-dots">${projects.map((_, i) => `<a href="#project-${i + 1}" aria-label="Show project ${i + 1}">${String(i + 1).padStart(2, "0")}</a>`).join("")}</div><div class="slider-arrows"><a href="#project-1" aria-label="Previous project">←</a><a href="#project-${projects.length}" aria-label="Next project">→</a></div></div>` : "";
  const skillsHtml = skills.length ? skills.map((s) => `<span class="skill">${esc(s)}</span>`).join("") : `<span class="skill skill-muted">Add skills in the builder</span>`;
  const timelineHtml = experience.map((e, i) => `<li class="timeline-item reveal"><span class="timeline-index">${String(i + 1).padStart(2, "0")}</span><p>${esc(e)}</p></li>`).join("");
  const educationHtml = education.map((e) => `<li>${esc(e)}</li>`).join("");
  const contactEmail = email ? `<a class="contact-link" href="mailto:${escapeAttribute(email)}">${esc(email)} <span>↗</span></a>` : "";
  const contactPhone = phone ? `<a class="contact-link" href="tel:${escapeAttribute(phone.replace(/[^\d+]/g, ""))}">${esc(phone)} <span>↗</span></a>` : "";
  const socialHtml = links.map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span>↗</span></a>`).join("");
  const docsHtml = docs.map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join("");
  const heading = name.split(/\s+/).map(esc).join("<br>");
  const css = `
    :root{--ink:${dark};--paper:#f2f0e9;--muted:#a7a49d;--accent:${accent};--line:rgba(255,255,255,.14);--display:${font};color-scheme:dark}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:30px}body{margin:0;background:var(--ink);color:var(--paper);font-family:var(--display);font-size:16px;line-height:1.6;overflow-x:hidden}a{color:inherit}button,a{-webkit-tap-highlight-color:transparent}::selection{background:var(--accent);color:var(--ink)}
    .site{max-width:1440px;margin:auto;padding:0 clamp(22px,7vw,108px)}.top{height:84px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.brand{font-size:13px;font-weight:700;letter-spacing:.08em;text-decoration:none}.brand-mark{color:var(--accent);margin-right:9px}.nav{display:flex;align-items:center;gap:clamp(16px,3vw,42px)}.nav a,.nav summary{font-size:12px;color:var(--muted);text-decoration:none;cursor:pointer}.nav a:hover,.nav summary:hover{color:var(--paper)}.nav details{position:relative}.nav details[open] .nav-menu{position:absolute;right:0;top:30px;z-index:3;display:grid;gap:12px;min-width:170px;padding:16px;background:#25232b;border:1px solid var(--line);border-radius:12px}.nav-menu{display:none}.nav details[open] summary{color:var(--paper)}.theme-toggle{width:31px;height:31px;border:1px solid var(--line);border-radius:50%;display:grid;place-items:center;color:var(--accent);cursor:pointer}.theme-toggle input{position:absolute;width:1px;height:1px;opacity:0}.theme-toggle:focus-within{outline:2px solid var(--accent);outline-offset:3px}.theme-toggle:has(input:checked){background:var(--accent);color:var(--ink)}body:has(#accentSwitch:checked){--accent:#ffcf78}
    .hero{min-height:min(760px,calc(100svh - 84px));display:grid;grid-template-columns:minmax(0,1.15fr) minmax(230px,.85fr);align-items:center;gap:5vw;padding:clamp(68px,10vw,150px) 0 110px;position:relative;isolation:isolate}.hero:before{content:"";position:absolute;z-index:-1;width:55vw;height:55vw;max-width:720px;max-height:720px;right:-20%;top:4%;border-radius:50%;background:radial-gradient(circle, color-mix(in srgb,var(--accent) 18%, transparent),transparent 68%);filter:blur(10px);animation:drift 14s ease-in-out infinite alternate}.hero-copy{position:relative}.eyebrow{font:600 10px/1.3 var(--display);letter-spacing:.18em;color:var(--accent);text-transform:uppercase}.hero h1{font-size:clamp(64px,12.5vw,176px);line-height:.84;letter-spacing:-.085em;font-weight:500;margin:28px 0;overflow-wrap:anywhere}.hero h1 span{color:var(--accent)}.role{display:inline-flex;align-items:center;gap:10px;max-width:580px;margin:17px 0 0;color:var(--accent);font-size:clamp(14px,1.35vw,18px);font-weight:600;letter-spacing:.015em}.role:before{content:"";width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px color-mix(in srgb,var(--accent) 50%,transparent)}.intro{max-width:570px;color:var(--muted);font-size:15px;line-height:1.85;margin:22px 0 30px}.hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.button{display:inline-flex;align-items:center;gap:28px;padding:14px 18px;background:var(--accent);color:var(--ink);font-size:12px;font-weight:700;text-decoration:none;border-radius:99px;transition:transform .25s,box-shadow .25s}.button:hover{transform:translateY(-3px);box-shadow:0 12px 34px color-mix(in srgb,var(--accent) 22%, transparent)}.text-button{padding:12px 3px;color:var(--paper);font-size:12px;text-decoration:none}.portrait-wrap{justify-self:center;position:relative;width:min(31vw,360px);aspect-ratio:.78;min-width:220px}.portrait{width:100%;height:100%;object-fit:cover;border-radius:48% 48% 12px 12px;filter:saturate(.78);border:1px solid var(--line)}.portrait-placeholder{width:100%;height:100%;border-radius:48% 48% 12px 12px;border:1px solid var(--line);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 25%,#24222b),#17161c 65%);display:grid;place-items:center;color:var(--accent);font-size:clamp(40px,8vw,90px);letter-spacing:-.09em}.portrait-tag{position:absolute;bottom:18px;left:-30px;padding:10px 14px;background:#25232b;border:1px solid var(--line);border-radius:999px;font-size:10px;color:var(--muted)}.scroll-cue{position:absolute;bottom:28px;left:0;color:var(--muted);font-size:9px;letter-spacing:.18em;text-transform:uppercase}
    .section{padding:clamp(65px,10vw,135px) 0;border-top:1px solid var(--line)}.section-head{display:grid;grid-template-columns:1fr 2fr;gap:30px;align-items:start;margin-bottom:45px}.section-index{font-size:10px;letter-spacing:.18em;color:var(--accent)}.section h2{font-size:clamp(37px,7vw,88px);line-height:.95;letter-spacing:-.065em;font-weight:500;margin:0}.about-copy{grid-column:2;max-width:740px;color:#cfccc5;font-size:clamp(18px,2.4vw,27px);line-height:1.55;margin:0}.work-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(16px,3vw,42px)}.work-item{min-width:0}.work-item:nth-child(odd){transform:translateY(55px)}.work-art{height:clamp(220px,34vw,450px);position:relative;overflow:hidden;background:linear-gradient(145deg,#292630,#17161b);border-radius:3px}.work-art:before,.work-art:after{content:"";position:absolute;transition:transform .6s cubic-bezier(.2,.8,.2,1)}.work-art:before{width:68%;height:84%;left:16%;top:10%;border:1px solid color-mix(in srgb,var(--accent) 70%,transparent);border-radius:48% 48% 5px 5px;transform:rotate(-12deg)}.work-art:after{width:40%;aspect-ratio:1;right:13%;bottom:12%;background:radial-gradient(circle at 35% 35%,color-mix(in srgb,var(--accent) 70%,white),color-mix(in srgb,var(--accent) 13%,transparent) 63%,transparent 70%);border-radius:50%;filter:blur(2px)}.art-2{background:linear-gradient(130deg,#24302c,#17191a 68%)}.art-2:before{width:55%;height:55%;top:20%;left:20%;border-radius:8px;transform:rotate(18deg)}.art-2:after{width:32%;right:18%;bottom:18%;border-radius:8px}.work-art span{position:absolute;top:18px;left:20px;font-size:11px;color:var(--accent);z-index:1}.work-item:hover .work-art:before{transform:rotate(0) scale(1.04)}.work-item:hover .work-art:after{transform:translate(-10px,-10px) scale(1.12)}.work-meta{display:flex;justify-content:space-between;gap:15px;padding-top:18px}.work-meta h3{font-size:clamp(19px,3vw,30px);font-weight:500;letter-spacing:-.04em;margin:5px 0}.work-meta p{margin:0;color:var(--muted);font-size:13px}.work-arrow{font-size:23px;color:var(--accent)}
    .top{position:sticky;top:0;z-index:10;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--ink) 90%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .section[id],.work-item[id]{scroll-margin-top:100px}
    .work-grid{display:flex;gap:clamp(16px,3vw,42px);overflow-x:auto;padding:0 0 12px;scroll-snap-type:x mandatory;scroll-behavior:smooth;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}
    .work-grid::-webkit-scrollbar{display:none}.work-item{flex:0 0 min(78%,680px);scroll-snap-align:start;scroll-snap-stop:always}.work-grid .work-item:only-child{flex-basis:100%}.work-grid:focus-visible{outline:2px solid var(--accent);outline-offset:5px}
    .slider-controls{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:25px}.slider-dots,.slider-arrows{display:flex;align-items:center;gap:9px}.slider-dots a,.slider-arrows a{display:grid;min-width:38px;height:38px;place-items:center;border:1px solid var(--line);border-radius:50%;color:var(--muted);font-size:10px;text-decoration:none;transition:background .2s,color .2s,border-color .2s,transform .2s}.slider-arrows a{font-size:17px}.slider-dots a:hover,.slider-arrows a:hover{transform:translateY(-2px);border-color:var(--accent);background:var(--accent);color:var(--ink)}    .skills{display:flex;flex-wrap:wrap;gap:10px;max-width:900px}.skill{padding:11px 17px;border:1px solid var(--line);border-radius:999px;color:#d4d1cb;font-size:13px;transition:background .2s,color .2s,transform .2s}.skill:hover{background:var(--accent);color:var(--ink);transform:translateY(-3px)}.skill-muted{color:var(--muted)}.timeline{list-style:none;padding:0;margin:0;max-width:900px}.timeline-item{display:grid;grid-template-columns:70px 1fr;gap:15px;padding:22px 0;border-top:1px solid var(--line)}.timeline-index{color:var(--accent);font-size:11px}.timeline-item p{margin:0;color:#d4d1cb;white-space:pre-line}.education-list{color:var(--muted);padding-left:20px}.contact-section{display:grid;grid-template-columns:1fr 1fr;gap:35px;align-items:end}.contact-title{font-size:clamp(55px,10vw,130px)!important}.contact-right{justify-self:end;display:grid;gap:13px}.contact-link{font-size:clamp(15px,2vw,21px);text-decoration:none;color:var(--paper)}.contact-link span,.socials span{color:var(--accent)}.socials{display:flex;flex-wrap:wrap;gap:19px;padding-top:30px}.socials a,.doc-links a{font-size:12px;color:var(--muted);text-decoration:none}.socials a:hover,.doc-links a:hover{color:var(--accent)}.doc-links{display:flex;flex-wrap:wrap;gap:15px}.footer{display:flex;justify-content:space-between;gap:20px;padding:25px 0 38px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}
    .reveal{animation:rise .8s both;animation-timeline:view();animation-range:entry 0% entry 28%}@keyframes rise{from{opacity:.25;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}@keyframes drift{to{transform:translate(-5%,5%) scale(1.08)}}
    /* Ten independent art directions */
    .design-awwwards{--paper:#f5f0e6}.design-awwwards .hero{grid-template-columns:1fr .65fr}.design-awwwards .hero h1{font-style:italic}.design-awwwards .work-item:nth-child(odd){transform:translateY(80px)}.design-awwwards .work-art{border-radius:45% 45% 2px 2px}
    .design-apple{--ink:#f4f3ef;--paper:#171719;--muted:#6d6b67;--line:rgba(0,0,0,.14);color-scheme:light}.design-apple .hero{min-height:650px;grid-template-columns:1fr .7fr}.design-apple .hero h1{font-size:clamp(60px,11vw,145px);font-weight:600}.design-apple .role,.design-apple .about-copy,.design-apple .timeline-item p{color:#56545a}.design-apple .portrait-placeholder{background:linear-gradient(145deg,#e2ded5,#c7c0b5)}.design-apple .button{color:white;background:#171719}.design-apple .skill{color:#333}
    .design-cinematic{--ink:#090a0d;--paper:#f5f2ec}.design-cinematic .hero{min-height:calc(100svh - 84px);grid-template-columns:1fr .55fr}.design-cinematic .hero h1{font-size:clamp(70px,14vw,190px);text-transform:uppercase;line-height:.77}.design-cinematic .portrait-wrap{width:min(27vw,310px);aspect-ratio:.67}.design-cinematic .portrait,.design-cinematic .portrait-placeholder{border-radius:2px}.design-cinematic .section{padding-top:150px}
    .design-swiss{--ink:#eeeae0;--paper:#171715;--muted:#77746c;--line:rgba(0,0,0,.2);color-scheme:light}.design-swiss .hero{grid-template-columns:1fr .43fr}.design-swiss .hero h1{font-size:clamp(72px,14vw,190px);font-weight:700;letter-spacing:-.1em}.design-swiss .section-head{grid-template-columns:100px 1fr}.design-swiss .portrait-placeholder{background:var(--accent);color:#121212}.design-swiss .role,.design-swiss .about-copy,.design-swiss .timeline-item p{color:#45433e}
    .design-brutalist{--ink:#e6ff3f;--paper:#111;--muted:#3e4420;--line:rgba(0,0,0,.65);color-scheme:light}.design-brutalist .top{border-bottom:3px solid #111}.design-brutalist .hero h1{font-family:Arial,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:-.11em}.design-brutalist .button{border-radius:0;background:#111;color:#e6ff3f;box-shadow:5px 5px 0 #fff}.design-brutalist .work-art{border:3px solid #111;border-radius:0;background:repeating-linear-gradient(135deg,#d6ef36 0 16px,#bdd223 16px 32px)}.design-brutalist .work-art:before{border:4px solid #111}.design-brutalist .skill{border:2px solid #111;border-radius:0;color:#111;font-weight:700}.design-brutalist .role,.design-brutalist .intro{color:#292d14}
    .design-luxury{--ink:#17130f;--paper:#eee1c9;--muted:#9b8c76;--accent:#c6a76c}.design-luxury .hero h1,.design-luxury .section h2{font-family:Georgia,serif;font-weight:400;letter-spacing:-.06em}.design-luxury .hero h1{font-size:clamp(75px,12vw,160px)}.design-luxury .button{border-radius:2px}.design-luxury .work-art{background:linear-gradient(145deg,#393026,#191510);border:1px solid #6a5940}.design-luxury .portrait,.design-luxury .portrait-placeholder{border-radius:48% 48% 2px 2px}
    .design-developer{--ink:#0a1111;--paper:#d9e7df;--muted:#80948b;--accent:#65e0a3}.design-developer .hero h1{font-family:'Courier New',monospace;font-size:clamp(48px,9vw,120px);letter-spacing:-.09em}.design-developer .hero h1:before{content:'>';color:var(--accent);display:block;font-size:.26em;letter-spacing:0;margin-bottom:25px}.design-developer .button{border-radius:7px}.design-developer .work-art{background:linear-gradient(135deg,#10271f,#101817);border:1px solid rgba(101,224,163,.25);border-radius:12px}.design-developer .skill{border-radius:6px;font-family:monospace}.design-developer .section-index{font-family:monospace}
    .design-designer{--ink:#15131a;--paper:#f5f1e8;--accent:#ff9ed6}.design-designer .hero{grid-template-columns:1.1fr .9fr}.design-designer .hero h1{font-size:clamp(68px,12vw,155px);font-weight:700}.design-designer .portrait-wrap{width:min(34vw,410px);transform:rotate(3deg)}.design-designer .portrait,.design-designer .portrait-placeholder{border-radius:8px}.design-designer .work-item:nth-child(odd){transform:translateY(0)}.design-designer .work-item:nth-child(even){transform:translateY(65px)}.design-designer .work-art{border-radius:14px}
    .design-future{--ink:#0e0c1b;--paper:#eeecff;--muted:#9c97b9;--accent:#b9a1ff}.design-future .hero:before{width:45vw;height:45vw;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 32%,transparent),transparent 68%)}.design-future .portrait-placeholder{border-radius:40% 60% 55% 45%;box-shadow:inset 0 0 60px #a88cff44,0 0 70px #a88cff22}.design-future .work-art{border-radius:22px;box-shadow:inset 0 0 80px #917bff20}.design-future .button{box-shadow:0 0 30px #ad92ff44}
    .design-bento .hero{min-height:650px}.design-bento .portrait-wrap{width:min(27vw,310px)}.design-bento .section-head{grid-template-columns:1fr 2fr}.design-bento .work-grid{gap:15px}.design-bento .work-item{padding:13px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.025)}.design-bento .work-item:nth-child(odd){transform:none}.design-bento .work-art{height:clamp(185px,25vw,320px);border-radius:10px}.design-bento .skill{border-radius:9px}
    @media(max-width:700px){.site{padding:0 21px}.top{height:70px}.nav{gap:14px}.nav>a{font-size:10px}.nav summary{font-size:10px}.hero,.design-awwwards .hero,.design-apple .hero,.design-cinematic .hero,.design-swiss .hero,.design-designer .hero,.design-bento .hero{min-height:unset;grid-template-columns:1fr;gap:40px;padding:82px 0 92px}.hero h1,.design-cinematic .hero h1{font-size:clamp(59px,17vw,112px)}.portrait-wrap,.design-cinematic .portrait-wrap,.design-designer .portrait-wrap,.design-bento .portrait-wrap{justify-self:start;width:min(72vw,310px);min-width:0;aspect-ratio:.92}.portrait-tag{left:auto;right:-12px}.scroll-cue{bottom:24px}.section{padding:72px 0}.section-head,.design-swiss .section-head{grid-template-columns:1fr;gap:15px;margin-bottom:28px}.about-copy{grid-column:1}.work-grid{grid-template-columns:1fr;gap:35px}.work-item:nth-child(n){transform:none!important}.work-art{height:72vw;max-height:380px}.contact-section{grid-template-columns:1fr;gap:30px}.contact-right{justify-self:start}.footer{flex-direction:column}.design-cinematic .section{padding-top:78px}.design-swiss .hero h1{font-size:clamp(68px,18vw,125px)}}
    @media(max-width:380px){.nav{gap:9px}.nav a,.nav summary{font-size:9px}.hero h1{font-size:57px}.button{gap:15px}.site{padding:0 17px}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  const sections = `${about ? `<section class="section reveal" id="about"><div class="section-head"><span class="section-index">01 / ABOUT</span><h2>A little<br>context.</h2><p class="about-copy">${esc(about)}</p></div></section>` : ""}
    <section class="section" id="work"><div class="section-head"><span class="section-index">02 / SELECTED WORK</span><h2>Things made<br>with intent.</h2></div><div class="work-grid" role="region" aria-label="Selected projects" tabindex="0">${projectsHtml}</div>${sliderControls}</section>
    ${skills.length ? `<section class="section" id="skills"><div class="section-head"><span class="section-index">03 / TOOLKIT</span><h2>Ways of<br>working.</h2></div><div class="skills">${skillsHtml}</div></section>` : ""}
    ${experience.length ? `<section class="section" id="experience"><div class="section-head"><span class="section-index">04 / EXPERIENCE</span><h2>The path<br>so far.</h2></div><ol class="timeline">${timelineHtml}</ol></section>` : ""}
    ${education.length ? `<section class="section" id="education"><div class="section-head"><span class="section-index">05 / EDUCATION</span><h2>Learning<br>and practice.</h2></div><ul class="education-list">${educationHtml}</ul></section>` : ""}
    ${docs.length ? `<section class="section" id="documents"><div class="section-head"><span class="section-index">RESOURCES</span><h2>More to<br>explore.</h2></div><div class="doc-links">${docsHtml}</div></section>` : ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeAttribute(seoDescription)}"><meta name="author" content="${escapeAttribute(name)}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="theme-color" content="${dark}"><meta property="og:type" content="website"><meta property="og:site_name" content="${escapeAttribute(name)}"><meta property="og:title" content="${escapeAttribute(seoTitle)}"><meta property="og:description" content="${escapeAttribute(seoDescription)}">${canonicalUrl ? `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}"><meta property="og:url" content="${escapeAttribute(canonicalUrl)}">` : ""}<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeAttribute(seoTitle)}"><meta name="twitter:description" content="${escapeAttribute(seoDescription)}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(seoTitle)}</title><script type="application/ld+json">${structuredData}</script><style>${css}</style></head><body class="design-${design}"><div class="site"><header class="top"><a class="brand" href="#top"><span class="brand-mark">✳</span>${esc(name)}</a><nav class="nav" aria-label="Main navigation"><a href="#work">Work</a>${about ? `<a href="#about">About</a>` : ""}${skills.length ? `<a href="#skills">Toolkit</a>` : ""}${experience.length ? `<a href="#experience">Experience</a>` : ""}${email ? `<a href="mailto:${escapeAttribute(email)}">Contact</a>` : `<a href="#contact">Contact</a>`}<label class="theme-toggle" title="Toggle accent color"><input id="accentSwitch" type="checkbox" aria-label="Toggle accent color"><span aria-hidden="true">◐</span></label></nav></header>
  <main><section class="hero" id="top"><div class="hero-copy"><span class="eyebrow">${location ? `${esc(location)} · ` : ""}INDEPENDENT PRACTICE</span><h1>${heading}<span>.</span></h1><p class="role">${esc(role)}</p>${about ? `<p class="intro">${esc(about)}</p>` : ""}<div class="hero-actions">${email ? `<a class="button" href="mailto:${escapeAttribute(email)}">Start a conversation <span>↗</span></a>` : `<a class="button" href="#work">Explore selected work <span>↓</span></a>`}${about ? `<a class="text-button" href="#about">A little about me ↓</a>` : ""}</div></div><div class="portrait-wrap">${photo ? `<img class="portrait" src="${photo}" alt="Portrait of ${escapeAttribute(name)}">` : `<div class="portrait-placeholder" aria-label="Abstract profile artwork">${esc(name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2))}</div>`}<span class="portrait-tag">${esc(role)}</span></div><span class="scroll-cue">SCROLL TO EXPLORE ↓</span></section>${sections}
  <section class="section contact-section" id="contact"><div><span class="section-index">LET'S CONNECT</span><h2 class="contact-title">Have a good<br>one in mind?</h2></div><div class="contact-right">${contactEmail}${contactPhone}${email ? `<a class="button" href="mailto:${esc(email)}">Get in touch <span>↗</span></a>` : ""}</div></section><div class="socials">${socialHtml}</div></main><footer class="footer"><span>${esc(name)} · ${esc(role)}</span><a href="#top">Back to top ↑</a></footer></div></body></html>`;
}

function renderPortfolio(data, standalone = false) {
  return renderPremiumPortfolio(data);
}

function updatePreview() {
  const data = readForm();
  preview.srcdoc = renderPortfolio(data);
  aboutCount.textContent = String(data.about?.length || 0);
}

function updatePhotoControl() {
  const hasPhoto = Boolean(photoInput.value);
  photoThumbnail.src = hasPhoto ? photoInput.value : "";
  photoThumbnail.hidden = !hasPhoto;
  removePhotoButton.hidden = !hasPhoto;
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    // Security: Validate file size (8MB max)
    const MAX_FILE_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error("Image file too large (max 8MB)."));
      return;
    }

    // Security: Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      reject(new Error("Only JPEG, PNG, and WebP images are allowed."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image file."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        const maxDimension = 640;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser couldn't prepare this image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.82);
        // Security: Check base64 size before storing
        if (base64.length > MAX_STORAGE_SIZE / 2) {
          reject(new Error("Processed image is too large to store."));
          return;
        }
        resolve(base64);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveStatus.textContent = "Saving your changes…";
  saveTimer = window.setTimeout(() => {
    try {
      const draft = JSON.stringify(readForm());
      // Security: Check storage size before saving
      if (draft.length > MAX_STORAGE_SIZE) {
        saveStatus.textContent = "Draft is too large to save";
        showToast("Your draft exceeds storage limit. Please remove your profile photo or simplify your portfolio.");
        console.warn("Portfolio draft exceeds storage size limit");
        return;
      }
      localStorage.setItem(STORAGE_KEY, draft);
      saveStatus.textContent = "Your work saves automatically";
    } catch (error) {
      saveStatus.textContent = "Draft couldn't be saved";
      showToast("Your browser couldn't save this draft. You can still download your portfolio.");
      console.error("Could not save portfolio draft:", error);
    }
  }, 250);
}

function showToast(message) {
  toast.textContent = escapeHtml(message);
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4000);
}

function loadDraft() {
  try {
    const draft = localStorage.getItem(STORAGE_KEY);
    if (!draft) return;
    
    // Security: Validate JSON is valid before processing
    let values;
    try {
      values = JSON.parse(draft);
    } catch (parseError) {
      console.error("Invalid draft JSON structure:", parseError);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    
    // Security: Validate values object
    if (typeof values !== "object" || values === null) {
      console.error("Draft data is not an object");
      return;
    }
    
    for (const [key, value] of Object.entries(values)) {
      // Security: Whitelist allowed form field names
      const control = form.elements.namedItem(key);
      if (!control) continue;
      
      // Security: Type validation for each control
      if (control instanceof RadioNodeList) {
        const strValue = String(value || "").substring(0, 50);
        const option = form.querySelector(`input[name="${CSS.escape(key)}"][value="${CSS.escape(strValue)}"]`);
        if (option) option.checked = true;
      } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        // Security: Sanitize values before assigning
        if (typeof value === "string") {
          control.value = value.substring(0, MAX_INPUT_LENGTH);
        } else if (typeof value === "number") {
          control.value = String(value);
        }
      }
    }
  } catch (error) {
    saveStatus.textContent = "Saved draft couldn't be loaded";
    console.error("Could not load portfolio draft:", error);
  }
}

form.addEventListener("input", () => {
  updatePreview();
  scheduleSave();
});
form.addEventListener("change", () => {
  updatePreview();
  scheduleSave();
});

photoFile.addEventListener("change", async () => {
  const [file] = photoFile.files || [];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    photoFile.value = "";
    showToast("Choose a JPG, PNG, or WebP image.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    photoFile.value = "";
    showToast("That image is larger than 8 MB. Choose a smaller photo.");
    return;
  }
  try {
    photoInput.value = await resizePhoto(file);
    updatePhotoControl();
    updatePreview();
    scheduleSave();
  } catch (error) {
    photoFile.value = "";
    showToast(error.message);
    console.error("Could not prepare profile photo:", error);
  }
});

removePhotoButton.addEventListener("click", () => {
  photoInput.value = "";
  photoFile.value = "";
  updatePhotoControl();
  updatePreview();
  scheduleSave();
});

function finishPortfolio(message) {
  const data = readForm();
  generatedPortfolio = renderPortfolio(data, true);
  generatedCanonicalUrl = normalizeCanonicalUrl(data.canonicalUrl);
  if (registrationDialog.open) registrationDialog.close();
  exportSection.hidden = false;
  exportSection.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(message || "Your portfolio is ready. Download the ZIP whenever you’re ready.");
}

function refreshCaptcha() {
  const first = Math.floor(Math.random() * 9) + 2;
  const second = Math.floor(Math.random() * 9) + 2;
  registrationForm.dataset.captchaA = String(first);
  registrationForm.dataset.captchaB = String(second);
  registrationForm.dataset.captchaAnswer = String(first + second);
  document.querySelector("#captchaQuestion").textContent = `Quick check: what is ${first} + ${second}?`;
  registrationForm.elements.namedItem("captchaAnswer").value = "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const portfolioData = readForm();
  registrationForm.elements.namedItem("name").value = portfolioData.name || "";
  registrationForm.elements.namedItem("occupation").value = portfolioData.role || "";
  registrationForm.elements.namedItem("email").value = portfolioData.email || "";
  registrationForm.elements.namedItem("mobile").value = portfolioData.phone || "";
  registrationError.hidden = true;
  refreshCaptcha();
  registrationDialog.showModal();
});

document.querySelector("#closeRegistration").addEventListener("click", () => registrationDialog.close());
document.querySelector("#skipRegistration").addEventListener("click", () => finishPortfolio());
registrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!registrationForm.reportValidity()) return;
  if (registrationForm.elements.namedItem("captchaAnswer").value !== registrationForm.dataset.captchaAnswer) {
    registrationError.textContent = "That answer doesn’t match. Try the math check again.";
    registrationError.hidden = false;
    refreshCaptcha();
    return;
  }

  const now = Date.now();
  const rateKey = "portfolio-registration-rate-v1";
  let rateState = { startedAt: now, count: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(rateKey) || "null");
    if (saved && Number.isFinite(saved.startedAt) && Number.isFinite(saved.count) && now - saved.startedAt < 15 * 60 * 1000) rateState = saved;
  } catch { /* Server-side throttling remains authoritative. */ }
  if (rateState.count >= 3) {
    registrationError.textContent = "You’ve reached the registration limit for this browser. You can still export without registering.";
    registrationError.hidden = false;
    return;
  }
  rateState.count += 1;
  try { localStorage.setItem(rateKey, JSON.stringify(rateState)); } catch { /* The API also rate-limits submissions. */ }

  const submitButton = document.querySelector("#registerAndExport");
  submitButton.disabled = true;
  submitButton.dataset.label = submitButton.textContent;
  submitButton.textContent = "Sending details…";
  const formData = Object.fromEntries(new FormData(registrationForm).entries());
  let toastMessage = "Your portfolio is ready. Download the ZIP whenever you’re ready.";
  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        captchaA: registrationForm.dataset.captchaA,
        captchaB: registrationForm.dataset.captchaB,
        captchaExpected: registrationForm.dataset.captchaAnswer,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 429) {
      registrationError.textContent = result.message || "Too many registration attempts. Please wait before trying again, or export without registering.";
      registrationError.hidden = false;
      refreshCaptcha();
      return;
    }
    if (response.status === 400) {
      registrationError.textContent = result.message || "Please review the details and try again.";
      registrationError.hidden = false;
      refreshCaptcha();
      return;
    }
    toastMessage = response.ok
      ? "Registration sent. Your portfolio is ready to export."
      : response.status === 503
        ? "Email delivery isn’t configured yet. Your portfolio is ready to export."
        : "Registration email couldn’t be sent. Your portfolio is ready to export.";
  } catch {
    toastMessage = "Registration couldn’t be sent right now. Your portfolio is ready to export.";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = `${escapeHtml(submitButton.dataset.label || "Register & continue")} <span aria-hidden="true">↗</span>`;
  }
  finishPortfolio(toastMessage);
});
document.querySelector("#downloadPortfolioZip").addEventListener("click", downloadPortfolioZip);
document.querySelector("#copyDeploymentEmail").addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText("mhn.technical.help7@gmail.com");
    event.currentTarget.textContent = "Email copied";
    window.setTimeout(() => { event.currentTarget.textContent = "Copy email"; }, 1800);
  } catch {
    showToast("Copy unavailable. Select the email address to copy it.");
  }
});

document.querySelector("#resetButton").addEventListener("click", () => {
  const confirmed = window.confirm("Start over and clear your saved portfolio details?");
  if (!confirmed) return;
  form.reset();
  generatedPortfolio = "";
  generatedCanonicalUrl = "";
  exportSection.hidden = true;
  photoInput.value = "";
  photoFile.value = "";
  updatePhotoControl();
  try {
    localStorage.removeItem(STORAGE_KEY);
    saveStatus.textContent = "Your work saves automatically";
  } catch (error) {
    saveStatus.textContent = "Couldn’t clear your saved draft";
    console.error("Could not clear portfolio draft:", error);
  }
  updatePreview();
});

// Initialize dropdown menu functionality
function initializeDropdownMenu() {
  const trigger = document.querySelector(".nav-dropdown-trigger");
  const menu = document.querySelector(".nav-dropdown-menu");
  const items = document.querySelectorAll(".dropdown-item");

  if (!trigger || !menu) return;

  // Toggle menu on trigger click
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    closeAllMenus();
    if (!isOpen) {
      trigger.setAttribute("aria-expanded", "true");
      menu.removeAttribute("hidden");
    }
  });

  // Handle item clicks
  items.forEach((item) => {
    item.addEventListener("click", (e) => {
      const action = item.getAttribute("data-action");
      if (action === "scroll-to-builder") {
        e.preventDefault();
        closeAllMenus();
        document.querySelector("#builder")?.scrollIntoView({ behavior: "smooth" });
      }
      // External links open normally (target="_blank")
    });
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-dropdown")) {
      closeAllMenus();
    }
  });

  // Close menu on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllMenus();
    }
  });
}

function closeAllMenus() {
  const triggers = document.querySelectorAll(".nav-dropdown-trigger");
  const menus = document.querySelectorAll(".nav-dropdown-menu");
  triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
  menus.forEach((m) => m.setAttribute("hidden", ""));
}

// Initialize dropdown when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDropdownMenu);
} else {
  initializeDropdownMenu();
}

loadDraft();
updatePhotoControl();
updatePreview();
