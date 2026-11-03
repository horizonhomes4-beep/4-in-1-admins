MATHCLOUD READING COMPREHENSION — UPDATED PACKAGE

WHAT CHANGED
- Student sign-in now uses Firebase Authentication email + password.
- The free demo opens automatically when the student clicks “Try the free demo”; no demo password is required.
- Added four demo passages with multiple-choice questions, vocabulary and explanations.
- Added comprehension-admin.html with administrator login, class creation/rename/deletion, student account creation, student activation/deactivation, student profile deletion, device lock/unlock, passage creation/publish/draft/delete and results.
- Added admin-setup.html for one-time first-administrator creation.
- Reading Comprehension data is stored under the independent Realtime Database root `comprehension/`.
- Student device locks persist after sign-out. Only an administrator can release a lock so the student can move to another device.
- Coach Reed attempts to speak on page load. Browser autoplay/speech policies can prevent automatic speech until the user interacts with the page.

SETUP
1. In Firebase Console → Authentication → Sign-in method, enable Email/Password.
2. Review `database.rules.json` before deploying. It preserves the rules present in the supplied spelling application package and adds the `comprehension/` namespace. It also contains other namespaces from that supplied file, but you must compare it with the currently deployed rules before replacing them, especially if Math Quiz or Reading Fluency has rules not present in the supplied spelling ZIP.
3. Deploy the reviewed rules in Realtime Database → Rules.
4. Upload the application files to the same hosting folder.
5. Open `admin-setup.html`, create the first administrator with name, email and password, then sign in at `comprehension-admin.html`.
6. Immediately remove `admin-setup.html` and `admin-setup.js` from public hosting after the first administrator is created. The one-time bootstrap page must not remain public.
7. Create classes, then student accounts. Give each student the email and initial password.
8. Students sign in at `index.html`. For a device change, unlock that student under “Students and device access” and have them sign in on the new device.

IMPORTANT SECURITY NOTES
- Browser-only setup cannot provide the same protection as a trusted server-side administrator bootstrap. The setup page is intended for temporary first-time use and must be deleted immediately afterward.
- Firebase Authentication accounts created by the admin panel are real Auth users. Deleting a student profile from this panel removes the profile and lock, but does not delete that user's Auth identity; remove that identity from Firebase Console → Authentication → Users if permanent deletion is required.
- Firebase web API keys are not database passwords. Database access depends on Authentication and the deployed Realtime Database rules.
- A device ID stored by a browser is a practical device lock, not hardware attestation; clearing browser storage or using another browser may appear as a new device and require administrator unlock.
- Coach Reed speech uses the browser's built-in SpeechSynthesis. A webpage cannot force browsers to autoplay speech in every browser/privacy configuration.

UPDATE: DEVICE LOCK + ONE-YEAR ACTIVATION
- Deploy the updated database_rules.json (Realtime Database -> Rules) BEFORE uploading the new files. Never deploy database_rules_comprehension_snippet.json (underscore version): it opens comprehension/ to everyone.
- Students must now be ACTIVATED by an administrator: Students table -> "Activate 1 year". Passages stay locked (also enforced by the database rules) until activation, and lock again when the year ends. Existing students must be activated once.
- "Renew +1 year" adds a year to the current expiry (or from today if already expired). "Revoke" removes the activation immediately.
- Student dashboard shows a live countdown (days / hours / minutes / seconds), the expiry date and a progress bar; it turns amber in the last 30 days.
- Device lock (same as the Spelling Enhancer): the first sign-in locks the account to that browser; any other device is refused. The admin Students table shows 🔒 Locked / 🔓 Unlocked and a single "Unlock device" button that clears the lock; the next sign-in then locks to the new device, and the old device is signed out automatically.
- The old "Activate/Deactivate" account button is now "Enable login / Disable login" (it only controls whether the student may sign in).

UPDATE: DEVICE LOCK VISIBILITY
- Students now see a status line on the dashboard ("locked to this device" / "device unlocked").
- Before opening a passage and before saving a result, the app re-checks the device lock, so a lost live connection cannot be used to keep working on a second device.
- The admin Device column always shows the "Unlock device" button, exactly as in the Spelling admin.
