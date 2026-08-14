// The site root goes straight to the humanizer. replace() keeps this page out of
// history so Back from the humanizer doesn't bounce here forever, and the hash rides
// along so /#pptx and /#word land on the right pane.
//
// A file rather than an inline <script> for one reason: an inline one on a single page
// meant 'unsafe-inline' had to stay in script-src for the whole site. The <meta http-equiv
// refresh> in the head still covers a browser that never runs this.
location.replace("humanizer.html" + location.hash);
