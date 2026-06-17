/** Horizontal thumbnail strip with a fullscreen image viewer. */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { normalizeBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/lib/theme';

/** Resolve a possibly-relative storage URL against the backend host. */
export function useResolveUrl() {
  const { serverUrl } = useAuth();
  return (url: string) => {
    // Already-absolute URIs (http(s)://, but also local file://, content://)
    // are used as-is; only relative storage paths get the backend host.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
    const base = normalizeBaseUrl(serverUrl);
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };
}

export function AttachmentGallery({
  urls,
  size = 84,
}: {
  urls: string[];
  size?: number;
}) {
  const resolve = useResolveUrl();
  const [viewer, setViewer] = useState<string | null>(null);

  if (!urls.length) return null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {urls.map((url) => {
            const full = resolve(url);
            return (
              <Pressable key={url} onPress={() => setViewer(full)}>
                <Image
                  source={{ uri: full }}
                  style={[styles.thumb, { width: size, height: size }]}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.close} onPress={() => setViewer(null)} hitSlop={12}>
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </Pressable>
          {viewer && (
            <Image source={{ uri: viewer }} style={styles.full} contentFit="contain" />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  thumb: { borderRadius: radius.sm, backgroundColor: colors.surfaceSunken },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { position: 'absolute', top: 52, right: 24, zIndex: 2 },
  full: { width: '100%', height: '82%' },
});
