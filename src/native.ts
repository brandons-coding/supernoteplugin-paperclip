// JS face of android/app/src/main/java/com/paperclip/PaperclipNativeModule.kt.
// TurboModuleRegistry.get covers PluginHost running bridgeless (interop
// layer); NativeModules covers the old bridge. null means PluginHost never
// loaded our ReactPackage.
import {NativeModules, TurboModuleRegistry, type TurboModule} from 'react-native';
import type {FloatSpec} from './floatSpec';

// Screen pixels. Height wraps the rows.
export type FloatPlacement = {x: number; y: number; width: number};

export type RowTapEvent = {id: string; t: number};

export const EVT_ROW_TAP = 'paperclipRowTap';
export const EVT_FLOAT_CLOSED = 'paperclipFloatClosed';

interface PaperclipNativeSpec extends TurboModule {
  show(spec: FloatSpec & FloatPlacement): Promise<boolean>;
  hide(): Promise<boolean>;
  isShowing(): Promise<boolean>;
  writeBase64(path: string, base64: string): Promise<number>;
  // Resolves how many files went.
  deleteByPrefix(dir: string, prefix: string): Promise<number>;
}

export const PaperclipNative: PaperclipNativeSpec | null =
  TurboModuleRegistry.get<PaperclipNativeSpec>('PaperclipNative') ??
  (NativeModules.PaperclipNative as PaperclipNativeSpec | undefined) ??
  null;

export function requireNative(): PaperclipNativeSpec {
  if (!PaperclipNative) {
    throw new Error('PaperclipNative is null: reactPackages did not load com.paperclip.PaperclipPackage');
  }
  return PaperclipNative;
}
