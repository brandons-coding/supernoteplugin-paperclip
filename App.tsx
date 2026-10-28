// The grid: every page with one label, as previews. Laid out like the Nomad's
// own side menu (reference/native-menu.png): bold centred title over a heavy
// rule, hairlines, outline icon next to plain text. E-ink, so no animation,
// no spinner, no pressed state; a tile with no image yet is just its outline.
import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {PaperclipNative} from './src/native';
import {PREVIEW_PREFIX, previewFile} from './src/previews';
import {PERM_READ, closeView, ensurePermission, jumpToPage, pluginDir, renderPage, saveCurrentNote} from './src/sdk';
import {getGrid, log, subscribe, type GridRequest} from './src/store';

const COLUMNS = 3;
const GAP = 16;
// Page previews come out 468x624.
const ASPECT = 624 / 468;

// null while rendering, a file:// uri when done, 'failed' when the render threw.
type Previews = Record<number, string | null | 'failed'>;

function close() {
  closeView().catch(e => log(`[Grid] closePluginView threw ${String(e)}`));
}

export default function App(): React.JSX.Element {
  const grid = useSyncExternalStore(subscribe, getGrid);
  return (
    <View style={s.root}>
      <Text style={s.title} numberOfLines={1}>
        {grid?.label ?? 'Paperclip'}
      </Text>
      <View style={s.titleRule} />
      {/* Keyed on the open, so a second open of the same label renders afresh. */}
      {grid ? <Previews key={grid.opened} grid={grid} /> : <View style={s.flex} />}
      <View style={s.hairline} />
      <Pressable style={s.closeRow} onPress={close} accessibilityRole="button">
        <CloseIcon />
        <Text style={s.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

function Previews({grid}: {grid: GridRequest}) {
  const [uris, setUris] = useState<Previews>({});
  const {width} = useWindowDimensions();
  const tileW = Math.floor((width - GAP * (COLUMNS + 1)) / COLUMNS);

  // One page at a time: each generateNotePng is a NOTE process round trip,
  // and tiles filling in one by one beats a blank screen for the whole set.
  useEffect(() => {
    let gone = false;
    (async () => {
      await ensurePermission(PERM_READ);
      const dir = await pluginDir();
      const cleared = await PaperclipNative?.deleteByPrefix(dir, PREVIEW_PREFIX).catch(() => -1);
      // generateNotePng reads the saved file; flush the strokes just written.
      await saveCurrentNote();
      log(`[Grid] "${grid.label}" rendering ${grid.pages.length} pages, cleared ${cleared} old previews`);
      for (const page of grid.pages) {
        if (gone) {
          return;
        }
        const file = previewFile(dir, grid.path, page, grid.opened);
        const t0 = Date.now();
        try {
          await renderPage(grid.path, page, file);
          log(`[Grid] page ${page} rendered in ${Date.now() - t0} ms`);
          setUris(u => ({...u, [page]: `file://${file}`}));
        } catch (e) {
          log(`[Grid] page ${page} failed: ${String(e)}`);
          setUris(u => ({...u, [page]: 'failed'}));
        }
      }
    })().catch(e => log(`[Grid] ERROR ${String(e)}`));
    return () => {
      gone = true;
    };
  }, [grid]);

  async function open(page: number) {
    log(`[Grid] jump to page ${page}`);
    try {
      await jumpToPage(page);
    } catch (e) {
      log(`[Grid] jumpToPage ${page} threw ${String(e)}`);
    }
    close();
  }

  return (
    <ScrollView style={s.flex} contentContainerStyle={s.tiles}>
      {grid.pages.map(page => {
        const here = page === grid.current;
        const uri = uris[page];
        return (
          <Pressable key={page} style={[s.tile, {width: tileW}]} onPress={() => open(page)}>
            <View style={[s.frame, here && s.frameHere, {height: Math.round(tileW * ASPECT)}]}>
              {uri && uri !== 'failed' ? (
                <Image source={{uri}} style={s.preview} resizeMode="contain" fadeDuration={0} />
              ) : uri === 'failed' ? (
                <Text style={s.missing}>No preview</Text>
              ) : null}
            </View>
            {/* The API counts from 0; the Nomad's own page numbers start at 1. */}
            <Text style={[s.pageNum, here && s.pageNumHere]}>
              {here ? `Page ${page + 1}, this page` : `Page ${page + 1}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Two bars crossed, round ends: the float's close icon without an SVG library.
function CloseIcon() {
  return (
    <View style={s.icon}>
      <View style={[s.bar, s.barA]} />
      <View style={[s.bar, s.barB]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#ffffff'},
  flex: {flex: 1},
  title: {
    color: '#000000',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  titleRule: {height: 2, backgroundColor: '#000000'},
  hairline: {height: 1, backgroundColor: '#000000', marginHorizontal: 24},
  tiles: {flexDirection: 'row', flexWrap: 'wrap', padding: GAP / 2, paddingTop: GAP},
  tile: {margin: GAP / 2},
  frame: {
    borderWidth: 1,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameHere: {borderWidth: 4},
  preview: {width: '100%', height: '100%'},
  missing: {color: '#000000', fontSize: 15},
  pageNum: {color: '#000000', fontSize: 16, textAlign: 'center', marginTop: 6, marginBottom: GAP / 2},
  pageNumHere: {fontWeight: 'bold'},
  closeRow: {flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingHorizontal: 32},
  closeText: {color: '#000000', fontSize: 19, marginLeft: 18},
  icon: {width: 28, height: 28, alignItems: 'center', justifyContent: 'center'},
  bar: {position: 'absolute', width: 30, height: 3, borderRadius: 1.5, backgroundColor: '#000000'},
  barA: {transform: [{rotate: '45deg'}]},
  barB: {transform: [{rotate: '-45deg'}]},
});
