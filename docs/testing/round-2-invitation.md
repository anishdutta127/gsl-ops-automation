# GSL Ops round 2 testing invitation (DRAFT)

**Status:** draft for Anish review.
**Channel:** Email + Teams ping with link.
**Send date:** TBD by Anish.
**Recipients:** Misba, Swati, Gowri, Anita, Ameet, Pratik, Vishwanath, Shashank, Pradeep, Shubhangi, Pranav, plus any additional testers Anish wants.

---

## Subject line

GSL Ops round 2 testing : your inputs welcome (please complete by [DATE])

---

## Email body

Hi everyone,

Thank you for the round 1 walkthrough comments. Your feedback drove a substantial round of work between rounds (full architecture overview at `docs/RUNBOOK.md` §11.13 if you want the detail). Round 2 is now open for testing.

**What's new since round 1:**

- **Operations Control Dashboard at the homepage.** The home route `/` now opens to the Operations Control Dashboard: rate-of-change tiles for actuals confirmed, payments received, dispatches in transit, escalations open, plus today's MOU-status snapshot and a Recent MOU Updates feed at the bottom.
- **MOU Pipeline at `/kanban`.** The drag-and-drop kanban view you used in round 1 is now reached via the "MOU Pipeline" link in the top navigation. URL stays the same; the rename is the only change.
- **Smart template suggestions on the MOU detail page.** When you open an MOU, the right-column "Smart suggestions" card shows templates the system thinks you may want to send next (based on the MOU's current lifecycle stage). Click a suggestion to compose; copy the body to Outlook; mark sent. Phase 1 stays manual-send by design.
- **MOU detail page restructure.** Sticky action bar at the top (status chip + action buttons + status notes textarea); two-column body on tablet / desktop (60% left = MOU details + lifecycle progress + audit log; 40% right = collapsible cards for Intake, Instalments, Dispatches, Communications, Escalations, Smart Suggestions). Mobile collapses to single column.
- **Design system polish across every list, detail, and form surface.** Buttons, status chips, and form inputs now share a consistent visual language. No functionality changed; only visuals.
- **Help docs swept.** "Kanban" wording in `/help` updated to "MOU Pipeline" to match the surface label rename.

**Auto-sync is live.** Anything you submit (intake, dispatch, payment receipt, etc.) drains into the canonical files within 5 minutes. The form's confirmation banner sets expectations; refresh the page or switch tabs and your row appears.

**What to test (per role):**

I'd appreciate you spend ~30 to 45 minutes exercising your role's primary surfaces and reporting anything that feels off. Specific prompts below; please use whichever frame is most useful to you.

**Misba (OpsHead) : ~45 minutes**
- Walk through the Operations Control Dashboard. Are the right metrics surfaced? Anything missing?
- Open a MOU at the actuals-confirmed stage (try `MOU-STEAM-2627-001` or any other). Is the smart-suggestions panel surfacing the templates you'd actually want?
- `/admin/dispatch-requests`: queue 2 or 3 mock requests; approve one with edited line items; reject another with a reason; cancel a third. Does the flow feel right?
- `/admin/inventory`: confirm the Out / Low / Sunset badges render visibly. Edit a threshold; confirm the change persists.
- `/admin/audit`: filter by user, action, entity. Are the filter chips intuitive?

**Swati / Gowri / Anita (Ops) : ~30 minutes each**
- Walk through a typical day: dashboard → click a card on the MOU Pipeline → confirm actuals → record payment → raise dispatch → mark delivered. Any friction points?
- Try the Communications history card on the MOU detail page. Does the chronology read clearly?
- `/admin/reminders`: compose a reminder; copy to Outlook (or test fields); mark sent. Does the manual-send flow read smoothly?

**Ameet (Leadership) : ~20 minutes**
- Open the Operations Control Dashboard. Is this the entry-point view you wanted?
- Try the filter row (Financial Year + From / To dates). Is the date-range behaviour intuitive?
- Look at the Recent MOU Updates table at the bottom of the dashboard. Is the rate-of-change view useful for your weekly review?

**Pratik (SalesHead) : ~30 minutes**
- `/sales-pipeline`: log 2 or 3 mock opportunities (mix of regions including Mumbai / Pune / Bangalore where we don't have schools yet). Test the New opportunity form.
- Click into an opportunity. If a token-match panel appears (did-you-mean), try both Link and Keep-as-new actions on different rows.
- Mark one opportunity as lost. Does the flow read clearly?
- D-026 (status / recce / approval vocabulary) is open for your review. I'll set up a 30-minute call separately to walk through.

**Vishwanath (SalesRep) : ~30 minutes**
- Visit the dashboard. The SalesRep view should default-scope to your own assigned MOUs and own opportunities.
- Open one of your assigned MOUs. Is the right side panel (collapsible cards) intuitive?
- `/sales-pipeline`: confirm you only see your own opportunities by default. Toggle the Owner filter to "All" to see the full list. Does the toggle behaviour read clearly?
- `/dispatch/request`: submit one mock dispatch request for an MOU you're assigned to.

**Shashank (TrainerHead) : ~20 minutes**
- Open the Academics-lane view on `/escalations` (filter by lane). Are the chips clear?
- Open a mock escalation; review the audit log; try the Edit form (Category + Type free-text taxonomy).
- D-038 (per-MOU trainer roster shape) is a Phase 1.1 conversation; I'll set that up separately.

**Pradeep (Admin) : ~30 minutes**
- Walk through every `/admin/*` index page. Anything visually off post-design-system polish?
- Trigger the System sync panel from `/admin` (Run import sync now + Run health check now). Confirm flash messages appear.
- Skim `/admin/audit` for any obviously wrong row; should be calm given the small fixture.

**Shubhangi / Pranav (Finance) : ~15 minutes each**
- Open an MOU at the actuals-confirmed stage. Click Generate PI. Confirm the PI button is visible to you (Finance + Admin only; should NOT be visible to Ops or Sales).
- After generating, confirm the PI counter increment on `/admin/pi-counter` (you should see Next PI number tick up by 1).

**How to report issues:**

- **Bugs (something broken):** Teams DM to Anish with a screenshot + URL + 1 line of context ("Filter X doesn't narrow when Y").
- **UX feedback (something works but feels wrong):** Same Teams DM channel; tag with "UX:" prefix in the message.
- **Workflow questions (how do I X?):** Open `/help` first; it has 17 articles covering common flows. If `/help` doesn't answer, Teams DM.
- **Anything else:** Teams DM Anish.

**Important:**

- Production data is fixture-only; nothing you do changes anything beyond the testing system. Use realistic-shaped data freely.
- The auto-sync runs every 5 minutes. Don't refresh impatiently if a write doesn't appear immediately; the confirmation banner is your signal that it submitted.
- `/help` has been updated to match the new surface labels. If you find prose that still says "Kanban" instead of "MOU Pipeline", flag it; I may have missed a sweep target.

**Timeline:**

Please complete your pass within 7 days of receiving this email (so by [DATE]). Round 2 fixes batch starts the day after the response window closes.

Thanks again for the time. Round 1 inputs measurably moved the product; round 2 is what gets us to the Phase 1 close.

Best,
Anish

---

## Internal notes (not part of email)

- **Sender:** Anish, from `anish.d@getsetlearn.info`. Use BCC for the recipient list so testers don't see each other's email addresses (some are senior leadership; reply-all-storm risk).
- **Calendar invite:** Anish should send Pratik + Shashank separate calendar holds for the D-026 / D-038 conversations BEFORE this email goes out. The email text references those holds; if the holds aren't set, the timeline reads as homework not a meeting.
- **Production URL:** the email refers to the production deployment without specifying. Confirm with `gh run list --workflow=sync-queue-cron --limit=1` that the cron is healthy in the 24 hours before send. If the cron has been unhealthy, hold the email until recovered (the auto-sync narrative is core to the round 2 promise).
- **Credential reminder:** if any tester forgets their password, RUNBOOK §1.2 covers the credential distribution process. Phase 1 has no self-serve reset; Anish handles ad-hoc.
- **Round 2 fix batch scope:** keep tightly scoped to issues testers raise, not net-new features. W4.5-A through W4.5-E if multiple batches are needed; otherwise a single W4.5 with sub-commits.
- **Edit pass:** tighten any clichéd phrasing; enforce British English (defaults are fine but watch for "ize" suffixes); keep the role-specific blocks fresh (don't let them feel formulaic).
