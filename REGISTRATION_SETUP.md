# Registration email setup

The registration form sends submitted details to `subhamv2003@gmail.com` through the Vercel serverless route in `api/register.js`. The Brevo API key is never placed in browser code.

## Configure Brevo on Vercel

In the Vercel project, open **Settings → Environment Variables** and add:

- `BREVO_API_KEY` — your Brevo transactional email API key (mark it sensitive/encrypted)
- `BREVO_SENDER_EMAIL` — an email address verified as a sender in Brevo
- `BREVO_SENDER_NAME` — optional sender display name

Save the variables and redeploy. The sender address must be verified by Brevo. The destination address is configured as `subhamv2003@gmail.com` in `api/register.js`.

Do not put the API key in `app.js`, `index.html`, or any `VITE_`/public environment variable. Local static hosting does not run the API route; the form keeps export available and reports that email delivery is unavailable.

## Protections

The form uses required fields, an arithmetic check, a hidden honeypot, same-origin request checking, bounded input lengths, and a five-request per 15-minute IP limit in the serverless handler. The browser also applies a three-submission per 15-minute limit. Vercel function memory can reset or scale across instances, so the server-side counter is best-effort; use a shared rate-limit store or edge firewall for a strict global limit.

Submitted details are sent to the configured owner address and are not added to the saved portfolio draft. Users can choose **Export without registering**.
