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

// Validate critical elements exist
if (!form || !preview) {
  console.error("Critical form elements missing. Application cannot initialize.");
  document.body.innerHTML = "<p>Error: Application failed to initialize.</p>";
  throw new Error("Missing required DOM elements");
}

let saveTimer;
let toastTimer;

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

function renderPortfolio(data, standalone = false) {
  const name = sanitizeLength(data.name?.trim() || "Your Name", 100);
  const role = sanitizeLength(data.role?.trim() || "Your next title goes here", 100);
  const email = sanitizeLength(data.email?.trim() || "", 100);
  const phone = sanitizeLength(data.phone?.trim() || "", 20);
  const location = sanitizeLength(data.location?.trim() || "", 100);
  const about = sanitizeLength(data.about?.trim() || "A few words about you, your work, and what you love making will look right at home here.", 500);
  const theme = themeColors[data.theme] ? data.theme : "violet";
  const accent = themeColors[theme];
  const font = fontFamilies[data.font] ? data.font : "modern";
  const fontFamily = fontFamilies[font];
  
  // Strict base64 validation for photo
  const profilePhoto = /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(data.profilePhoto || "")
    ? data.profilePhoto
    : "";
  
  const skills = (data.skills || "")
    .split(",")
    .map((item) => sanitizeLength(item.trim(), 50))
    .filter(Boolean)
    .slice(0, MAX_SKILLS_ITEMS);
  
  const otherSkills = (data.otherSkills || "")
    .split(",")
    .map((item) => sanitizeLength(item.trim(), 50))
    .filter(Boolean)
    .slice(0, MAX_SKILLS_ITEMS);
  
  const hobbies = (data.hobbies || "")
    .split(",")
    .map((item) => sanitizeLength(item.trim(), 50))
    .filter(Boolean)
    .slice(0, MAX_SKILLS_ITEMS);
  
  const experience = (data.experience || "")
    .split(/\r?\n/)
    .map((item) => sanitizeLength(item.trim(), 300))
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
  
  const education = (data.education || "")
    .split(/\r?\n/)
    .map((item) => sanitizeLength(item.trim(), 300))
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
  
  const projects = [1, 2]
    .map((number) => ({
      name: sanitizeLength(data[`project${number}`]?.trim() || "", 100),
      description: sanitizeLength(data[`project${number}Description`]?.trim() || "", 300),
    }))
    .filter((project) => project.name);
  
  const links = [
    { label: "LinkedIn", url: safeUrl(data.linkedin) },
    { label: "GitHub", url: safeUrl(data.github) },
    { label: "Website", url: safeUrl(data.website) },
    { label: data.otherLinkLabel?.trim() || "More", url: safeUrl(data.otherLink) },
  ].filter((link) => link.url);
  const documents = [
    { label: "View my resume", url: safeUrl(data.resume) },
    { label: "View certificate", url: safeUrl(data.certificate) },
  ].filter((document) => document.url);
  const projectCards = projects.length
    ? projects.map((project, index) => `
      <article class="project">
        <span class="project-number">0${index + 1} / SELECTED WORK</span>
        <h3>${escapeHtml(project.name)}</h3>
        <p>${escapeHtml(project.description || "A project I care about, made with intention.")}</p>
      </article>`).join("")
    : `<article class="project empty-project"><span class="project-number">A LITTLE PREVIEW</span><h3>Your work goes here.</h3><p>Add a project on the left and it’ll find its place right here.</p></article>`;
  const skillsMarkup = skills.length
    ? skills.map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`).join("")
    : `<span class="skill muted-skill">Add your skills to see them here</span>`;
  const otherSkillsMarkup = otherSkills.map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`).join("");
  const hobbiesMarkup = hobbies.map((hobby) => `<span class="skill">${escapeHtml(hobby)}</span>`).join("");
  const experienceMarkup = experience.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const educationMarkup = education.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const contactMarkup = [
    email ? `<a class="contact-button" href="mailto:${escapeHtml(email)}">Email me <span>↗</span></a>` : "",
    phone ? `<a class="contact-button secondary-contact" href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}">Call me <span>↗</span></a>` : "",
  ].filter(Boolean).join("");
  const linkMarkup = links.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} ↗</a>`).join("");
  const documentMarkup = documents.map((document) => `<a class="document-link" href="${escapeHtml(document.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(document.label)} ↗</a>`).join("");
  const generatedTitle = `${escapeHtml(name)} — ${escapeHtml(role)}`;
  const localStyles = `
    *{box-sizing:border-box}
    body{margin:0;background:#fffefa;color:#26251f;font-family:${fontFamily}}
    a{color:inherit}
    .page{max-width:630px;margin:0 auto;padding:42px 10% 36px}
    .nav{display:flex;justify-content:space-between;align-items:center;padding-bottom:15px;border-bottom:1px solid #eeece5}
    .mini-brand{font-size:11px;font-weight:700;letter-spacing:-.3px}.mini-brand span{color:${accent}}
    .location{color:#858279;font-size:9px}
    .hero{padding:49px 0 35px}
    .hero-top{display:flex;align-items:center;gap:22px}
    .profile-photo{width:104px;height:104px;flex:0 0 auto;border-radius:50%;object-fit:cover;border:3px solid ${accent}22}
    .hero-copy{min-width:0}
    .eyebrow{margin:0 0 15px;color:${accent};font-size:9px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase}
    h1{max-width:430px;margin:0;font-family:inherit;font-size:clamp(35px,7vw,54px);font-weight:400;line-height:1.08;letter-spacing:-1.6px}
    h1 span{color:${accent}}
    .role{margin:13px 0 0;color:#68665e;font-size:14px}
    .about{max-width:430px;margin:18px 0 0;color:#77756d;font-size:11px;line-height:1.8}
    .contact-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
    .contact-button{display:inline-flex;align-items:center;gap:18px;padding:10px 13px;border-radius:4px;background:${accent};color:white;font-size:10px;text-decoration:none}
    .secondary-contact{background:#f0eee8;color:#45433d}
    .contact-button span{font-size:13px}
    .section{padding:21px 0 24px;border-top:1px solid #eeece5}
    .section-label{margin:0 0 15px;color:#8a887f;font-size:8px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase}
    .projects{display:grid;grid-template-columns:1fr 1fr;gap:11px}
    .project{min-height:125px;padding:14px;border:1px solid #eeece5;border-radius:4px;background:#fff}
    .empty-project{background:#fbfaf7}
    .project-number{color:${accent};font-size:7px;font-weight:700;letter-spacing:.9px}
    .project h3{margin:18px 0 7px;font-family:inherit;font-size:15px;font-weight:400}
    .project p{margin:0;color:#858279;font-size:9px;line-height:1.6}
    .skills{display:flex;flex-wrap:wrap;gap:7px}
    .skill{padding:6px 9px;border:1px solid #e9e6df;border-radius:20px;color:#66645e;font-size:9px}
    .muted-skill{color:#9d9a91}
    .entries{display:grid;gap:9px;margin:0;padding:0;list-style:none}
    .entries li{padding:11px 13px;border:1px solid #eeece5;border-radius:4px;color:#55534c;font-size:10px;line-height:1.65;white-space:pre-line}
    .documents{display:flex;flex-wrap:wrap;gap:8px}
    .document-link{padding:9px 12px;border:1px solid #e9e6df;border-radius:4px;color:${accent};font-size:9px;font-weight:700;text-decoration:none}
    .footer{display:flex;justify-content:space-between;gap:10px;padding-top:17px;border-top:1px solid #eeece5}
    .footer-links{display:flex;flex-wrap:wrap;gap:12px}
    .footer a{color:#77756d;font-size:9px;text-decoration:none}
    .copyright{color:#a09d93;font-size:8px}
    @media(max-width:420px){.page{padding:28px 7%}.hero{padding-top:37px}.projects{grid-template-columns:1fr}.hero-top{align-items:flex-start;flex-direction:column}.profile-photo{width:82px;height:82px}}
    @media print{.page{padding-top:20px}.contact-button{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  `;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(about.slice(0, 155))}">
  <meta name="theme-color" content="${accent}">
  <title>${generatedTitle}</title>
  <style>${localStyles}</style>
</head>
<body>
  <main class="page">
    <nav class="nav" aria-label="Portfolio">
      <span class="mini-brand">✳ <span>${escapeHtml(name)}</span></span>
      ${location ? `<span class="location">${escapeHtml(location)}</span>` : ""}
    </nav>
    <header class="hero">
      <div class="hero-top">
        ${profilePhoto ? `<img class="profile-photo" src="${profilePhoto}" alt="Profile photo of ${escapeHtml(name)}">` : ""}
        <div class="hero-copy">
          <p class="eyebrow">A LITTLE INTRODUCTION</p>
          <h1>Hey, I’m <span>${escapeHtml(name)}</span>.</h1>
          <p class="role">${escapeHtml(role)}</p>
        </div>
      </div>
      <p class="about">${escapeHtml(about)}</p>
      ${contactMarkup ? `<div class="contact-actions">${contactMarkup}</div>` : ""}
    </header>
    ${experience.length ? `<section class="section" aria-labelledby="experience-heading"><h2 class="section-label" id="experience-heading">WORK EXPERIENCE</h2><ul class="entries">${experienceMarkup}</ul></section>` : ""}
    ${education.length ? `<section class="section" aria-labelledby="education-heading"><h2 class="section-label" id="education-heading">EDUCATION</h2><ul class="entries">${educationMarkup}</ul></section>` : ""}
    <section class="section" aria-labelledby="work-heading">
      <h2 class="section-label" id="work-heading">A FEW THINGS I’VE MADE</h2>
      <div class="projects">${projectCards}</div>
    </section>
    <section class="section" aria-labelledby="skills-heading">
      <h2 class="section-label" id="skills-heading">TECHNICAL SKILLS</h2>
      <div class="skills">${skillsMarkup}</div>
    </section>
    ${otherSkills.length ? `<section class="section" aria-labelledby="other-skills-heading"><h2 class="section-label" id="other-skills-heading">OTHER SKILLS</h2><div class="skills">${otherSkillsMarkup}</div></section>` : ""}
    ${hobbies.length ? `<section class="section" aria-labelledby="hobbies-heading"><h2 class="section-label" id="hobbies-heading">HOBBIES & INTERESTS</h2><div class="skills">${hobbiesMarkup}</div></section>` : ""}
    ${documents.length ? `<section class="section" aria-labelledby="documents-heading"><h2 class="section-label" id="documents-heading">RESUME & CERTIFICATIONS</h2><div class="documents">${documentMarkup}</div></section>` : ""}
    <footer class="footer">
      <div class="footer-links">${linkMarkup}</div>
      <span class="copyright">MADE WITH CARE · ${escapeHtml(name)}</span>
    </footer>
  </main>
</body>
</html>`;
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = readForm();
  const fileName = (data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-portfolio") + "-portfolio.html";
  const file = new Blob([renderPortfolio(data, true)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const download = document.createElement("a");
  download.href = url;
  download.download = fileName;
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Your portfolio is ready! Open the downloaded HTML file to see your website.");
});

document.querySelector("#resetButton").addEventListener("click", () => {
  const confirmed = window.confirm("Start over and clear your saved portfolio details?");
  if (!confirmed) return;
  form.reset();
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
