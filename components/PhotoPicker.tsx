/** Photo attachment row — pick from camera or library, preview, remove. */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/kit';
import { pickFromLibrary, takePhoto } from '@/lib/images';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { PickedImage } from '@/lib/types';

interface PhotoPickerProps {
  images: PickedImage[];
  onChange: (images: PickedImage[]) => void;
  disabled?: boolean;
}

export function PhotoPicker({ images, onChange, disabled }: PhotoPickerProps) {
  const add = async (source: () => Promise<PickedImage[]>) => {
    try {
      const picked = await source();
      if (picked.length) onChange([...images, ...picked]);
    } catch (e) {
      Alert.alert('Photos', (e as Error).message ?? 'Could not add photos.');
    }
  };

  const remove = (uri: string) => {
    onChange(images.filter((img) => img.uri !== uri));
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.thumbs}>
            {images.map((img) => (
              <View key={img.uri} style={styles.thumbWrap}>
                <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
                {!disabled && (
                  <Pressable style={styles.remove} onPress={() => remove(img.uri)} hitSlop={6}>
                    <Ionicons name="close" size={13} color={colors.onInk} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      {!disabled && (
        <View style={styles.actions}>
          <Button
            title="Camera"
            icon="camera-outline"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => add(takePhoto)}
            style={{ flex: 1 }}
          />
          <Button
            title="Library"
            icon="images-outline"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => add(pickFromLibrary)}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {images.length > 0 && (
        <Text style={styles.count}>
          {images.length} photo{images.length === 1 ? '' : 's'} attached
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  count: { fontSize: fontSize.xs, color: colors.inkSubtle },
});
