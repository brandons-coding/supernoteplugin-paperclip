// Plugin entry. Everything here is module scope: the toolbar button never
// opens the view, and float taps arrive with it closed, so these handlers are
// the only ones guaranteed to be alive.
import {AppRegistry, DeviceEventEmitter, Dimensions, Image, PixelRatio} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import App from '../App';
import {name as appName} from '../app.json';
import {createActions} from './actions';
import {EVT_FLOAT_CLOSED, EVT_ROW_TAP, requireNative, type FloatPlacement, type RowTapEvent} from './native';
import {
  PERM_READ,
  PERM_WRITE,
  currentFilePath,
  currentPage,
  ensurePermission,
  keywordApi,
  lassoHasSticker,
  lassoText,
  showView,
  totalPages,
} from './sdk';
import {findSticker, placeSticker, removeSticker} from './stickers';
import {log, setGrid} from './store';

const BTN_TOOLBAR = 100;
const BTN_LASSO_LABEL = 200;
const BTN_LASSO_MENU = 201;

// editDataTypes: 0 strokes, 3 text boxes, 2 pictures.
const LASSO_WORDS = [0, 3];
const LASSO_PICTURE = [2];

// pluginKey in PluginConfig.json is this same name; PluginHost looks it up.
AppRegistry.registerComponent(appName, () => App);
PluginManager.init();

log('[Boot] bundle loaded');

// Physical px, which is what WindowManager takes; RN's Dimensions are dp.
// Top right, below the Nomad's top toolbar: 160 px sits below it. Worked out once,
// since the screen doesn't change.
const FLOAT_WIDTH_PX = 520;
const FLOAT_TOP_PX = 160;
const FLOAT_RIGHT_PX = 24;
let placement: FloatPlacement | null = null;
function floatPlacement(): FloatPlacement {
  placement ??= {
    x: Math.round(Dimensions.get('screen').width * PixelRatio.get()) - FLOAT_WIDTH_PX - FLOAT_RIGHT_PX,
    y: FLOAT_TOP_PX,
    width: FLOAT_WIDTH_PX,
  };
  return placement;
}

const actions = createActions({
  keywordApi,
  sticker: {place: placeSticker, find: findSticker, remove: removeSticker},
  ui: {
    async show(spec) {
      await requireNative().show({...spec, ...floatPlacement()});
    },
    async hide() {
      await requireNative().hide();
    },
    isShowing: () => requireNative().isShowing(),
    async openGrid(grid) {
      setGrid(grid);
      await showView();
    },
  },
  sdk: {
    path: currentFilePath,
    page: currentPage,
    total: totalPages,
    lassoText,
    lassoHasSticker,
    async permit() {
      await ensurePermission(PERM_READ);
      await ensurePermission(PERM_WRITE);
    },
  },
  log,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
});

const icon = Image.resolveAssetSource(require('../assets/icon.png')).uri;

function register(what: string, type: number, button: object) {
  // showType 0: headless. The float is the UI, so no full-screen view flashes up.
  PluginManager.registerButton(type, ['NOTE'], {...button, icon, showType: 0})
    .then(ok => log(`[Boot] registerButton ${what}: ${ok}`))
    .catch(e => log(`[Boot] registerButton ${what} threw ${String(e)}`));
}

register('toolbar', 1, {id: BTN_TOOLBAR, name: 'Paperclip'});
register('lasso label', 2, {id: BTN_LASSO_LABEL, name: 'Paperclip label', editDataTypes: LASSO_WORDS});
register('lasso menu', 2, {id: BTN_LASSO_MENU, name: 'Paperclip menu', editDataTypes: LASSO_PICTURE});

PluginManager.registerButtonListener({
  onButtonPress(event) {
    log(`[Button] ${event.id} ${event.name}`);
    if (event.id === BTN_TOOLBAR) {
      actions.openFloat();
    } else if (event.id === BTN_LASSO_LABEL) {
      actions.applyLabelFromLasso();
    } else if (event.id === BTN_LASSO_MENU) {
      actions.openMenuFromSticker();
    }
  },
});

DeviceEventEmitter.addListener(EVT_ROW_TAP, (e: RowTapEvent) => {
  log(`[RowTap] ${e.id}`);
  actions.onRowTap(e.id);
});

// The native side already removed the float. Nothing to undo: a pending
// replace is overwritten by the next confirm.
DeviceEventEmitter.addListener(EVT_FLOAT_CLOSED, () => log('[Float] closed from its Close row'));
