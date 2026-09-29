/**
 * @fileoverview Editable tag input with chip list for card edit form.
 */
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { normalizeTags } from '@pkey/core';
import { globalStyles as styles } from '../../styles/globalStyles';

interface CardTagsEditorProps {
  tags: string[];
  onChangeTags: (tags: string[]) => void;
  label: string;
  placeholder: string;
  addHint: string;
  removeLabel: (name: string) => string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  inputBg: string;
  accentColor: string;
}

export const CardTagsEditor: React.FC<CardTagsEditorProps> = ({
  tags,
  onChangeTags,
  label,
  placeholder,
  addHint,
  removeLabel,
  textColor,
  mutedColor,
  borderColor,
  inputBg,
  accentColor,
}) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const next = normalizeTags([...tags, trimmed]);
    if (next.length === tags.length) {
      setInput('');
      inputRef.current?.focus();
      return;
    }
    onChangeTags(next);
    setInput('');
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChangeTags(tags.filter((t) => t !== tag));
  };

  return (
    <View style={styles.inputFieldBlockGroup}>
      <Text style={[styles.smallLabelUppercase, { color: mutedColor }]}>{label}</Text>
      <View style={styles.tagsEditorRow}>
        <TextInput
          ref={inputRef}
          style={[
            styles.cardFieldInputStyle,
            { flex: 1, borderColor, color: textColor, backgroundColor: inputBg },
          ]}
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={addTag}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.smallActionButtonRounded, { backgroundColor: inputBg }]}
          onPress={addTag}
          accessibilityLabel={addHint}
        >
          <Ionicons name="add-circle-outline" size={20} color={accentColor} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.tagsEditorHint, { color: mutedColor }]}>{addHint}</Text>
      {tags.length > 0 && (
        <View style={styles.tagLineRowFlex} accessibilityLiveRegion="polite">
          {tags.map((tag) => (
            <View
              key={tag}
              style={[
                styles.tagChipFrame,
                { borderColor, backgroundColor: inputBg, paddingRight: 4 },
              ]}
            >
              <Text style={[styles.tagChipText, { color: mutedColor }]}>{tag}</Text>
              <TouchableOpacity
                onPress={() => removeTag(tag)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={removeLabel(tag)}
              >
                <Ionicons name="close" size={12} color={mutedColor} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
