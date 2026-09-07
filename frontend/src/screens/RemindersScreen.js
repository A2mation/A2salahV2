import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { light as colors } from '../theme/colors';
import * as reminderApi from '../api/api';
import { CHANNEL_ID, ensurePermission, ensureChannel } from '../notifications/notificationSetup';
import { getCurrentSoundFile } from '../notifications/volumeStore';

const PRAYER_OPTIONS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'sunrise', label: 'Sunrise' },
  { key: 'dhuhr', label: 'Zohar' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Ishaa' },
];

const LABEL_PRESETS = ['Prepare for prayer', 'Iqama', 'Tahajjud'];

// Presets that should be expanded with the actual prayer name wherever
// they're displayed, e.g. "Prepare for prayer" -> "Prepare for Maghrib".
// The reminder itself keeps storing the generic preset string, so this
// stays correct even if the reminder's prayer field changes later.
const DYNAMIC_LABELS = {
  'Prepare for prayer': (prayerLabel) => `Prepare for ${prayerLabel}`,
};

function getPrayerLabel(prayerKey) {
  return PRAYER_OPTIONS.find((p) => p.key === prayerKey)?.label ?? '';
}

function displayLabelFor(rawLabel, prayerKey) {
  const dynamic = DYNAMIC_LABELS[rawLabel];
  return dynamic ? dynamic(getPrayerLabel(prayerKey)) : rawLabel;
}

function EmptyStateIcon() {
  const c = 70;
  const armLen = 32;
  const tipR = 8;
  const points = [
    { x: c - armLen, y: c - armLen },
    { x: c + armLen, y: c - armLen },
    { x: c - armLen, y: c + armLen },
    { x: c + armLen, y: c + armLen },
  ];
  return (
    <Svg width={140} height={140} viewBox="0 0 140 140">
      {points.map((p, i) => (
        <Line key={i} x1={c} y1={c} x2={p.x} y2={p.y} stroke={colors.gold} strokeWidth={9} strokeLinecap="round" />
      ))}
      {points.map((p, i) => (
        <Circle key={`c${i}`} cx={p.x} cy={p.y} r={tipR} stroke={colors.gold} strokeWidth={6} fill={colors.background} />
      ))}
      <Circle cx={c} cy={c} r={11} stroke={colors.gold} strokeWidth={7} fill={colors.background} />
    </Svg>
  );
}

function offsetLabel(minutes) {
  if (minutes === 0) return 'At prayer time';
  const abs = Math.abs(minutes);
  const unit = abs === 1 ? 'minute' : 'minutes';
  return minutes < 0 ? `${abs} ${unit} before` : `${abs} ${unit} after`;
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [label, setLabel] = useState(LABEL_PRESETS[0]);
  const [prayer, setPrayer] = useState('fajr');
  const [offsetMinutes, setOffsetMinutes] = useState(10);
  const [saving, setSaving] = useState(false);

  const fetchReminders = useCallback(async () => {
    try {
      const { data } = await reminderApi.getReminders();
      setReminders(data);
    } catch (err) {
      console.warn('Failed to fetch reminders', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const openAddModal = () => {
    setLabel(LABEL_PRESETS[0]);
    setPrayer('fajr');
    setOffsetMinutes(10);
    setModalVisible(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await reminderApi.createReminder({ label, prayer, offsetMinutes });
      setModalVisible(false);
      fetchReminders();
    } catch (err) {
      Alert.alert('Could not save reminder', err?.response?.data?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item) => {
    setReminders((prev) => prev.map((r) => (r._id === item._id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await reminderApi.updateReminder(item._id, { enabled: !item.enabled });
    } catch (err) {
      fetchReminders();
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete reminder', `Remove "${displayLabelFor(item.label, item.prayer)}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await reminderApi.deleteReminder(item._id);
            fetchReminders();
          } catch (err) {
            Alert.alert('Error', 'Could not delete reminder');
          }
        },
      },
    ]);
  };

  // Fires 10s from now regardless of any real prayer time — the fastest
  // way to confirm sound + delivery actually work. Lock the phone or
  // fully close the app right after tapping this to test the
  // background/closed-app case specifically.
  const handleTestNotification = async () => {
    setMenuOpen(false);
    const granted = await ensurePermission();
    if (!granted) {
      Alert.alert('Permission needed', 'Enable notifications for this app in system settings, then try again.');
      return;
    }
    const soundFile = getCurrentSoundFile();
    await ensureChannel(soundFile);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test reminder',
        body: 'If you hear this after closing the app, notifications are working.',
        sound: soundFile,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        // channelId belongs on the trigger, not content (see reminderAlerts.js) —
        // Android silently drops it from content, so the notification falls back
        // to the default channel/sound instead of the "reminders" channel's
        // custom notification sound.
        ...(CHANNEL_ID ? { channelId: CHANNEL_ID } : {}),
      },
    });
    Alert.alert('Test scheduled', 'Firing in 10 seconds — close or lock the app now.');
  };

  const handleDeleteAll = () => {
    setMenuOpen(false);
    if (reminders.length === 0) return;
    Alert.alert('Delete all reminders', 'This removes every reminder you have set.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          try {
            await reminderApi.deleteAllReminders();
            fetchReminders();
          } catch (err) {
            Alert.alert('Error', 'Could not delete reminders');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Reminders</Text>
        <View style={styles.titleIcons}>
          <TouchableOpacity onPress={openAddModal} hitSlop={10} style={{ marginRight: 18 }}>
            <Text style={styles.titleIcon}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} hitSlop={10}>
            <Text style={styles.titleIcon}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      {menuOpen && (
        <View style={styles.menu}>
          <TouchableOpacity onPress={handleTestNotification} style={styles.menuItem}>
            <Text style={styles.menuItemText}>Send test notification</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteAll} style={styles.menuItem}>
            <Text style={styles.menuItemText}>Delete all</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.gold} size="large" style={{ marginTop: 60 }} />
      ) : reminders.length === 0 ? (
        <View style={styles.emptyCard}>
          <EmptyStateIcon />
          <Text style={styles.emptyTitle}>No reminders added yet</Text>
          <Text style={styles.emptyDescription}>
            Here you can add your own custom reminders after or before prayers. You can use this to get
            notifications when it's time to prepare for prayer, it's Iqama time, Tahajjud time for example.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.reminderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderLabel}>{displayLabelFor(item.label, item.prayer)}</Text>
                <Text style={styles.reminderSub}>{offsetLabel(item.offsetMinutes)}</Text>
              </View>
              <TouchableOpacity onPress={() => handleToggle(item)} style={styles.toggle(item.enabled)}>
                <View style={styles.toggleKnob(item.enabled)} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8} style={{ marginLeft: 14 }}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={styles.modalTitle}>New Reminder</Text>

            <Text style={styles.fieldLabel}>Label</Text>
            <View style={styles.chipRow}>
              {LABEL_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setLabel(preset)}
                  style={[styles.chip, label === preset && styles.chipActive]}
                >
                  <Text style={[styles.chipText, label === preset && styles.chipTextActive]}>
                    {displayLabelFor(preset, prayer)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="Reminder name"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Prayer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {PRAYER_OPTIONS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => setPrayer(p.key)}
                  style={[styles.chip, prayer === p.key && styles.chipActive]}
                >
                  <Text style={[styles.chipText, prayer === p.key && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Timing (minutes before/after prayer)</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setOffsetMinutes((v) => v - 5)}>
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{offsetLabel(offsetMinutes)}</Text>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setOffsetMinutes((v) => v + 5)}>
                <Text style={styles.stepperBtnText}>＋</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 16 },
  title: { color: colors.navy, fontSize: 30, fontWeight: '800' },
  titleIcons: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { fontSize: 22, color: colors.navy },
  menu: {
    position: 'absolute',
    top: 56,
    right: 20,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 18 },
  menuItemText: { color: colors.navy, fontSize: 14 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingVertical: 48,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.gold, fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 14 },
  emptyDescription: { color: colors.gold, opacity: 0.85, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  list: { paddingBottom: 20 },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  reminderLabel: { color: colors.navy, fontSize: 16, fontWeight: '700' },
  reminderSub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  toggle: (on) => ({
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: on ? colors.gold : colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  }),
  toggleKnob: (on) => ({
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignSelf: on ? 'flex-end' : 'flex-start',
  }),
  deleteIcon: { fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: colors.navy, fontSize: 20, fontWeight: '800', marginBottom: 18 },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.navy, fontSize: 13 },
  chipTextActive: { color: colors.white, fontWeight: '700' },
  input: {
    backgroundColor: colors.card,
    color: colors.navy,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { color: colors.navy, fontSize: 20, fontWeight: '700' },
  stepperValue: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  cancelBtnText: { color: colors.textMuted, fontSize: 15 },
  saveBtn: { backgroundColor: colors.gold, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, marginLeft: 8 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});