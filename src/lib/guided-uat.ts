export type GuidedUatMode = "manager" | "employee";

export type GuidedUatTab =
  | "dashboard"
  | "employees"
  | "availability"
  | "builder"
  | "requests"
  | "reports"
  | "settings"
  | "uat-plan"
  | "issues"
  | "notifications"
  | "my-shifts"
  | "team"
  | "submit";

export type GuidedUatStep = {
  id: string;
  title: string;
  actor: string;
  account?: string;
  instructions: string[];
  expected: string;
  target?: {
    mode: GuidedUatMode;
    tab: GuidedUatTab;
    label: string;
  };
  optional?: boolean;
};

export type GuidedUatPhase = {
  id: string;
  title: string;
  description: string;
  steps: GuidedUatStep[];
};

export const GUIDED_UAT_ACCOUNTS = [
  { role: "Manager", email: "m.kodithuwakku803@gmail.com" },
  { role: "Employee A", email: "kodithuw@ualberta.ca" },
  { role: "Employee B", email: "m.kodithuwakku.hockey@gmail.com" },
  { role: "Employee C", email: "bobby.cazby@gmail.com" }
] as const;

export const GUIDED_UAT_PHASES: GuidedUatPhase[] = [
  {
    id: "guided-sign-in",
    title: "1. Start the run and sign everyone in",
    description: "Establish the manager session and three independent employee sessions before changing schedule data.",
    steps: [
      {
        id: "auth-manager-first-login",
        title: "Sign in as the manager",
        actor: "Manager",
        account: "m.kodithuwakku803@gmail.com",
        instructions: [
          "Open the production website in your normal browser.",
          "Select Sign in with Google and choose the manager account.",
          "Wait for the Manager Dashboard to load and confirm the top status changes to Saved."
        ],
        expected: "The manager reaches Manager tools without an access error and sees the store dashboard.",
        target: { mode: "manager", tab: "dashboard", label: "Open Manager Dashboard" }
      },
      {
        id: "release-neon-read-write",
        title: "Prove the shared workspace is saving",
        actor: "Manager",
        instructions: [
          "Wait until the header says Saved.",
          "Refresh the browser page.",
          "Confirm the same schedule period and dashboard information return after loading."
        ],
        expected: "The page reloads from the shared Neon workspace with no lost state or save error.",
        target: { mode: "manager", tab: "dashboard", label: "Open Manager Dashboard" }
      },
      {
        id: "auth-employee-first-login",
        title: "Sign in all three employees in separate browser profiles",
        actor: "Employees A, B, and C",
        instructions: [
          "Open three separate private windows or browser profiles so Google sessions do not replace each other.",
          "In the first, sign in as Employee A: kodithuw@ualberta.ca.",
          "In the second, sign in as Employee B: m.kodithuwakku.hockey@gmail.com.",
          "In the third, sign in as Employee C: bobby.cazby@gmail.com.",
          "Confirm each browser shows that employee's own name and Employee Dashboard."
        ],
        expected: "Every seeded employee signs in successfully and each browser is bound to the correct identity."
      },
      {
        id: "employee-identity-binding",
        title: "Confirm employees cannot switch identities",
        actor: "Employee A",
        account: "kodithuw@ualberta.ca",
        instructions: [
          "Look through the Employee A header and navigation.",
          "Confirm there is no employee selector or impersonation control.",
          "Confirm Manager tools is not available."
        ],
        expected: "Employee A can act only as Employee A and cannot open manager-only areas."
      }
    ]
  },
  {
    id: "guided-manager-setup",
    title: "2. Review the manager setup",
    description: "Verify the store settings, employee directory, invitations, and email path used before scheduling.",
    steps: [
      {
        id: "availability-release-date",
        title: "Review the schedule window and availability deadline",
        actor: "Manager",
        instructions: [
          "Select Settings in the manager navigation.",
          "Find the scheduling dates and review the availability deadline, release date, and schedule period.",
          "Change Schedule due to another valid date, wait for Saved, then change it back to the intended date and wait for Saved again."
        ],
        expected: "The related deadline/window updates consistently and the intended dates remain after saving.",
        target: { mode: "manager", tab: "settings", label: "Open Settings" }
      },
      {
        id: "invite-edit-profile",
        title: "Edit an employee profile and save it",
        actor: "Manager",
        instructions: [
          "Select Employees.",
          "Choose Edit on one seeded employee.",
          "Make a harmless name change, select Save, and confirm it appears in the directory.",
          "Edit the employee again and restore the original name."
        ],
        expected: "The updated profile saves without changing the employee's identity or access.",
        target: { mode: "manager", tab: "employees", label: "Open Employees" }
      },
      {
        id: "invite-valid",
        title: "Invite a new employee",
        actor: "Manager",
        instructions: [
          "On Employees, enter a first name, last name, and a spare Google email that is not already listed.",
          "Select Invite.",
          "Confirm the new person appears as invited and the invite notification is logged.",
          "If you do not have a spare Google account, mark this step Blocked and continue the rest of the run."
        ],
        expected: "A valid new Google email creates one invited employee record and one invitation attempt.",
        target: { mode: "manager", tab: "employees", label: "Open Employees" },
        optional: true
      },
      {
        id: "release-email-provider",
        title: "Send a test email",
        actor: "Manager",
        instructions: [
          "Select Settings and find Access & Email test.",
          "Confirm the displayed recipient is the signed-in manager, then select Send test email.",
          "Open the manager inbox and confirm the message arrived; then return to the app."
        ],
        expected: "The app records a successful send and the test message arrives at the chosen inbox.",
        target: { mode: "manager", tab: "settings", label: "Open Settings" }
      }
    ]
  },
  {
    id: "guided-availability",
    title: "3. Collect everyone’s availability",
    description: "Use a different normal submission style for each employee, including the manager as floor staff.",
    steps: [
      {
        id: "employee-dashboard-prompts",
        title: "Check the missing-availability prompt",
        actor: "Employee A",
        account: "kodithuw@ualberta.ca",
        instructions: [
          "In Employee A's browser, open Dashboard before submitting anything.",
          "Confirm the availability reminder is prominent.",
          "Select its availability action and confirm it opens the Availability tab."
        ],
        expected: "A missing submission produces a clear prompt that takes the employee to Availability."
      },
      {
        id: "availability-full-day",
        title: "Employee A submits a full unavailable day",
        actor: "Employee A",
        account: "kodithuw@ualberta.ca",
        instructions: [
          "On Availability, choose a date inside the displayed schedule period.",
          "Choose Full day and add a short note.",
          "Select 1. Add unavailable day, review the draft entry, then select 2. Submit draft."
        ],
        expected: "The date is saved as full-day unavailable and the submission is marked Submitted."
      },
      {
        id: "availability-shift-template",
        title: "Employee B submits shift-specific unavailability",
        actor: "Employee B",
        account: "m.kodithuwakku.hockey@gmail.com",
        instructions: [
          "In Employee B's browser, open Availability.",
          "Choose a schedule date, select Shift-specific, and select one of that day's shift templates.",
          "Select 1. Add unavailable day, then select 2. Submit draft."
        ],
        expected: "Only the chosen shift template is recorded as unavailable for Employee B."
      },
      {
        id: "availability-custom-range",
        title: "Employee C submits a custom unavailable time",
        actor: "Employee C",
        account: "bobby.cazby@gmail.com",
        instructions: [
          "In Employee C's browser, open Availability.",
          "Choose a schedule date, select Custom time range, and enter a valid start and end time.",
          "Select 1. Add unavailable day, then select 2. Submit draft."
        ],
        expected: "The exact custom time range is saved for Employee C and the submission is marked Submitted."
      },
      {
        id: "availability-submit-none",
        title: "Manager submits no unavailable days as floor staff",
        actor: "Manager in employee view",
        account: "m.kodithuwakku803@gmail.com",
        instructions: [
          "In the manager browser, select My employee view in the header.",
          "Open Availability and leave the draft empty.",
          "Select 2. Submit no days and confirm the submission status changes to Submitted.",
          "Select Manager tools in the header when finished."
        ],
        expected: "The manager is treated as schedulable staff and can submit full availability for themself.",
        target: { mode: "employee", tab: "submit", label: "Open My Availability" }
      },
      {
        id: "availability-edit-resubmit",
        title: "Employee A corrects and resubmits availability",
        actor: "Employee A",
        account: "kodithuw@ualberta.ca",
        instructions: [
          "Return to Employee A's Availability tab and select Unsubmit.",
          "Remove or change the draft entry, then add the intended entry again.",
          "Select 2. Submit draft."
        ],
        expected: "The revised availability replaces the earlier submission and returns to Submitted."
      },
      {
        id: "availability-manager-tracker",
        title: "Manager verifies all submission statuses",
        actor: "Manager",
        instructions: [
          "Return to Manager tools and select Availability.",
          "Check all four seeded staff cards.",
          "Confirm Employee A, Employee B, Employee C, and the manager show Submitted, with the appropriate unavailable or fully-available summary."
        ],
        expected: "The tracker accurately shows four completed submissions and no seeded staff member missing.",
        target: { mode: "manager", tab: "availability", label: "Open Availability Tracker" }
      }
    ]
  },
  {
    id: "guided-build",
    title: "4. Create and finish the draft schedule",
    description: "Generate the real draft, inspect the calendar, and exercise ordinary editing before publication.",
    steps: [
      {
        id: "builder-generate",
        title: "Generate and auto-complete the draft",
        actor: "Manager",
        instructions: [
          "Select Builder.",
          "Confirm the readiness panel says all required availability is in.",
          "Select Auto complete and wait for shift cards to appear."
        ],
        expected: "A complete draft is generated from the store's shift templates without assigning staff during unavailable times.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "builder-calendar-layout",
        title: "Inspect the complete calendar",
        actor: "Manager",
        instructions: [
          "Scroll through every week in the Builder calendar.",
          "Confirm each week starts on Sunday and dates are in the correct order.",
          "Confirm shift times and all employee names are readable without being cut off."
        ],
        expected: "The full period reads like a Sunday-start calendar and every scheduled name remains legible.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "builder-manager-schedulable",
        title: "Confirm the manager receives floor shifts",
        actor: "Manager",
        instructions: [
          "Find at least one shift assigned to the manager in the generated draft.",
          "If none was auto-assigned, select an unassigned shift and assign the manager.",
          "Confirm no role warning prevents the assignment."
        ],
        expected: "The manager can be assigned ordinary floor shifts like every other active employee.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "builder-manual-assignment",
        title: "Reassign one shift manually",
        actor: "Manager",
        instructions: [
          "Select a shift card in the calendar.",
          "Use the assignment panel to choose a different available employee.",
          "Confirm the name changes on the calendar, then assign it back if needed for coverage balance."
        ],
        expected: "The selected shift updates immediately and unavailable staff are visibly warned or excluded.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "builder-add-edit-remove",
        title: "Add, edit, and remove one test shift",
        actor: "Manager",
        instructions: [
          "Choose a date and select Add shift.",
          "Set valid start/end times and assign an available employee.",
          "Save, reopen the new shift, change its time, and save again.",
          "Remove only that test shift and confirm the original draft remains intact."
        ],
        expected: "The test shift can be created, edited, and removed without affecting unrelated shifts.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "builder-unassigned-filter",
        title: "Use the unassigned-only filter",
        actor: "Manager",
        instructions: [
          "Temporarily clear the employee from one shift.",
          "Select Unassigned and confirm that shift remains visible while assigned shifts are hidden.",
          "Turn the filter off and reassign the shift before continuing."
        ],
        expected: "The filter isolates unassigned work and turning it off restores the full calendar.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "persistence-refresh",
        title: "Refresh and verify the finished draft",
        actor: "Manager",
        instructions: [
          "Wait for Saved in the header.",
          "Refresh the page and return to Builder.",
          "Confirm all shift times and assignments match the draft you just finished."
        ],
        expected: "The complete draft survives refresh with no missing or reverted assignments.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      }
    ]
  },
  {
    id: "guided-publish",
    title: "5. Review and publish the schedule",
    description: "Use the same review and confirmation path the manager will use each schedule period.",
    steps: [
      {
        id: "publish-warning-summary",
        title: "Open Publish Confirmation and review it",
        actor: "Manager",
        instructions: [
          "From Builder, select Publish.",
          "Read every warning and confirm the employee notification list is complete.",
          "Review the per-employee hours snapshot and confirm there are no unexpected unassigned shifts or conflicts."
        ],
        expected: "Publish Confirmation accurately summarizes warnings, recipients, assignments, and hours before anything is published.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "publish-cancel",
        title: "Cancel publication once",
        actor: "Manager",
        instructions: [
          "On Publish Confirmation, select Cancel.",
          "Confirm the Builder returns and the period still says Draft.",
          "Confirm all shifts and assignments are unchanged."
        ],
        expected: "Cancel makes no publication or schedule change.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "publish-confirm",
        title: "Publish the finished schedule",
        actor: "Manager",
        instructions: [
          "Select Publish again.",
          "Review the final summary, then select Confirm publish.",
          "Wait for Saved and refresh the page."
        ],
        expected: "The schedule remains Published after refresh with the same final assignments.",
        target: { mode: "manager", tab: "builder", label: "Open Builder" }
      },
      {
        id: "publish-consolidated-email",
        title: "Check publication messages",
        actor: "Manager and employees",
        instructions: [
          "Check the manager inbox and each employee test inbox.",
          "Confirm each active person received one consolidated schedule email.",
          "Compare at least one email's shift list with the published calendar."
        ],
        expected: "Every active member receives one accurate consolidated schedule message, with no duplicate per-shift emails."
      },
      {
        id: "notifications-log",
        title: "Review the notification log",
        actor: "Manager",
        instructions: [
          "Select Notifications.",
          "Find the recent invitation/test-email/publication entries created during this run.",
          "Confirm each entry shows a clear recipient, event, time, and delivery status."
        ],
        expected: "The log provides an understandable record of the run's notification attempts and outcomes.",
        target: { mode: "manager", tab: "notifications", label: "Open Notifications" }
      }
    ]
  },
  {
    id: "guided-employee-review",
    title: "6. Employees review the published schedule",
    description: "Confirm the schedule is useful from the employee side before testing changes to it.",
    steps: [
      {
        id: "persistence-second-device",
        title: "Employees receive the published state",
        actor: "Employees A, B, and C",
        instructions: [
          "Refresh each employee browser.",
          "On Dashboard, confirm the schedule is shown as published.",
          "Open My shifts and compare each person's shifts with the manager calendar."
        ],
        expected: "All employee sessions receive the same published schedule without requiring a new login."
      },
      {
        id: "employee-team-calendar",
        title: "Review the team calendar",
        actor: "Employee A",
        account: "kodithuw@ualberta.ca",
        instructions: [
          "Select Team schedule in Employee A's browser.",
          "Move through the full schedule period and compare several days with the manager's Builder.",
          "Confirm names, dates, and shift times are readable."
        ],
        expected: "The team calendar matches the published schedule and remains readable across the full period."
      },
      {
        id: "employee-dark-mode",
        title: "Save a personal theme preference",
        actor: "Employee A and Employee B",
        instructions: [
          "In Employee A's browser, select the moon/sun theme control.",
          "Refresh and confirm Employee A keeps the chosen theme.",
          "Refresh Employee B's browser and confirm Employee B's theme did not change."
        ],
        expected: "Theme choice persists per signed-in identity and does not alter another employee's display."
      }
    ]
  },
  {
    id: "guided-coverage",
    title: "7. Complete a coverage request",
    description: "Move one published shift from the assigned employee to an eligible coworker with manager approval.",
    steps: [
      {
        id: "coverage-open",
        title: "Employee A requests coverage",
        actor: "Employee A",
        account: "kodithuw@ualberta.ca",
        instructions: [
          "Open My shifts and choose one future assigned shift.",
          "Select Request coverage on that shift.",
          "Open Coverage and confirm the request is listed as Open."
        ],
        expected: "One open coverage request is created for the exact published shift."
      },
      {
        id: "coverage-offer",
        title: "An eligible coworker offers coverage",
        actor: "Employee B or C",
        instructions: [
          "In another employee browser, open Coverage.",
          "Find Employee A's open request and select Offer.",
          "If that employee is blocked because of availability or same-day work, use the other employee browser."
        ],
        expected: "An eligible coworker can offer and the request changes from Open to Offered."
      },
      {
        id: "coverage-approve",
        title: "Manager approves the coverage offer",
        actor: "Manager",
        instructions: [
          "Select Requests in Manager tools.",
          "Find the offered coverage request and select Approve.",
          "Open Builder and confirm the shift is now assigned to the coworker who offered."
        ],
        expected: "Approval completes the request and changes only the requested shift's assignee.",
        target: { mode: "manager", tab: "requests", label: "Open Manager Requests" }
      }
    ]
  },
  {
    id: "guided-swaps",
    title: "8. Complete a two-employee shift swap",
    description: "Test the employee request, target acceptance, and final manager approval chain.",
    steps: [
      {
        id: "swap-valid-request",
        title: "One employee requests a valid swap",
        actor: "Employee A, B, or C",
        instructions: [
          "Choose an employee with at least one shift and open Coverage.",
          "Under Shift Swaps, select one of that employee's shifts in Your shift.",
          "Select a different employee's compatible shift in Swap with, enter a reason, and select Request swap.",
          "If the app explains a conflict, choose a different pair until the request is valid."
        ],
        expected: "A valid request appears as waiting for the target employee, with both shifts and the reason shown."
      },
      {
        id: "swap-target-accept-manager-approve",
        title: "Target accepts and manager approves the swap",
        actor: "Target employee, then Manager",
        instructions: [
          "In the target employee's browser, open Coverage and select Accept on the pending swap.",
          "In Manager tools, open Requests and find the now-pending swap.",
          "Select Approve.",
          "Refresh both employee My shifts pages and confirm the two assignments exchanged."
        ],
        expected: "The swap completes only after both approvals, and each employee receives the other's selected shift.",
        target: { mode: "manager", tab: "requests", label: "Open Manager Requests" }
      }
    ]
  },
  {
    id: "guided-finish",
    title: "9. Check reports, issue handling, backup, and sign-out",
    description: "Close the run by validating the manager's operational records and recovery protection.",
    steps: [
      {
        id: "reports-hours",
        title: "Verify the final hours report",
        actor: "Manager",
        instructions: [
          "Select Reports.",
          "Compare each employee's initial published hours with final worked hours.",
          "Confirm the coverage and swap changes produce understandable deltas and the totals match the visible shifts."
        ],
        expected: "Hours, shift counts, and deltas reconcile with the current schedule.",
        target: { mode: "manager", tab: "reports", label: "Open Reports" }
      },
      {
        id: "reports-csv",
        title: "Download the hours CSV",
        actor: "Manager",
        instructions: [
          "On Reports, select CSV.",
          "Open the downloaded file.",
          "Confirm it contains every active employee and the same figures shown in the report."
        ],
        expected: "The CSV downloads successfully and matches the on-screen hours report.",
        target: { mode: "manager", tab: "reports", label: "Open Reports" }
      },
      {
        id: "reports-print",
        title: "Open the printable report",
        actor: "Manager",
        instructions: [
          "On Reports, select Print.",
          "Inspect the browser print preview without completing a paper print.",
          "Cancel the print dialog and return to the app."
        ],
        expected: "Print preview is legible and includes the complete hours report without clipped columns.",
        target: { mode: "manager", tab: "reports", label: "Open Reports" }
      },
      {
        id: "issues-create",
        title: "Log one UAT issue",
        actor: "Manager",
        instructions: [
          "Select UAT Issues, then select Log issue.",
          "Choose a category, enter a recognizable test note, and save it.",
          "Confirm the issue appears as Open."
        ],
        expected: "The issue records its category, note, role, screen context, and creation time.",
        target: { mode: "manager", tab: "issues", label: "Open UAT Issues" }
      },
      {
        id: "issues-resolve-reopen",
        title: "Resolve and reopen the test issue",
        actor: "Manager",
        instructions: [
          "Select Resolve on the issue you just created.",
          "Confirm it moves to the resolved state with a resolution time.",
          "Select Reopen and confirm it returns to Open."
        ],
        expected: "Issue status can move from open to resolved and back without losing the original note.",
        target: { mode: "manager", tab: "issues", label: "Open UAT Issues" }
      },
      {
        id: "persistence-backup-manual",
        title: "Create the final protected schedule backup",
        actor: "Manager",
        instructions: [
          "Select Settings and find Schedule Backup.",
          "Select Back up now and wait for the success state.",
          "Confirm the latest backup time, source, size, and verification details are shown."
        ],
        expected: "A verified backup of the final schedule is stored and available for manager recovery.",
        target: { mode: "manager", tab: "settings", label: "Open Schedule Backup" }
      },
      {
        id: "persistence-backup-overwrite",
        title: "Confirm backups stay bounded",
        actor: "Manager",
        instructions: [
          "Note the latest backup metadata.",
          "Select Back up now a second time and wait for completion.",
          "Confirm the same backup slot is refreshed rather than a new daily history list being added."
        ],
        expected: "The protected backup is rewritten in place so daily protection does not grow storage without limit.",
        target: { mode: "manager", tab: "settings", label: "Open Schedule Backup" }
      },
      {
        id: "auth-sign-out",
        title: "Sign out and sign back in",
        actor: "Manager",
        instructions: [
          "Select Sign out in the header.",
          "Confirm schedule data is no longer visible.",
          "Sign in with the manager Google account again and confirm the published schedule and test progress return."
        ],
        expected: "Sign-out removes access, while the next authorized sign-in restores the saved production workspace."
      }
    ]
  }
];

export const GUIDED_UAT_STEPS = GUIDED_UAT_PHASES.flatMap((phase) => phase.steps);
