"use strict";

const OWNER_EMAIL = "subhamv2003@gmail.com";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByIp = new Map();

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function plainText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function rateLimited(ip, now) {
  const previous = requestsByIp.get(ip);
  if (!previous || now - previous.startedAt >= WINDOW_MS) {
    requestsByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  if (previous.count >= MAX_REQUESTS) return true;
  previous.count += 1;
  if (requestsByIp.size > 5000) {
    for (const [key, value] of requestsByIp) {
      if (now - value.startedAt >= WINDOW_MS) requestsByIp.delete(key);
    }
  }
  return false;
}

module.exports = async function registerApplicant(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { message: "Method not allowed." });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return sendJson(res, 415, { message: "JSON registration details are required." });
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  try {
    if (!origin || !host || new URL(origin).host !== host) {
      return sendJson(res, 403, { message: "Request origin could not be verified." });
    }
  } catch {
    return sendJson(res, 403, { message: "Request origin could not be verified." });
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = plainText(typeof forwardedFor === "string" ? forwardedFor.split(",")[0] : "unknown", 64) || "unknown";
  if (rateLimited(ip, Date.now())) {
    return sendJson(res, 429, { message: "Too many registration attempts. Please wait 15 minutes, or export without registering." });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 12 * 1024) return sendJson(res, 413, { message: "Registration details are too large." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (plainText(body.website, 200)) return sendJson(res, 200, { ok: true });

  const details = {
    name: plainText(body.name, 80),
    occupation: plainText(body.occupation, 100),
    organization: plainText(body.organization, 120),
    email: plainText(body.email, 120),
    mobile: plainText(body.mobile, 30),
    country: plainText(body.country, 80),
    city: plainText(body.city, 80),
  };
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const phonePattern = /^[+()\d.\s-]{6,30}$/;
  const requiredFields = Object.values(details).every(Boolean);
  const captchaA = Number(body.captchaA);
  const captchaB = Number(body.captchaB);
  const captchaAnswer = Number(body.captchaAnswer);
  const captchaExpected = Number(body.captchaExpected);
  const validCaptcha = Number.isInteger(captchaA) && Number.isInteger(captchaB)
    && captchaA >= 2 && captchaA <= 10 && captchaB >= 2 && captchaB <= 10
    && captchaAnswer === captchaA + captchaB && captchaExpected === captchaA + captchaB;

  if (!requiredFields || !emailPattern.test(details.email) || !phonePattern.test(details.mobile) || !validCaptcha) {
    return sendJson(res, 400, { message: "Please check the required details and math answer." });
  }
  if (!process.env.BREVO_API_KEY) {
    return sendJson(res, 503, { message: "Email delivery is not configured yet." });
  }

  const senderEmail = plainText(process.env.BREVO_SENDER_EMAIL || OWNER_EMAIL, 120);
  if (!emailPattern.test(senderEmail)) return sendJson(res, 503, { message: "Email delivery is not configured yet." });
  const rows = [
    ["Name", details.name], ["Occupation", details.occupation], ["College or company", details.organization],
    ["Email", details.email], ["Mobile", details.mobile], ["Country", details.country], ["City", details.city],
  ];
  const textContent = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlContent = `<h2>New portfolio registration</h2><table>${rows.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>`;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: plainText(process.env.BREVO_SENDER_NAME || "Portfolio Registration", 80), email: senderEmail },
        to: [{ email: OWNER_EMAIL, name: "Shubham Verma" }],
        replyTo: { email: details.email, name: details.name },
        subject: "New Website Create Kro registration",
        textContent,
        htmlContent,
      }),
    });
    if (!response.ok) return sendJson(res, 502, { message: "Registration email could not be delivered." });
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 502, { message: "Registration email could not be delivered." });
  }
};
