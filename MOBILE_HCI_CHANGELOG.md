# SafeTown AI — Report Hazard mobile HCI revision (v3)

## What was wrong?
The resident reporting form appeared next to the "Your report journey" panel on an iPhone, squeezing inputs and making all five severity levels overlap or extend beyond the screen.

## What changed?
- **One-column page at every screen width:** the reporting form always appears before supporting content. No side-by-side reporting cards even if the mobile media query is not applied by an embedded browser.
- **Mobile-first vertical flow:** location → incident description → resident-assessed severity → optional photo → submit.
- **Larger, one-per-row severity targets:** clear selection state and 44+ px touch controls on phones and smaller tablets.
- **Less clutter:** report journey and heatmap explanation moved below the form into independently expandable help sections.
- **No workflow/API changes:** same report data, resident selected severity, AI category classification, admin verification, status tracking, and zone risk algorithm.
- **Cache-busted frontend assets** so embedded browsers are less likely to reuse old CSS/JS after updating.

## How to check
1. Stop the old running server (Ctrl+C in the terminal) before starting the updated `run_windows.bat`.
2. Extract the new ZIP to a NEW folder, then launch from that folder.
3. Use `http://YOUR-LAPTOP-IP:8002` on the phone (same Wi-Fi). If opened inside Telegram, try Safari/Chrome directly.
4. Log in as Resident → Report a hazard.
5. The form should use **full-width, single column**, and `What happens after I submit?` should be **under** the submit button, initially collapsed.
