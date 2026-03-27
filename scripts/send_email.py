"""Send a branded celebration email from Pow Predictor via SMTP.

Usage:
  python3 scripts/send_email.py --to user@example.com \
    --subject "Your bug fix is live!" \
    --body-file /tmp/email_body.html

  python3 scripts/send_email.py --to user@example.com \
    --subject "Your bug fix is live!" \
    --body "We fixed the issue you reported. Thanks!"

Uses Gmail SMTP with app password. Credentials loaded from .env file.
"""

import argparse
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# Load .env manually (no external deps required)
def load_env(path=".env"):
    env = {}
    p = Path(path)
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        env[key.strip()] = val.strip().strip("'\"")
    return env


TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <title>%%SUBJECT%%</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 15px; line-height: 1.6; color: #1e293b;
            background-color: #0f172a; width: 100% !important;
        }

        .email-wrapper {
            width: 100%; background-color: #0f172a; padding: 44px 0 52px;
            background-image:
                radial-gradient(ellipse 120% 75% at 50% 45%, rgba(56,189,248,0.12) 0%, transparent 60%);
        }
        .email-container {
            max-width: 600px; margin: 0 auto; background-color: #ffffff !important;
            border-radius: 16px; overflow: hidden;
            box-shadow: 0 12px 48px rgba(0,0,0,0.45);
            border: 1px solid rgba(56,189,248,0.15);
        }

        .header {
            background-color: #0f172a;
            background-image: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0c1e3e 100%);
            padding: 40px 44px 36px;
        }
        .header-badge {
            display: inline-block;
            background: linear-gradient(135deg, #38bdf8, #0ea5e9);
            color: #ffffff; font-size: 10px; font-weight: 800;
            letter-spacing: 0.12em; text-transform: uppercase;
            padding: 5px 14px; border-radius: 100px; margin-bottom: 18px;
            box-shadow: 0 0 0 1px rgba(56,189,248,0.3), 0 4px 12px rgba(56,189,248,0.25);
        }
        .header h1 { font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 8px; }
        .header .subtitle { font-size: 14px; color: #7dd3fc; font-weight: 500; }

        .content { padding: 36px 44px 40px; background-color: #ffffff !important; color: #1e293b !important; }
        .content p { margin-bottom: 16px; }
        .content h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; margin-top: 24px; }
        .content-lead { font-size: 15px; color: #475569 !important; margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; line-height: 1.7; }
        .content-lead strong { color: #0f172a !important; font-weight: 700; }

        .feature-card {
            border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
            margin-bottom: 16px; box-shadow: 0 1px 6px rgba(15,23,42,0.05);
        }
        .feature-header {
            padding: 14px 20px; border-bottom: 1px solid #e2e8f0;
            background: linear-gradient(90deg, #eff6ff, #dbeafe) !important;
        }
        .feature-title { font-size: 14px; font-weight: 700; color: #0f172a !important; }
        .feature-body { padding: 14px 20px; background-color: #ffffff !important; font-size: 14px; color: #475569; line-height: 1.7; }

        .cta-section { text-align: center; margin: 32px 0 8px; }
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%) !important;
            color: #ffffff !important; text-decoration: none !important;
            font-size: 15px; font-weight: 700; letter-spacing: 0.03em;
            padding: 14px 36px; border-radius: 10px;
            box-shadow: 0 4px 14px rgba(14,165,233,0.4);
        }

        .footer {
            background: linear-gradient(135deg, #f8fafc, #f1f5f9) !important;
            border-top: 1px solid #e2e8f0; padding: 24px 44px;
            font-size: 12px; color: #94a3b8 !important; line-height: 1.8; text-align: center;
        }
        .footer a { color: #64748b !important; }

        @media only screen and (max-width: 640px) {
            .email-wrapper { padding: 0; }
            .email-container { border-radius: 0; box-shadow: none; }
            .header { padding: 30px 24px 26px; }
            .content { padding: 28px 24px 32px; }
            .footer { padding: 20px 24px; }
        }
    </style>
</head>
<body>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr><td class="email-wrapper">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" bgcolor="#ffffff" class="email-container" style="max-width:600px; background-color:#ffffff !important;">

<!-- Header -->
<tr><td class="header">
    <div class="header-badge">%%BADGE_TEXT%%</div>
    <h1>%%HEADER_TITLE%%</h1>
    <div class="subtitle">%%HEADER_SUBTITLE%%</div>
</td></tr>

<!-- Body -->
<tr><td class="content" bgcolor="#ffffff" style="background-color:#ffffff !important; padding:36px 44px 40px; color:#1e293b !important;">
%%BODY%%
</td></tr>

<!-- Footer -->
<tr><td class="footer" bgcolor="#f1f5f9" style="background-color:#f1f5f9 !important;">
    <p>
        <strong style="color:#475569;">Pow Predictor</strong><br>
        3D snow redistribution for alpine terrain<br>
        <a href="https://powpredictor.info">powpredictor.info</a>
    </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
"""


def build_html(body_content, subject, badge_text, header_title, header_subtitle):
    html = TEMPLATE
    html = html.replace("%%SUBJECT%%", subject)
    html = html.replace("%%BADGE_TEXT%%", badge_text)
    html = html.replace("%%HEADER_TITLE%%", header_title)
    html = html.replace("%%HEADER_SUBTITLE%%", header_subtitle)
    html = html.replace("%%BODY%%", body_content)
    return html


def send_email(to_email, subject, html, env_config):
    email_from = env_config["EMAIL_FROM"]
    smtp_host = env_config["SMTP_HOST"]
    smtp_port = int(env_config["SMTP_PORT"])
    smtp_user = env_config["SMTP_USER"]
    smtp_pass = env_config["SMTP_PASS"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Pow Predictor <{email_from}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    print(f"Sending to {to_email} via {smtp_host}:{smtp_port}... ", end="", flush=True)
    server = smtplib.SMTP(smtp_host, smtp_port)
    server.starttls()
    server.login(smtp_user, smtp_pass)
    server.sendmail(email_from, to_email, msg.as_string())
    server.quit()
    print("OK")


def main():
    parser = argparse.ArgumentParser(description="Send branded Pow Predictor email")
    parser.add_argument("--to", required=True, help="Recipient email")
    parser.add_argument("--subject", required=True, help="Email subject")

    body_group = parser.add_mutually_exclusive_group(required=True)
    body_group.add_argument("--body-file", help="Path to HTML body content file")
    body_group.add_argument("--body", help="Inline HTML body content")

    parser.add_argument("--badge-text", default="Shipped", help="Badge text (default: Shipped)")
    parser.add_argument("--header-title", help="Header title (default: subject)")
    parser.add_argument("--header-subtitle", default="Find the best powder snow", help="Header subtitle")
    parser.add_argument("--dry-run", action="store_true", help="Print HTML without sending")

    args = parser.parse_args()

    env = load_env()
    if not args.dry_run:
        for key in ("EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"):
            if key not in env:
                print(f"Error: {key} not found in .env")
                sys.exit(1)

    if args.body_file:
        body_content = Path(args.body_file).read_text(encoding="utf-8")
    else:
        body_content = args.body

    header_title = args.header_title or args.subject

    html = build_html(body_content, args.subject, args.badge_text, header_title, args.header_subtitle)

    if args.dry_run:
        print(html)
        return

    confirm = input(f"Send '{args.subject}' to {args.to}? Type 'send': ").strip().lower()
    if confirm != "send":
        print("Aborted.")
        sys.exit(0)

    send_email(args.to, args.subject, html, env)


if __name__ == "__main__":
    main()
