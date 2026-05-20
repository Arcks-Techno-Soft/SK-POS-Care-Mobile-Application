/** Persist a captured signature (base64 PNG data URL) to a temp file for upload. */

import * as FileSystem from 'expo-file-system/legacy';

export async function saveSignaturePng(dataUrl: string): Promise<string> {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const uri = `${FileSystem.cacheDirectory}signature-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
