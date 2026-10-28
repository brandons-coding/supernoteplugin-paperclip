# Paperclip

A plugin for the Supernote Nomad that groups pages inside a notebook. Write a word on a page, lasso it, tap **Paperclip label**. The page gets a small paperclip sticker in the upper right and joins every other page in that notebook with the same word. From any of them you can see the group and jump around it.

Notebooks fill up with pages about the same thing that sit nowhere near each other. This is a "these go together" mark that doesn't mean reorganising anything.

## Using it

- **Label a page:** lasso a word (handwriting or a typed text box) and tap **Paperclip label** in the lasso toolbar. Labels are lowercased, so "Hello" and "hello" are the same one.
- **Toolbar paperclip:** opens a small window over the page. On an unlabelled page it offers **Add label** and, if the notebook already has labels, a list to pick from. On a labelled page it shows the label, how many pages share it, and **Remove**.
- **N pages:** opens a full-screen grid of previews for that label. Tap one to go there.
- **Replace:** labelling a page that already has a label asks first.
- **Lasso the sticker** and tap **Paperclip menu** to open the same window.

One label per page, and labels only group pages inside one notebook. A label is a word or two; a longer lasso is refused.

Labels are stored as Supernote page keywords, `clip:<word>`, so they travel with the page when you move or copy it, and they show up in Supernote's own keyword list. Keywords without the `clip:` prefix are yours and Paperclip ignores them.

Permissions it declares: file read and write. No network. The float is an overlay window, so the built plugin also asks Android for `SYSTEM_ALERT_WINDOW`.

## What it touches

- **Network:** none. No `INTERNET` permission and no network calls in the code.
- **Logging:** release builds log nothing. Dev builds log to logcat only, and never to a file, because the lines carry recognised handwriting and note paths.
- **Reads:** page keywords, page element lists (to find its own sticker), and rendered page previews for the grid.
- **Writes:** `clip:` keywords and one sticker picture per labelled page.
- **Deletes**, each only from a tap on Remove, Remove sticker or a replace, never in bulk: the `clip:` keyword on the current page, pictures on the current page that match the sticker's exact size, and its own `grid_*.png` preview files in its plugin directory. Your strokes and your own keywords are never touched. It doesn't request `FILE:DELETE`; the sticker delete worked with only read and write on firmware 3.31.45.

## Install

Build it (below), copy `build/outputs/paperclip.snplg` into `MyStyle` on the Nomad, then Settings > Apps > Plugins and install it. The first action asks for file access. Pick "always"; "this time only" works but asks again every time the plugin wakes up.

## Build

You need Node 18+, a JDK (I use Temurin 21), and the Android SDK with platform 35 and build-tools 35.0.0. `JAVA_HOME` and `ANDROID_HOME` have to be set.

```bash
npm ci
./buildPlugin.sh
# -> build/outputs/paperclip.snplg
```

The first native build downloads Gradle and takes a few minutes.

`rm -rf build` first when native code changes. The script never cleans `build/generated`, so an old `app.npk` would ride along. After a native build, check `build/generated/PluginConfig.json` for `nativeCodePackage`: a failed Gradle build still zips a `.snplg` without it.

Bump `versionCode` in `PluginConfig.json` before every build you install, and pick the new file through Add Plugin on the device. Leave `pluginID` and `pluginKey` alone.

## Tests

```bash
npm test
```

Jest runs the logic under `src/`, including `actions.ts` against a fake notebook. Those modules must not import `react-native` or `sn-plugin-lib`; the SDK needs the device runtime and won't load here. What can't be tested off the device is in [docs/DEVICE_TEST.md](docs/DEVICE_TEST.md), a script to walk through on a Nomad.

## Status

Works on a Nomad running firmware 3.31.45. That is the only device and firmware I've tried it on.

Rough edges I know about:

- The window can cover the bottom of the sticker.
- **Paperclip menu** shows for any lassoed picture, not only the sticker. The window still describes the page either way.
- The merged Android manifest also carries `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE` and `MOUNT_UNMOUNT_FILESYSTEMS`, which come in from `sn-plugin-lib`. Paperclip doesn't use them directly and I haven't stripped them.

How it's put together, and what I found out about the device along the way, is in [docs/DESIGN.md](docs/DESIGN.md).

## Layout

| Path | What |
|---|---|
| `src/` | Plugin logic. Most of it is pure and tested; `sdk.ts`, `stickers.ts` and `main.ts` are the parts that touch the device |
| `App.tsx` | The grid view |
| `android/app/src/main/java/com/paperclip/` | The overlay window and its icons, as a native module |
| `assets/` | Plugin icon and sticker art |
| `reference/` | Source art, a screenshot of the Nomad's own menu (what the look is matched to), and the scripts that make the assets |
| `buildPlugin.sh`, `buildPlugin.ps1` | Build scripts from Supernote's plugin template |

## License

MIT, see [LICENSE](LICENSE). `buildPlugin.sh`, `buildPlugin.ps1` and the Gradle files are from Supernote's plugin template, which is MIT too.
