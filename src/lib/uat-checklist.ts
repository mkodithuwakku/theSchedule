export type UatCheckStatus = "not_run" | "passed" | "failed" | "blocked";

export type UatChecklistItem = {
  id: string;
  title: string;
  actor: "Manager" | "Employee" | "Manager + employee" | "System";
  steps: string[];
  expected: string;
  critical?: boolean;
  cleanRunRecommended?: boolean;
};

export type UatChecklistGroup = {
  id: string;
  title: string;
  description: string;
  items: UatChecklistItem[];
};

export const UAT_CHECKLIST_GROUPS: UatChecklistGroup[] = [
  {
    id: "release",
    title: "1. Production release and configuration",
    description: "Prove the deployed artifact, canonical URL, database, OAuth, email, and scheduled job are production-ready.",
    items: [
      {
        id: "release-canonical-url",
        title: "Canonical HTTPS URL loads",
        actor: "System",
        steps: ["Open https://mafm-schedule.vercel.app in a private window.", "Refresh once and open the same URL on a phone."],
        expected: "The sign-in screen loads over HTTPS without a redirect loop, certificate warning, or server error.",
        critical: true
      },
      {
        id: "release-signed-out-screen",
        title: "Signed-out visitors see no schedule data",
        actor: "System",
        steps: ["Open the production URL while signed out.", "Inspect the page before selecting Google sign-in."],
        expected: "Only the Google sign-in screen is visible; employee names, shifts, reports, and manager controls are not rendered.",
        critical: true
      },
      {
        id: "release-google-provider",
        title: "Google OAuth provider starts correctly",
        actor: "Manager",
        steps: ["Select Continue with Google.", "Confirm Google shows the expected application and callback domain."],
        expected: "Google opens without redirect_uri_mismatch, invalid_client, or OAuth consent configuration errors.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "release-neon-read-write",
        title: "Neon shared-state read and write",
        actor: "Manager",
        steps: ["Sign in and make a harmless workspace change such as toggling a checklist result.", "Wait for the Saved badge, refresh, and verify the change remains."],
        expected: "The status reaches Saved and the change survives refresh, proving production can read and write Neon.",
        critical: true
      },
      {
        id: "release-email-provider",
        title: "Production email provider sends",
        actor: "Manager",
        steps: ["Open Settings.", "Send a test email to the signed-in manager.", "Check the inbox and the Notifications log."],
        expected: "The email arrives once and the log records sent with no owner-alert failure.",
        critical: true
      },
      {
        id: "release-cron-auth",
        title: "Scheduled route rejects unauthenticated calls",
        actor: "System",
        steps: ["Open /api/cron/schedule-rollout directly without an Authorization header."],
        expected: "The route returns HTTP 401 and does not send reminders.",
        critical: true
      },
      {
        id: "release-cron-schedule",
        title: "Vercel Cron invokes the secured rollout",
        actor: "System",
        steps: ["Set a draft release date exactly three Edmonton calendar days ahead.", "Wait for or securely invoke the configured daily cron.", "Review NotificationLog and recipient inboxes."],
        expected: "Every active member receives one availability reminder and the route reports the correct attempted/sent/queued counts.",
        critical: true,
        cleanRunRecommended: true
      }
    ]
  },
  {
    id: "authentication",
    title: "2. Authentication, sessions, and role access",
    description: "Exercise first login, repeat login, logout, unauthorized identities, and role boundaries.",
    items: [
      {
        id: "auth-manager-first-login",
        title: "Manager first Google login links to seeded account",
        actor: "Manager",
        steps: ["Start from a clean run.", "Sign in as m.kodithuwakku803@gmail.com.", "Complete Google consent if shown."],
        expected: "The manager dashboard opens without OAuthAccountNotLinked or AccessDenied.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "auth-manager-repeat-login",
        title: "Manager repeat login uses linked account",
        actor: "Manager",
        steps: ["Sign out after the first successful login.", "Sign in again with the same Google account."],
        expected: "The manager returns to the same store without duplicate users or a new linking prompt.",
        critical: true
      },
      {
        id: "auth-employee-first-login",
        title: "Seeded employee first Google login",
        actor: "Employee",
        steps: ["Use a separate private browser profile.", "Sign in with one seeded employee Google account."],
        expected: "The employee dashboard opens and is bound to the matching email identity.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "auth-unapproved-account",
        title: "Unapproved Google account is denied",
        actor: "Employee",
        steps: ["Sign in with a Google email that has no active membership and no valid invitation."],
        expected: "Access is denied and no schedule data is shown; the screen explains that the exact email must be invited.",
        critical: true
      },
      {
        id: "auth-sign-out",
        title: "Sign out invalidates application access",
        actor: "Manager + employee",
        steps: ["Select Sign out.", "Use the browser Back button and refresh."],
        expected: "The sign-in screen is shown and protected schedule data cannot be restored from browser history.",
        critical: true
      },
      {
        id: "auth-manager-employee-view",
        title: "Manager can use only their own employee view",
        actor: "Manager",
        steps: ["Select My employee view.", "Review identity, shifts, availability, coverage, and swaps."],
        expected: "The manager acts as their own schedulable employee and cannot impersonate another employee.",
        critical: true
      },
      {
        id: "auth-employee-manager-ui",
        title: "Employee cannot open manager tools",
        actor: "Employee",
        steps: ["Sign in as an employee.", "Inspect desktop and mobile navigation and try known manager URLs/API calls."],
        expected: "Manager tabs are absent and manager-only APIs return 403 even if called manually.",
        critical: true
      },
      {
        id: "auth-multi-browser-session",
        title: "Same identity on two devices",
        actor: "Manager",
        steps: ["Sign in as the manager on two browsers.", "Refresh both and navigate between tabs."],
        expected: "Both sessions remain valid and resolve to the same manager and store.",
        critical: true
      },
      {
        id: "auth-clean-reset-invalidates-sessions",
        title: "Clean reset signs every test identity out",
        actor: "Manager + employee",
        steps: ["Keep manager and employee sessions open in separate browsers.", "Run Clean production UAT run reset as manager.", "Refresh the employee browser."],
        expected: "Both browsers return to Google sign-in and the next login follows the first-login linking path.",
        critical: true,
        cleanRunRecommended: true
      }
    ]
  },
  {
    id: "invites",
    title: "3. Employee directory and invitation lifecycle",
    description: "Test valid, invalid, duplicated, mismatched, expired, reused, and accepted invitation paths.",
    items: [
      {
        id: "invite-valid",
        title: "Manager sends a valid Gmail invitation",
        actor: "Manager",
        steps: ["Open Employees.", "Enter a new employee name and valid Gmail address.", "Select Invite."],
        expected: "The employee appears as invited, one invite is created, and the notification is logged and delivered or explicitly queued.",
        critical: true
      },
      {
        id: "invite-invalid-email",
        title: "Invalid email is rejected",
        actor: "Manager",
        steps: ["Try to invite a value without a valid email format."],
        expected: "No employee, invitation, membership, or notification is created.",
        critical: true
      },
      {
        id: "invite-duplicate-email",
        title: "Duplicate approved email is rejected",
        actor: "Manager",
        steps: ["Try to add an email already shown in the employee list using different letter casing."],
        expected: "The app reports that the Gmail account is already approved and does not create a duplicate profile.",
        critical: true
      },
      {
        id: "invite-signed-out-link",
        title: "Signed-out invite link preserves acceptance callback",
        actor: "Employee",
        steps: ["Open a fresh invite link in a signed-out private window.", "Complete Google sign-in with the invited address."],
        expected: "The user returns to the invite acceptance route, membership activates, and the app opens with invite=accepted.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "invite-email-mismatch",
        title: "Wrong Google account cannot accept invite",
        actor: "Employee",
        steps: ["Open a valid invite while signed in as a different Google email."],
        expected: "The app redirects with an email-mismatch result and leaves the invitation unaccepted.",
        critical: true
      },
      {
        id: "invite-invalid-token",
        title: "Missing or invalid invite token",
        actor: "Employee",
        steps: ["Open /api/invites/accept without a token.", "Repeat with a fabricated token."],
        expected: "The app reports missing or invalid invitation and does not create access.",
        critical: true
      },
      {
        id: "invite-reuse",
        title: "Accepted invite cannot be reused",
        actor: "Employee",
        steps: ["Successfully accept an invitation.", "Open the same link again in another browser."],
        expected: "The second attempt is invalid and does not create another membership or acceptance record.",
        critical: true
      },
      {
        id: "invite-expired",
        title: "Expired invitation is rejected",
        actor: "Employee",
        steps: ["Use a safely prepared expired invitation token.", "Open it while signed out and while signed in."],
        expected: "Both attempts report an invalid invitation and grant no access.",
        critical: true
      },
      {
        id: "invite-edit-profile",
        title: "Manager edits employee name and email",
        actor: "Manager",
        steps: ["Edit an employee, save a new name, then try a duplicate email.", "Cancel a second edit."],
        expected: "Valid edits persist, duplicate email is blocked, and Cancel leaves the stored profile unchanged."
      }
    ]
  },
  {
    id: "employee-experience",
    title: "4. Employee experience, identity, theme, and responsive layout",
    description: "Validate day-to-day employee navigation on desktop and mobile.",
    items: [
      {
        id: "employee-identity-binding",
        title: "Employee identity cannot be switched",
        actor: "Employee",
        steps: ["Inspect the signed-in name and all employee views.", "Look for any identity switcher or another employee's personal actions."],
        expected: "Every personal action is bound to the signed-in email and no impersonation control is available.",
        critical: true
      },
      {
        id: "employee-dashboard-prompts",
        title: "Missing availability prompt is prominent",
        actor: "Employee",
        steps: ["Use an employee who has not submitted availability.", "Open desktop and mobile dashboards."],
        expected: "A highlighted availability prompt and navigation badge are visible until submission.",
        critical: true
      },
      {
        id: "employee-dark-mode",
        title: "Theme preference is personal and persistent",
        actor: "Manager + employee",
        steps: ["Set one account to dark mode and another to light mode.", "Refresh and sign back in."],
        expected: "Each identity retains its own theme and does not change the other user's preference."
      },
      {
        id: "employee-mobile-navigation",
        title: "Mobile quick navigation and badges",
        actor: "Employee",
        steps: ["Open the app at phone width.", "Use all five bottom navigation actions and trigger availability/request badges."],
        expected: "Navigation remains usable, badges are readable, and content is not hidden behind the fixed bar.",
        critical: true
      },
      {
        id: "employee-team-calendar",
        title: "Employee team calendar is readable",
        actor: "Employee",
        steps: ["Open Team schedule on desktop and phone.", "Check Sunday-start weeks and long employee names."],
        expected: "The calendar starts Sunday, names are not cut off, and shifts are readable without exposing manager actions.",
        critical: true
      }
    ]
  },
  {
    id: "availability",
    title: "5. Availability lifecycle and validation",
    description: "Cover every supported availability input, edit path, deadline rule, and conflict display.",
    items: [
      {
        id: "availability-full-day",
        title: "Submit a full unavailable day",
        actor: "Employee",
        steps: ["Choose a date, Full day, and an optional note.", "Add the day and submit the draft."],
        expected: "The employee and manager both see one full-day unavailability entry with the correct date and note.",
        critical: true
      },
      {
        id: "availability-shift-template",
        title: "Submit shift-specific unavailability",
        actor: "Employee",
        steps: ["Choose a weekday, weekend, and Sunday in separate runs.", "Select Shift-specific and confirm available template choices."],
        expected: "Only templates valid for that day appear and the saved start/end times match the selected template.",
        critical: true
      },
      {
        id: "availability-custom-range",
        title: "Submit a custom time range",
        actor: "Employee",
        steps: ["Choose Custom time range.", "Enter a valid start/end range, add it, and submit."],
        expected: "The custom range and note appear correctly in employee and manager views.",
        critical: true
      },
      {
        id: "availability-invalid-range",
        title: "Reject invalid custom time ranges",
        actor: "Employee",
        steps: ["Try equal start/end times.", "Try an end time earlier than the start time."],
        expected: "Both invalid entries are rejected with a clear message and nothing is saved.",
        critical: true
      },
      {
        id: "availability-duplicate-date",
        title: "Reject duplicate unavailable date",
        actor: "Employee",
        steps: ["Add an unavailable entry for a date.", "Try adding a second entry for the same date."],
        expected: "The duplicate date is rejected and the original draft remains unchanged."
      },
      {
        id: "availability-remove-draft",
        title: "Remove an availability draft entry",
        actor: "Employee",
        steps: ["Add two draft days.", "Remove one before submission."],
        expected: "Only the selected draft entry is removed and the final submission contains the remaining entry."
      },
      {
        id: "availability-submit-none",
        title: "Submit no unavailable days",
        actor: "Employee",
        steps: ["Leave the draft empty.", "Select Submit no days."],
        expected: "The submission is marked complete and both views clearly show Fully available/No unavailable days.",
        critical: true
      },
      {
        id: "availability-edit-resubmit",
        title: "Unsubmit, edit, and resubmit",
        actor: "Employee",
        steps: ["Open a completed submission.", "Unsubmit it, add/remove a day, then submit again."],
        expected: "The manager temporarily sees the submission as missing, then receives the updated final submission without duplicates.",
        critical: true
      },
      {
        id: "availability-manager-tracker",
        title: "Manager tracker distinguishes statuses",
        actor: "Manager",
        steps: ["Prepare one missing, one fully available, one unavailable, and one invited-not-active employee."],
        expected: "The tracker shows Missing, Submitted/Fully available, detailed unavailable entries, and Invited accurately.",
        critical: true
      },
      {
        id: "availability-deadline",
        title: "Availability closes after deadline",
        actor: "Employee",
        steps: ["Set the release/deadline so the Edmonton current date is after availabilityDeadlineAt.", "Try adding, submitting, un-submitting, and editing."],
        expected: "All availability mutations are disabled or rejected while existing submissions remain readable.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "availability-release-date",
        title: "Manager release date updates deadline",
        actor: "Manager",
        steps: ["Change Schedule due in Settings.", "Review the calculated availability due date and reminder window."],
        expected: "The availability deadline moves to two days before release and persists after refresh."
      }
    ]
  },
  {
    id: "builder",
    title: "6. Schedule generation and manager builder",
    description: "Exercise draft generation, editing, assignment, conflict detection, warnings, and visual/export behavior.",
    items: [
      {
        id: "builder-auto-disabled",
        title: "Auto-complete waits for all availability",
        actor: "Manager",
        steps: ["Keep at least one active employee submission missing.", "Open Builder."],
        expected: "Auto complete is disabled and the missing count identifies why.",
        critical: true
      },
      {
        id: "builder-generate",
        title: "Generate/auto-complete a draft",
        actor: "Manager",
        steps: ["Collect every active employee's availability.", "Select Auto complete."],
        expected: "Shift blocks are assigned only to active members and the draft is saved to Neon.",
        critical: true
      },
      {
        id: "builder-manager-schedulable",
        title: "Manager can receive floor shifts",
        actor: "Manager",
        steps: ["Assign at least one shift to the manager.", "Switch to My employee view."],
        expected: "The manager appears as a normal schedulable person and sees the shift in My shifts.",
        critical: true
      },
      {
        id: "builder-manual-assignment",
        title: "Manually assign and reassign a shift",
        actor: "Manager",
        steps: ["Select a shift and assign an employee.", "Reassign it to another active employee."],
        expected: "The calendar updates immediately, notification activity is recorded, and only the final assignee remains."
      },
      {
        id: "builder-external-assignee",
        title: "Assign an external worker name",
        actor: "Manager",
        steps: ["Select a shift and use the external assignee field.", "Review calendar and export."],
        expected: "The external name is clearly distinguished and does not gain application access or employee actions."
      },
      {
        id: "builder-conflict-warning",
        title: "Availability conflict is visible",
        actor: "Manager",
        steps: ["Assign an employee to a shift overlapping submitted unavailability."],
        expected: "The assignment is visibly flagged and Publish Confirmation includes a conflict warning.",
        critical: true
      },
      {
        id: "builder-add-edit-remove",
        title: "Add, edit, and remove a shift block",
        actor: "Manager",
        steps: ["Add a shift on a calendar date.", "Change its date/time/assignee.", "Remove it."],
        expected: "Each change persists, totals recalculate, and removing an assigned shift records activity/notification."
      },
      {
        id: "builder-clear-assignments",
        title: "Clear names without deleting shift slots",
        actor: "Manager",
        steps: ["Assign several shifts.", "Select Clear names and confirm."],
        expected: "All employee/external assignments clear, shift blocks remain, and coverage/swaps are cleared."
      },
      {
        id: "builder-unassigned-filter",
        title: "Unassigned-only filter",
        actor: "Manager",
        steps: ["Leave a mix of assigned and unassigned shifts.", "Toggle Unassigned."],
        expected: "Only unassigned shifts are emphasized/shown and toggling back restores the complete calendar."
      },
      {
        id: "builder-calendar-layout",
        title: "Sunday-start calendar and long names",
        actor: "Manager",
        steps: ["Review every week and dates outside the period.", "Assign employees with long names."],
        expected: "Weeks start Sunday, out-of-period cells are distinct, and names/times remain readable on supported widths.",
        critical: true
      },
      {
        id: "builder-snapshot-exports",
        title: "Schedule PNG and PDF exports",
        actor: "Manager",
        steps: ["Export the same draft as Image and PDF.", "Open both files and inspect every week."],
        expected: "Both files download, contain the correct period and assignments, and have no clipped names or blank pages."
      }
    ]
  },
  {
    id: "publishing",
    title: "7. Publish confirmation and notification delivery",
    description: "Verify warnings, cancellation, publication, consolidated messages, retry deduplication, and post-publish state.",
    items: [
      {
        id: "publish-no-shifts",
        title: "Cannot publish an empty schedule",
        actor: "Manager",
        steps: ["Prepare a scenario with no shift blocks.", "Try to publish."],
        expected: "Publication is blocked with a clear instruction to add/generate shifts.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "publish-warning-summary",
        title: "Publish review summarizes every warning",
        actor: "Manager",
        steps: ["Prepare missing availability, unassigned shifts, pending invite assignment, and an availability conflict.", "Open Publish Confirmation."],
        expected: "Every applicable warning and the assigned/unassigned totals appear before confirmation.",
        critical: true
      },
      {
        id: "publish-cancel",
        title: "Cancel publication leaves draft unchanged",
        actor: "Manager",
        steps: ["Open Publish Confirmation.", "Select Cancel and refresh."],
        expected: "The period remains draft, no publication emails are sent, and assignments remain editable."
      },
      {
        id: "publish-confirm",
        title: "Confirm publication persists the final schedule",
        actor: "Manager",
        steps: ["Open Publish Confirmation and confirm.", "Refresh from a second device."],
        expected: "The period becomes published, original shift snapshots are captured in state, and both devices show the same assignments.",
        critical: true
      },
      {
        id: "publish-consolidated-email",
        title: "One consolidated email per active member",
        actor: "Manager + employee",
        steps: ["Publish a schedule with multiple shifts per person.", "Check every active member inbox and NotificationLog."],
        expected: "Each active member gets exactly one email listing all of their shifts; no inactive/uninvited recipient is mailed.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "publish-deduplication",
        title: "Publication retry does not duplicate emails",
        actor: "System",
        steps: ["Safely retry the same publication request or replay after a timeout.", "Inspect inboxes and deduplication records."],
        expected: "Existing deduplication keys are skipped and no recipient receives the same publication twice.",
        critical: true
      },
      {
        id: "publish-provider-failure",
        title: "Email provider failure is visible",
        actor: "System",
        steps: ["Using a safe failure setup, cause one delivery to fail.", "Review Notifications and owner-alert behavior."],
        expected: "Publication remains recorded, the failed delivery has a failure reason, and the owner receives a software-attention alert.",
        critical: true
      },
      {
        id: "publish-repeat-control",
        title: "Published schedule cannot be accidentally published again",
        actor: "Manager",
        steps: ["After a successful publish, return to Builder."],
        expected: "The Publish control is disabled and a casual repeat click cannot resend notifications."
      }
    ]
  },
  {
    id: "coverage",
    title: "8. Coverage request lifecycle",
    description: "Test open, offer, eligibility blocks, approval, rejection, assignment changes, and notifications.",
    items: [
      {
        id: "coverage-open",
        title: "Assigned employee requests coverage",
        actor: "Employee",
        steps: ["Open My shifts on a published schedule.", "Request coverage for one owned shift."],
        expected: "One open request appears for coworkers and the manager; appropriate notifications and audit activity are created.",
        critical: true
      },
      {
        id: "coverage-duplicate",
        title: "Duplicate active coverage request is prevented",
        actor: "Employee",
        steps: ["Try to request coverage again for the same shift."],
        expected: "A second active request is not created."
      },
      {
        id: "coverage-self-block",
        title: "Requester/current assignee cannot offer",
        actor: "Employee",
        steps: ["View the open request as its requester and as the current shift owner."],
        expected: "No Offer action is available for the person who already owns/requested the shift.",
        critical: true
      },
      {
        id: "coverage-same-day-block",
        title: "Coworker already working that day is blocked",
        actor: "Employee",
        steps: ["Open the request as a coworker with another shift on the same date."],
        expected: "The Offer action is disabled and explains that the employee already works that day.",
        critical: true
      },
      {
        id: "coverage-unavailable-block",
        title: "Unavailable coworker is blocked",
        actor: "Employee",
        steps: ["Open the request as a coworker whose submitted availability overlaps the shift."],
        expected: "The Offer action is disabled and explains the availability conflict.",
        critical: true
      },
      {
        id: "coverage-offer",
        title: "Eligible coworker offers coverage",
        actor: "Employee",
        steps: ["Open the request as an eligible coworker.", "Select Offer."],
        expected: "Status becomes offered and both requester and manager receive the correct notification.",
        critical: true
      },
      {
        id: "coverage-approve",
        title: "Manager approves coverage",
        actor: "Manager",
        steps: ["Open Requests and approve an offered request.", "Refresh both employee views."],
        expected: "The shift transfers to the claimant, status becomes approved, hours recalculate, and both employees are notified.",
        critical: true
      },
      {
        id: "coverage-reject",
        title: "Manager rejects coverage",
        actor: "Manager",
        steps: ["In a separate clean scenario, reject an offered request."],
        expected: "The original assignee keeps the shift, status becomes rejected, and requester/claimant receive rejection notifications.",
        critical: true,
        cleanRunRecommended: true
      }
    ]
  },
  {
    id: "swaps",
    title: "9. Shift swap lifecycle",
    description: "Exercise valid swaps, all eligibility constraints, employee response, manager decision, and final schedule mutation.",
    items: [
      {
        id: "swap-valid-request",
        title: "Employee requests a valid two-shift swap",
        actor: "Employee",
        steps: ["Select one owned shift and another employee's eligible shift.", "Enter a reason and request the swap."],
        expected: "The target employee receives one pending response request with both shift details.",
        critical: true
      },
      {
        id: "swap-own-shift-only",
        title: "Requester must choose their own shift",
        actor: "Employee",
        steps: ["Attempt to use a shift not assigned to the signed-in employee as the offered shift."],
        expected: "The request is disabled/rejected and no swap record is created.",
        critical: true
      },
      {
        id: "swap-unassigned-target",
        title: "Unassigned target shift is rejected",
        actor: "Employee",
        steps: ["Attempt to target an unassigned shift."],
        expected: "The shift is unavailable for selection or the request is rejected."
      },
      {
        id: "swap-same-employee",
        title: "Cannot swap two shifts owned by the same employee",
        actor: "Employee",
        steps: ["Attempt to choose another one of the requester's shifts as the target."],
        expected: "The request is blocked with an explanatory message."
      },
      {
        id: "swap-same-day-conflict",
        title: "Same-day work conflict blocks swap",
        actor: "Employee",
        steps: ["Choose a target that would make either employee work two shifts on one date."],
        expected: "The invalid target is disabled and the conflict identifies the affected employee.",
        critical: true
      },
      {
        id: "swap-availability-conflict",
        title: "Availability conflict blocks swap",
        actor: "Employee",
        steps: ["Choose shifts where either recipient is unavailable for the shift they would receive."],
        expected: "The swap is blocked and the message identifies the unavailable recipient.",
        critical: true
      },
      {
        id: "swap-target-decline",
        title: "Target employee declines swap",
        actor: "Employee",
        steps: ["Open the request as the target employee.", "Select Decline."],
        expected: "Status becomes declined by employee, assignments stay unchanged, and requester/manager notifications are correct.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "swap-target-accept-manager-reject",
        title: "Target accepts and manager rejects",
        actor: "Manager + employee",
        steps: ["Accept as the target employee.", "Reject as manager."],
        expected: "Status becomes rejected by manager, assignments stay unchanged, and both employees are notified.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "swap-target-accept-manager-approve",
        title: "Target accepts and manager approves",
        actor: "Manager + employee",
        steps: ["Accept as the target employee.", "Approve as manager.", "Refresh both accounts."],
        expected: "The two shift assignees exchange exactly once, status is approved, hours update, and both employees are notified.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "swap-revalidate-before-approval",
        title: "Changed schedule invalidates pending swap",
        actor: "Manager",
        steps: ["Create a pending manager swap.", "Change one involved assignment or availability to create a conflict.", "Try to approve."],
        expected: "Approval revalidates current state, blocks the stale swap, and leaves assignments unchanged.",
        critical: true
      }
    ]
  },
  {
    id: "reports-issues",
    title: "10. Reports, exports, UAT issues, and audit visibility",
    description: "Confirm operational outputs and the feedback loop used during production UAT.",
    items: [
      {
        id: "reports-hours",
        title: "Hours totals and deltas",
        actor: "Manager",
        steps: ["Review Reports before and after an approved coverage/swap.", "Manually total a sample employee's shifts."],
        expected: "Initial, final, shift count, and delta values match the actual schedule.",
        critical: true
      },
      {
        id: "reports-csv",
        title: "Hours CSV export",
        actor: "Manager",
        steps: ["Download the hours CSV.", "Open it in a spreadsheet and compare several rows."],
        expected: "The file opens cleanly with correct names, hours, shift counts, and no formula/encoding corruption."
      },
      {
        id: "reports-print",
        title: "Printable hours report",
        actor: "Manager",
        steps: ["Select Print and inspect print preview on portrait and landscape."],
        expected: "Navigation is hidden, the table is readable, and rows/columns are not clipped."
      },
      {
        id: "issues-create",
        title: "Manager and employee can report a UAT issue",
        actor: "Manager + employee",
        steps: ["Log issues from manager and employee modes using different categories.", "Inspect the manager UAT Issues tab."],
        expected: "Each issue records reporter context, role, active tab, theme, time, and sends/logs an owner alert.",
        critical: true
      },
      {
        id: "issues-resolve-reopen",
        title: "Resolve and reopen a UAT issue",
        actor: "Manager",
        steps: ["Resolve an open issue.", "Reopen it and refresh."],
        expected: "Status and timestamps update correctly and persist."
      },
      {
        id: "issues-export",
        title: "UAT issue CSV and JSON exports",
        actor: "Manager",
        steps: ["Export issues as CSV and JSON.", "Open both files and compare counts/content."],
        expected: "Both downloads are valid and preserve issue status and context."
      },
      {
        id: "notifications-log",
        title: "Notification preview and log statuses",
        actor: "Manager",
        steps: ["Trigger invite, availability, publish, coverage, swap, issue, and test-email notifications.", "Review Notifications."],
        expected: "Subjects, recipients, types, and sent/queued/failed statuses match the triggering actions."
      }
    ]
  },
  {
    id: "persistence",
    title: "11. Persistence, concurrency, refresh, and recovery",
    description: "Exercise the production behaviors most likely to expose lost updates or stale browser state.",
    items: [
      {
        id: "persistence-refresh",
        title: "Every major action survives refresh",
        actor: "Manager + employee",
        steps: ["After each major workflow action, wait for Saved and refresh."],
        expected: "The latest server-backed state reloads without reverting the action.",
        critical: true
      },
      {
        id: "persistence-second-device",
        title: "Second device sees saved changes",
        actor: "Manager + employee",
        steps: ["Make a change on device A and wait for Saved.", "Refresh device B."],
        expected: "Device B shows the same workspace state and identity-scoped controls.",
        critical: true
      },
      {
        id: "persistence-simultaneous-availability",
        title: "Two employees save near-simultaneously",
        actor: "Manager + employee",
        steps: ["Submit different availability from two employee browsers within a few seconds.", "Refresh both and the manager tracker."],
        expected: "Both submissions remain; neither employee's save erases the other's data.",
        critical: true
      },
      {
        id: "persistence-manager-employee-race",
        title: "Manager and employee save near-simultaneously",
        actor: "Manager + employee",
        steps: ["Change a shift as manager while an employee submits availability.", "Wait for Saved and refresh both."],
        expected: "Both authorized changes survive without schedule or availability rollback.",
        critical: true
      },
      {
        id: "persistence-employee-sanitization",
        title: "Employee write cannot alter manager-owned fields",
        actor: "Employee",
        steps: ["Keep an employee page open while manager changes the schedule.", "Have the employee save an allowed action and refresh."],
        expected: "Employee availability/request persists but cannot overwrite people, period, shifts, manager approvals, or another employee's data.",
        critical: true
      },
      {
        id: "persistence-offline-recovery",
        title: "Temporary network failure is visible and recoverable",
        actor: "Manager + employee",
        steps: ["Temporarily disable network, make a harmless change, then reconnect.", "Refresh after verifying server state."],
        expected: "The app shows Local/Error rather than falsely claiming Saved; recovery does not silently overwrite newer server data.",
        critical: true
      },
      {
        id: "persistence-browser-cache",
        title: "Old browser cache does not restore reset data",
        actor: "Manager + employee",
        steps: ["Keep an old tab open, perform a clean reset elsewhere, then refresh the old tab."],
        expected: "The old session is invalid and stale localStorage cannot repopulate the clean Neon workspace.",
        critical: true,
        cleanRunRecommended: true
      }
    ]
  },
  {
    id: "security-failures",
    title: "12. Authorization and failure paths",
    description: "Directly test server-side enforcement and safe behavior when dependencies or inputs fail.",
    items: [
      {
        id: "security-signed-out-apis",
        title: "Signed-out API requests are unauthorized",
        actor: "System",
        steps: ["While signed out, call test-state, publish, invites, reports, notifications, and reset endpoints."],
        expected: "Every protected endpoint returns 401 and performs no mutation.",
        critical: true
      },
      {
        id: "security-employee-manager-apis",
        title: "Employee cannot call manager APIs",
        actor: "Employee",
        steps: ["As an employee, directly call publish, invite, report export, full reset, and manager-style notification requests."],
        expected: "Every manager-only operation returns 403 and changes nothing.",
        critical: true
      },
      {
        id: "security-employee-cross-user-write",
        title: "Employee cannot modify another employee",
        actor: "Employee",
        steps: ["Attempt a crafted state write containing another employee's availability, request, preference, issue resolution, or audit entry."],
        expected: "Only the signed-in employee's permitted additions are retained; forged changes are discarded.",
        critical: true
      },
      {
        id: "security-publish-stale-period",
        title: "Stale publish request is rejected",
        actor: "Manager",
        steps: ["Keep an old Builder tab open while changing the active period elsewhere.", "Attempt to publish from the stale tab."],
        expected: "The API returns conflict and instructs the manager to refresh; no email is sent.",
        critical: true
      },
      {
        id: "security-publish-invalid-shift",
        title: "Publish rejects shifts from another period",
        actor: "Manager",
        steps: ["Using a controlled request, include a shift with a different schedulePeriodId."],
        expected: "The API returns 400 and does not publish or notify.",
        critical: true
      },
      {
        id: "failure-email-unconfigured",
        title: "Missing email provider degrades safely",
        actor: "System",
        steps: ["In a non-production/safe environment without RESEND_API_KEY, trigger notifications."],
        expected: "Actions complete with queued status; no code crashes or falsely records sent."
      },
      {
        id: "failure-owner-alert",
        title: "Software-impacting failure alerts owner",
        actor: "System",
        steps: ["Safely simulate invite creation or notification delivery failure.", "Check owner inbox/log."],
        expected: "The owner alert includes operation, recipient/context, provider reason, and occurrence time.",
        critical: true
      },
      {
        id: "failure-no-partial-publish",
        title: "Publish failure is understandable and retryable",
        actor: "Manager",
        steps: ["Safely interrupt a publish request or simulate a server error.", "Return to Builder and inspect state before retrying."],
        expected: "The manager sees a clear error, existing draft data remains available, and retry deduplication prevents duplicate emails.",
        critical: true
      }
    ]
  },
  {
    id: "reset",
    title: "13. Clean production UAT reset",
    description: "Prove the destructive reset is manager-only, explicit, complete, and safe to use between full test runs.",
    items: [
      {
        id: "reset-confirmation",
        title: "Typed confirmation is required",
        actor: "Manager",
        steps: ["Open the clean reset panel.", "Try an empty value and a near-match before entering the exact phrase."],
        expected: "The destructive button stays disabled until the exact confirmation phrase is entered.",
        critical: true
      },
      {
        id: "reset-manager-only",
        title: "Only an active manager can reset",
        actor: "Employee",
        steps: ["Attempt the reset endpoint as an employee and while signed out."],
        expected: "Employee receives 403, signed-out receives 401, and existing data remains intact.",
        critical: true
      },
      {
        id: "reset-complete-state",
        title: "Reset clears all UAT artifacts",
        actor: "Manager",
        steps: ["Create invitations, checklist results, availability, draft assignments, publish logs, coverage, swaps, notifications, issues, and theme preferences.", "Run the clean reset and sign back in."],
        expected: "All artifacts are gone; the seeded people, store configuration, blank pre-release workspace, and empty checklist remain.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "reset-first-logins",
        title: "Reset restores first-login behavior for all seeded accounts",
        actor: "Manager + employee",
        steps: ["After reset, sign in once with each of the four seeded Google accounts."],
        expected: "Each identity links once to its preserved seeded user/membership and opens the correct role without duplicate users.",
        critical: true,
        cleanRunRecommended: true
      },
      {
        id: "reset-email-dedup",
        title: "New run can resend scheduled/publication emails",
        actor: "Manager",
        steps: ["After reset, repeat reminder and publication flows using the new clean run."],
        expected: "Old notification deduplication records do not suppress legitimate emails in the new run.",
        critical: true,
        cleanRunRecommended: true
      }
    ]
  }
];

export const UAT_CHECKLIST_ITEMS = UAT_CHECKLIST_GROUPS.flatMap((group) => group.items);

export function normalizeUatChecklistProgress(candidate: unknown): Record<string, UatCheckStatus> {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};

  const validIds = new Set(UAT_CHECKLIST_ITEMS.map((item) => item.id));
  const validStatuses = new Set<UatCheckStatus>(["not_run", "passed", "failed", "blocked"]);

  return Object.fromEntries(
    Object.entries(candidate)
      .filter(([id, status]) => validIds.has(id) && validStatuses.has(status as UatCheckStatus) && status !== "not_run")
      .map(([id, status]) => [id, status as UatCheckStatus])
  );
}
