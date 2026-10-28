# Paperclip -- device test

The parts Jest can't reach. Walk through this on a Nomad after a build that touches native code, the sticker or the SDK calls. Last run: versionName 0.90, versionCode 91, firmware 3.31.45.

## Install

1. Copy `paperclip.snplg` into `MyStyle` on the Nomad.
2. Settings > Apps > Plugins, install it. A higher versionCode replaces any earlier Paperclip build.

The first action that touches a page asks for file access (FILE:READ, then FILE:WRITE). Pick "always". "This time only" works too, but then it asks again every time the plugin wakes up. If access isn't there by the time the dialog closes, the float says "File access not granted yet. Allow it, then tap the paperclip again." and nothing is written. The very first press used to fail with a 1503 error even after allowing access. Seeing the new message once and then a working second press is fine, but note it.

## The script

One action per line, then what should happen. Use a new notebook so old labels aren't in the way. Page numbers are the Nomad's own, starting at 1.

### Flow 1: fresh notebook

1. New notebook, page 1. Tap the paperclip in the toolbar. **Should see:** a float in the upper right titled "Paperclip", with "Add label" and "Close". No full-screen flash first.
2. Tap "Add label". **Should see:** the float closes. Nothing on the page changes.
3. Write "Hello" somewhere on the page, lasso it, tap "Paperclip label" in the lasso toolbar. **Should see:** the paperclip sticker in the upper right corner of the page, clear of the toolbar. No float.
4. Tap the toolbar paperclip. **Should see:** float titled "hello" (lowercase), rows "1 page", "Remove", "Close".
5. Tap the toolbar paperclip again. **Should see:** the float closes.
6. Lasso only the sticker. **Should see:** "Paperclip menu" in the lasso toolbar, and no "Paperclip label".
7. Tap "Paperclip menu". **Should see:** the same float as step 4: "hello", "1 page".
8. Tap "1 page". **Should see:** the float goes, a full-screen view titled "hello" opens with one page preview, "Page 1, this page" under it, a thick border on it, and a "Close" row at the bottom.
9. Tap the preview. **Should see:** the view closes and you're on page 1.

### Flow 2: labels exist

10. Add page 2, write "World", lasso it, "Paperclip label". **Should see:** the sticker on page 2.
11. Add page 3, leave it blank. Toolbar paperclip. **Should see:** "Paperclip", rows "2 paperclips", "Add label", "Close".
12. Tap "2 paperclips". **Should see:** float titled "Paperclips" listing "hello 1 page" and "world 1 page", then "Close".
13. Tap "hello". **Should see:** the float closes and the sticker lands on page 3.
14. Toolbar paperclip on page 3. **Should see:** "hello", "2 pages".
15. Tap "2 pages". **Should see:** the grid with pages 1 and 3, page 3 marked as this page. Previews fill in one at a time, about a third of a second each.
16. Tap the page 1 preview. **Should see:** you land on page 1.
17. Add page 4, write "Mars", lasso it, "Paperclip label". **Should see:** a sticker on page 4. Toolbar float says "mars", "1 page". Close it.
18. On page 4, write "Venus", lasso it, "Paperclip label". **Should see:** float titled `Replace "mars" with "venus"?`, rows "Replace" and "Cancel".
19. Tap "Cancel". **Should see:** the float closes. Toolbar float still says "mars". Close it.
20. Lasso "Venus" again, "Paperclip label", tap "Replace". **Should see:** the float closes, the sticker stays put. Toolbar float says "venus". Close it.
21. Lasso "Venus" once more, "Paperclip label". **Should see:** float `This page is already "venus"` with "Close". Tap Close.
22. Toolbar paperclip, tap "Remove". **Should see:** the float closes and the sticker is gone from page 4. Open the toolbar float again: "Paperclip", "2 paperclips".

### Case, drift and page turns

23. Add page 5, write "HELLO" in capitals, lasso it, "Paperclip label". **Should see:** a sticker. Toolbar float says "hello", "3 pages", not a new paperclip. Close it.
24. Lasso the sticker on page 5 and delete it with the Nomad's own delete. Toolbar paperclip. **Should see:** "hello", "3 pages", "Put sticker back", "Remove", "Close".
25. Tap "Put sticker back". **Should see:** the sticker returns on page 5 and the float closes.
26. Lasso the sticker on page 1, copy it, go to blank page 6 and paste it. Toolbar paperclip. **Should see:** "Paperclip", "2 paperclips", "Add label", "Remove sticker", "Close".
27. Tap "Remove sticker". **Should see:** the pasted sticker disappears. The labels on pages 1, 3 and 5 are untouched.
28. On page 5, open the toolbar float. Without closing it, turn to page 2. **Should see:** the float closes on its own within about a second. Page 5 still has its sticker.
29. Open the float on an unlabelled page and tap the `?` in the title. **Should see:** the how-to text, then the normal float again after about 6 seconds.
30. Lasso a whole sentence and tap "Paperclip label". **Should see:** "That is more than a label. Lasso one or two words." and no keyword written.
31. Open Supernote's own keyword list for the notebook. **Should see:** `clip:hello` on pages 1, 3 and 5, `clip:world` on page 2, and no `clip:` keyword on pages 4 or 6.

If a float ever says "Paperclip hit an error: ...", note the step and the message.

## Logging

The plugin writes no log file, because the lines carry recognised handwriting and note paths. A dev build sends them to logcat (`adb logcat | grep paperclip`) if ADB works on your firmware. Release builds log nothing, so note what you saw on screen.

## Things to watch

- **Float size and icons next to the native menu.** Open the Nomad's side menu, then the Paperclip float, and compare: text size, row height, icon stroke weight, title rule. The sizes are dp guesses for a density nobody has measured yet. Note "too small", "too big" or "fine"; the numbers live at the top of `FloatView.kt`.
- **Float position.** It should sit in the upper right below the toolbar, not over it, and not over the sticker.
- **The sticker against the toolbar.** 95 px from the top, 40 from the right. Is any of it under the toolbar? Too low?
- **Remove really deleting the sticker** (steps 22 and 27). Works on 3.31.45. If the sticker ever stays, the float says "The sticker would not delete. Lasso it and delete it by hand." That message means `deletePageElements` stopped working and the fallback (`lassoElements(rect)` then `deleteLassoElements()`) has to be written.
- **"Paperclip menu" on a picture that isn't ours.** Insert any image, lasso it, tap "Paperclip menu". The float should still describe the page.
- **Grid previews.** Blank tiles, "No preview" tiles or stale content (an old version of a page) are all worth a screenshot.
- **Preview files piling up.** Open a grid a few times, then check the plugin's storage size in Settings > Apps > Plugins. Previews are written by another process, so the cleanup may not be able to delete them. If the size keeps growing, switch to one fixed file name per page.
- **Speed.** Anything that feels slower than a second between tap and float.
