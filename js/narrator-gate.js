// Guests may read the Slide Narrator page but not run it: this blocks its two action
// buttons in the capture phase and shows the login modal instead. Loaded after
// js/auth.js (which defines b7GateButtons) and before js/app.js, which owns the buttons.
//
// A file rather than an inline <script>, so 'unsafe-inline' can come off script-src for
// the whole site — this one line was one of the three things keeping it there.
b7GateButtons(["#btn-process", "#btn-generate"], "Log in to use the Slide Narrator.");
