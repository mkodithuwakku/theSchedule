export type EmailRow = {
  label: string;
  value: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailFrame(title: string, content: string) {
  return `
    <div style="margin: 0 auto; max-width: 560px; padding: 32px 20px; font-family: Arial, Helvetica, sans-serif; color: #121824;">
      <p style="margin: 0 0 12px; color: #0f62a3; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">The Schedule</p>
      <h1 style="margin: 0 0 16px; font-size: 28px; line-height: 1.2;">${escapeEmailHtml(title)}</h1>
      ${content}
    </div>
  `;
}

function emailAction(
  actionLabel: string,
  actionUrl: string,
  options: { openInNewWindow?: boolean } = {}
) {
  const safeActionUrl = escapeEmailHtml(actionUrl);
  const browserAttributes = options.openInNewWindow
    ? ' target="_blank" rel="noopener noreferrer"'
    : "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="border-radius: 10px; background: #0f62a3;">
          <a href="${safeActionUrl}"${browserAttributes} style="display: block; padding: 14px 22px; color: #ffffff; font-size: 16px; font-weight: 700; text-align: center; text-decoration: none;">
            ${escapeEmailHtml(actionLabel)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px; color: #5f6877; font-size: 13px; line-height: 1.5;">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; word-break: break-all;">
      <a href="${safeActionUrl}"${browserAttributes} style="color: #0f62a3;">${safeActionUrl}</a>
    </p>
  `;
}

export function actionNotificationEmail(
  title: string,
  detail: string,
  actionLabel: string,
  actionUrl: string,
  options?: { openInNewWindow?: boolean }
) {
  return {
    subject: title,
    html: emailFrame(
      title,
      `
        <p style="margin: 0; color: #5f6877; font-size: 16px; line-height: 1.6;">${escapeEmailHtml(detail)}</p>
        ${emailAction(actionLabel, actionUrl, options)}
      `
    )
  };
}

export function ownerAlertEmail(title: string, rows: EmailRow[], appUrl?: string) {
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td style="padding: 8px 12px 8px 0; font-weight: 700; border-bottom: 1px solid #dce4ec; vertical-align: top;">${escapeEmailHtml(row.label)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #dce4ec; vertical-align: top; word-break: break-word;">${escapeEmailHtml(row.value)}</td>
        </tr>
      `
    )
    .join("");

  return {
    subject: `[The Schedule] ${title}`,
    html: emailFrame(
      title,
      `
        <p style="margin: 0 0 20px; color: #5f6877; font-size: 16px; line-height: 1.6;">The Schedule needs attention.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5;">
          ${tableRows}
        </table>
        ${appUrl ? emailAction("Open The Schedule", appUrl) : ""}
      `
    )
  };
}

export function schedulePublishedEmail(periodName: string, scheduleUrl: string, shiftsHtml: string) {
  return {
    subject: `New schedule published: ${periodName}`,
    html: emailFrame(
      `New schedule published: ${periodName}`,
      `
        <p style="margin: 0 0 20px; color: #5f6877; font-size: 16px; line-height: 1.6;">Your latest schedule is ready.</p>
        <h2 style="margin: 0 0 8px; font-size: 18px;">Your shifts</h2>
        <div style="color: #394150; font-size: 15px; line-height: 1.6;">${shiftsHtml}</div>
        ${emailAction("View the full schedule", scheduleUrl)}
      `
    )
  };
}

export function availabilityReminderEmail(periodName: string, deadline: string, availabilityUrl: string) {
  return actionNotificationEmail(
    `Availability due for ${periodName}`,
    `Please submit unavailable days or time ranges by ${deadline}.`,
    "Submit availability",
    availabilityUrl
  );
}

export function employeeInviteEmail(inviteUrl: string) {
  return actionNotificationEmail(
    "You've been invited to The Schedule",
    "Use the Google account this email was sent to to accept your invitation and access The Schedule. On a phone, the button opens your browser to finish signing in.",
    "Accept invitation",
    inviteUrl,
    { openInNewWindow: true }
  );
}
