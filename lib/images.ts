/** Camera / photo-library helpers that yield upload-ready images. */

import * as ImagePicker from 'expo-image-picker';

import type { PickedImage } from './types';

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const fallback = `photo-${Date.now()}.jpg`;
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? fallback;
  return {
    uri: asset.uri,
    name,
    type: asset.mimeType ?? 'image/jpeg',
  };
}

/** Pick one or more images from the device library. */
export async function pickFromLibrary(): Promise<PickedImage[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library access was denied. Enable it in Settings.');
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 8,
    quality: 0.7,
  });
  if (res.canceled) return [];
  return res.assets.map(toPicked);
}

/** Capture a single photo with the camera. */
export async function takePhoto(): Promise<PickedImage[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Camera access was denied. Enable it in Settings.');
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (res.canceled) return [];
  return res.assets.map(toPicked);
}
