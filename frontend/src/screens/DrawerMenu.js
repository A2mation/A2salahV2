import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  ScrollView,
  Linking,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navigate } from "../navigation/navigationRef";
import { light as colors } from "../theme/colors";
import { createAudioPlayer } from "expo-audio";
import {getVolumeLevel, setVolumeLevel,getCurrentSoundFile,loadVolumeLevel,} from "../notifications/volumeStore";
import {
  getSelectedSoundKey,
  setSelectedSound,
  loadSelectedSound,
} from "../notifications/notificationSoundStore";
import { SOUND_LIBRARY } from "../notifications/notificationSetup";
import { getTune, resetTune } from '../tune/tuneStore';
import { resetRamadanTune } from '../tune/ramadanTuneStore';
import { resetAllDateTunes, resetAllYearRoundTimes } from '../tune/dateTuneStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.76;

const VOLUME_OPTIONS = [
  { key: "low", label: "Soft" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "Loud" },
];

// TODO: point these at your real sound files (adjust paths/extensions to
// match whatever getCurrentSoundFile() / your assets folder actually uses).
const SOUND_ASSETS = {
  low: require("../../assets/sounds/salat_low.wav"),
  medium: require("../../assets/sounds/salat_medium.wav"),
  high: require("../../assets/sounds/salat_high.wav"),
};

// Static require map for the 15-item "Choose Notification Sound" library
// (SOUND_LIBRARY in notificationSetup.js) — require() needs a literal
// string path, so this can't be built dynamically from that array; each
// entry here must be kept in sync with it by key. All 15 currently point
// at placeholder copies of the same clip — swap the .wav files' actual
// content (keep filenames, or update both here and in app.json's sounds
// array together) once you have distinct real sounds.
const NOTIFICATION_SOUND_ASSETS = {
  sound_01: require("../../assets/sounds/salat_high_1.wav"),
  sound_02: require("../../assets/sounds/salat_high_2.wav"),
  sound_03: require("../../assets/sounds/salat_high_3.wav"),
  sound_04: require("../../assets/sounds/salat_high_4.wav"),
  sound_05: require("../../assets/sounds/salat_high_5.wav"),
  sound_06: require("../../assets/sounds/salat_high_6.wav"),
  sound_07: require("../../assets/sounds/salat_high_7.wav"),
  sound_08: require("../../assets/sounds/salat_high_8.wav"),
  sound_09: require("../../assets/sounds/salat_high_9.wav"),
  sound_10: require("../../assets/sounds/salat_high_10.wav"),
  sound_11: require("../../assets/sounds/salat_high_11.wav"),
  sound_12: require("../../assets/sounds/salat_high_12.wav"),
  sound_13: require("../../assets/sounds/salat_high_13.wav"),
  sound_14: require("../../assets/sounds/salat_high_14.wav"),
  sound_15: require("../../assets/sounds/salat_high_15.wav"),
};

// "Volume" is handled specially (opens the intensity picker below) — every
// other row here still just shows the generic "coming soon" placeholder.
const ITEMS_MAIN = [
  { icon: "🌐", label: "Language" },
  { icon: "🔊", label: "Volume" },
 

];

const ITEMS_SHARE = [
  { icon: "👥", label: "Social Networks sharing" },
  { icon: "📅", label: "Export to Google Calendar" },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const APP_VERSION = "1.0.0";

function DrawerRow({ icon, label, onPress, labelStyle }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.65}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DrawerMenu({ visible, onClose, city = "Kolkata" }) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [volumeModalVisible, setVolumeModalVisible] = useState(false);
  const [volumeLevel, setVolumeLevelState] = useState(getVolumeLevel());
  const [soundModalVisible, setSoundModalVisible] = useState(false);
  const [selectedSoundKey, setSelectedSoundKeyState] = useState(getSelectedSoundKey());
  const previewPlayerRef = useRef(null);
  const RESET_COUNTDOWN_SECONDS = 10;
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(RESET_COUNTDOWN_SECONDS);
  const resetTimerRef = useRef(null);
  // "Add ID" flow — first pick a role (Admin / User), then fill in a form
  // whose fields depend on that role (Admin also needs password
  // confirmation, User is just id + password).
  const [addIdRoleModalVisible, setAddIdRoleModalVisible] = useState(false);
  const [addIdFormVisible, setAddIdFormVisible] = useState(false);
  const [addIdRole, setAddIdRole] = useState(null); // 'admin' | 'user'
  const [addIdForm, setAddIdForm] = useState({ id: "", password: "", confirmPassword: "" });
  const [addIdSubmitting, setAddIdSubmitting] = useState(false);
  // Backdrop's touchable area is sized off this instead of CSS absoluteFill,
  // since absoluteFill'ing a flex:1 parent inside a fresh Android Modal can
  // resolve to height 0 on the first layout pass and never self-correct.
  // Seeded with Dimensions so it's correct even before the first onLayout.
  const [rootSize, setRootSize] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  useEffect(() => {
    loadVolumeLevel().then(setVolumeLevelState);
    loadSelectedSound().then(setSelectedSoundKeyState);
  }, []);

  // Stop/release any in-flight preview if the drawer unmounts
  useEffect(() => {
    return () => {
      if (previewPlayerRef.current) {
        previewPlayerRef.current.remove();
        previewPlayerRef.current = null;
      }
    };
  }, []);

  // Drive the 10-second "hold on" countdown whenever the reset-confirm
  // modal opens, and make sure the interval is always cleaned up.
  useEffect(() => {
    if (resetModalVisible) {
      setResetCountdown(RESET_COUNTDOWN_SECONDS);
      resetTimerRef.current = setInterval(() => {
        setResetCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(resetTimerRef.current);
            resetTimerRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (resetTimerRef.current) {
      clearInterval(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    return () => {
      if (resetTimerRef.current) {
        clearInterval(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [resetModalVisible]);

  console.log(
    "[DrawerMenu] render, visible =",
    visible,
    "| SCREEN_WIDTH/HEIGHT =",
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    "| DRAWER_WIDTH =",
    DRAWER_WIDTH,
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: visible ? 0 : -DRAWER_WIDTH,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 0.45 : 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const handleEmail = () => {
    Linking.openURL("mailto:a2mationsolution@gmail.com?subject=A2salah%20Support");
  };

  const handleReportIssue = () => {
    Linking.openURL("tel:+918777353002");
  };

  const handleSuggestFeature = () => {
    Linking.openURL(
      "mailto:a2mationsolution@gmail.com?subject=A2salah%20Feature%20Suggestion",
    );
  };

  const handlePlaceholder = (label) => {
    Alert.alert(label, "This feature is coming soon.");
  };

  // TODO: once the iOS build is listed on the App Store, replace
  // IOS_APP_STORE_ID below with the real numeric App Store ID (found in
  // App Store Connect / the store URL) so the iOS branch works too.
  const ANDROID_PACKAGE = "com.a2mation.a2salah";
  const IOS_APP_STORE_ID = null; // e.g. "1234567890"

  const handleRateApp = () => {
    if (Platform.OS === "android") {
      // market:// opens the Play Store app directly (with a fallback to
      // the https listing if the Play Store app isn't available).
      Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`).catch(() => {
        Linking.openURL(
          `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
        );
      });
      return;
    }

    if (Platform.OS === "ios") {
      if (!IOS_APP_STORE_ID) {
        Alert.alert(
          "Rate the app",
          "A2salah isn't on the App Store yet — check back soon!",
        );
        return;
      }
      // action=write-review deep-links straight to the review composer
      // instead of just the app's store page.
      Linking.openURL(
        `itms-apps://itunes.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`,
      );
      return;
    }

    Alert.alert("Rate the app", "This feature is coming soon.");
  };

  const handleTune = () => {
    onClose();
    navigate("TuneTimings");
  };
  const handleReset = () => {
    onClose();
    setResetModalVisible(true);
  };

  const handleCancelReset = () => {
    setResetModalVisible(false);
  };

  const handleConfirmReset = () => {
    if (resetCountdown > 0) return; // OK stays inert until the countdown ends
    resetTune();
    resetRamadanTune();
    resetAllDateTunes();
    resetAllYearRoundTimes();
    setResetModalVisible(false);
  };

  const handleDateTune = () => {
    onClose();
    navigate("DateTune");
  };

  const handleAbout = () => {
    onClose();
    navigate("About");
  };

  const handleLegal = () => {
  onClose();
  navigate("Legal");
};

  const handleOpenAddId = () => {
    onClose();
    setAddIdRoleModalVisible(true);
  };

  const handleCancelAddIdRole = () => {
    setAddIdRoleModalVisible(false);
  };

  const handleSelectAddIdRole = (role) => {
    setAddIdRole(role);
    setAddIdForm({ id: "", password: "", confirmPassword: "" });
    setAddIdRoleModalVisible(false);
    setAddIdFormVisible(true);
  };

  const handleAddIdFieldChange = (field, value) => {
    setAddIdForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCancelAddIdForm = () => {
    setAddIdFormVisible(false);
    setAddIdRole(null);
    setAddIdForm({ id: "", password: "", confirmPassword: "" });
  };

  const handleBackToAddIdRole = () => {
    setAddIdFormVisible(false);
    setAddIdRoleModalVisible(true);
  };

  const handleSubmitAddId = async () => {
    const { id, password, confirmPassword } = addIdForm;
    if (!id.trim() || !password) {
      Alert.alert("Missing info", "Please fill in both ID and password.");
      return;
    }
    if (addIdRole === "admin" && password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Password and Confirm Password must be the same.");
      return;
    }

    setAddIdSubmitting(true);
    try {
      // TODO: wire this up to a real backend endpoint (e.g. POST
      // /api/auth/register) once one exists — for now this just confirms
      // the submission locally, mirroring the other "coming soon" rows.
      await new Promise((resolve) => setTimeout(resolve, 300));
      Alert.alert(
        "ID created",
        `${addIdRole === "admin" ? "Admin" : "User"} ID "${id.trim()}" has been saved.`,
      );
      handleCancelAddIdForm();
    } finally {
      setAddIdSubmitting(false);
    }
  };

  const handleOpenVolume = () => {
    onClose();
    setVolumeModalVisible(true);
  };

  const handleSelectVolume = async (level) => {
    setVolumeLevelState(level);
    await setVolumeLevel(level);
  };

  // Plays the currently selected intensity's sound file immediately, so the
  // preview is instant instead of waiting on a scheduled OS notification.
  const handlePreviewVolume = () => {
    playPreview(SOUND_ASSETS[volumeLevel]);
  };

  const handleMenuItemPress = (label) => {
    if (label === "Volume") {
      handleOpenVolume();
      return;
    }
    handlePlaceholder(label);
  };

  const handleOpenSoundPicker = () => {
    onClose();
    setSoundModalVisible(true);
  };

  const stopPreview = () => {
    if (previewPlayerRef.current) {
      previewPlayerRef.current.remove();
      previewPlayerRef.current = null;
    }
  };

  const playPreview = (asset) => {
    stopPreview();
    if (!asset) return;
    const player = createAudioPlayer(asset);
    previewPlayerRef.current = player;
    player.play();
  };

  // Selecting a sound both saves it as the active reminder sound (so it's
  // what actually fires on the next background notification — see
  // notificationSoundStore.js / reminderAlerts.js) and immediately plays a
  // preview, so tapping a row in the list is a single "hear it, use it"
  // action rather than two separate steps.
  const handleSelectSound = async (key) => {
    setSelectedSoundKeyState(key);
    await setSelectedSound(key);
    playPreview(NOTIFICATION_SOUND_ASSETS[key]);
  };

  // Reverts to the existing Volume-intensity clip instead of one of the
  // 15 named sounds — see notificationSoundStore's getEffectiveSoundFile.
  const handleUseDefaultSound = async () => {
    setSelectedSoundKeyState(null);
    await setSelectedSound(null);
    playPreview(SOUND_ASSETS[volumeLevel]);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View
          style={styles.overlayRoot}
          pointerEvents="box-none"
          onLayout={(e) => {
            console.log(
              "[DrawerMenu] wrapper onLayout ->",
              e.nativeEvent.layout,
            );
            const { width, height } = e.nativeEvent.layout;
            setRootSize({ width, height });
          }}
        >
          {/* Backdrop — full-bleed transparent touch target so tapping
              anywhere outside the drawer (including near the very bottom)
              reliably closes it. Sized explicitly from rootSize (measured
              via the wrapper's onLayout above) rather than absoluteFill,
              which could resolve to height 0 on Android's first layout
              pass inside a Modal and never re-measure itself. */}
          <AnimatedPressable
            onPress={() => {
              console.log("[DrawerMenu] backdrop TAPPED, calling onClose()");
              onClose();
            }}
            style={[styles.backdrop, { width: rootSize.width, height: rootSize.height }]}
            onLayout={(e) =>
              console.log(
                "[DrawerMenu] backdrop onLayout ->",
                e.nativeEvent.layout,
              )
            }
          />

          {/* Dark dimming tint — visual only (pointerEvents="none"), stops
              above the system nav bar so it doesn't paint over it. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.backdropTint,
              { bottom: insets.bottom, opacity: backdropOpacity },
            ]}
          />

          {/* Drawer panel */}
          <Animated.View
            style={[
              styles.drawer,
              { bottom: insets.bottom, transform: [{ translateX }] },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: insets.top + 24,
                  paddingBottom: insets.bottom + 24,
                },
              ]}
            >
              {/* App title */}
              <Text style={styles.appTitle}>A2salah</Text>

              {/* Location row */}
              <View style={styles.divider} />
              <DrawerRow
                icon="📍"
                label={city}
                labelStyle={styles.cityLabel}
                onPress={() => {}}
              />
              <View style={styles.divider} />

              {/* Main settings */}
              {ITEMS_MAIN.map((item) => (
                <DrawerRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  onPress={() => handleMenuItemPress(item.label)}
                />
              ))}

              <DrawerRow
                icon="🔔"
                label="Choose Notification Sound"
                onPress={handleOpenSoundPicker}
              />
           
              <DrawerRow
                icon="🎚️"
                label="Tune Prayer Timings"
                onPress={handleTune}
              />
              <DrawerRow
                icon="🗓️"
                label="Tune a Specific Date"
                onPress={handleDateTune}
              />
                <DrawerRow
                icon="🔄"
                label="Reset Chart"
                onPress={handleReset}
              />
              <DrawerRow
                icon="🆔"
                label="Add ID"
                onPress={handleOpenAddId}
              />

              <View style={styles.sectionGap} />

              {/* Contact Us */}
              <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>CONTACT US</Text>
              <TouchableOpacity onPress={handleEmail} style={styles.textRow}>
                <Text style={styles.textRowLabel}>Send us an email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReportIssue}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>Report an issue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSuggestFeature}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>Suggest a feature</Text>
              </TouchableOpacity>

              {/* About */}
              <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>A2SALAH</Text>
              <TouchableOpacity
                onPress={handleAbout}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>About A2salah</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRateApp}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>Rate the app</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePlaceholder("Invite friends")}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>
                  Invite friends to A2salah
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLegal}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>
                  Terms of use and Privacy
                </Text>
              </TouchableOpacity>
              <View style={styles.textRow}>
                <Text style={styles.versionText}>
                  Current version {APP_VERSION}
                </Text>
              </View>

              {/* Masarat / Developer links */}
              <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>A2MATION </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL("https://a2mation.com")}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>Our Website</Text>
              </TouchableOpacity>
             

               <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>OTHER APP</Text>
             
              <TouchableOpacity
                 onPress={() => Linking.openURL("https://play.google.com/store/apps/details?id=com.A2mation.A2Gold")}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>A2Gold</Text>
              </TouchableOpacity>
            
            

              <View style={{ height: 32 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={volumeModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVolumeModalVisible(false)}
      >
        <Pressable
          style={styles.volumeModalOverlay}
          onPress={() => setVolumeModalVisible(false)}
        >
          <Pressable style={styles.volumeModalCard} onPress={() => {}}>
            <Text style={styles.volumeModalTitle}>Reminder Volume</Text>
            <Text style={styles.volumeModalDescription}>
              How intense should the reminder sound be? This is baked into the
              sound itself, so it applies even when a reminder fires with the
              app closed.
            </Text>

            <View style={styles.volumeChipRow}>
              {VOLUME_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => handleSelectVolume(option.key)}
                  style={[
                    styles.volumeChip,
                    volumeLevel === option.key && styles.volumeChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.volumeChipText,
                      volumeLevel === option.key && styles.volumeChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.volumeModalActions}>
              <TouchableOpacity
                style={styles.volumeCancelBtn}
                onPress={handlePreviewVolume}
              >
                <Text style={styles.volumeCancelBtnText}>Preview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.volumeDoneBtn}
                onPress={() => setVolumeModalVisible(false)}
              >
                <Text style={styles.volumeDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={soundModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          stopPreview();
          setSoundModalVisible(false);
        }}
      >
        <Pressable
          style={styles.volumeModalOverlay}
          onPress={() => {
            stopPreview();
            setSoundModalVisible(false);
          }}
        >
          <Pressable style={styles.soundModalCard} onPress={() => {}}>
            <Text style={styles.volumeModalTitle}>Choose Notification Sound</Text>
            <Text style={styles.volumeModalDescription}>
              Pick the sound that plays for your prayer reminders — tap a
              sound to preview and select it. This applies even when a
              reminder fires with the app closed.
            </Text>

            <ScrollView
              style={styles.soundList}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                style={styles.soundRow}
                onPress={handleUseDefaultSound}
                activeOpacity={0.65}
              >
                <View style={styles.soundRowTextWrap}>
                  <Text style={styles.soundRowLabel}>Default (Volume-based)</Text>
                  <Text style={styles.soundRowSubLabel}>
                    Uses the intensity chosen in Volume
                  </Text>
                </View>
                {selectedSoundKey === null && (
                  <Text style={styles.soundRowCheck}>✓</Text>
                )}
              </TouchableOpacity>

              {SOUND_LIBRARY.map((entry) => (
                <TouchableOpacity
                  key={entry.key}
                  style={styles.soundRow}
                  onPress={() => handleSelectSound(entry.key)}
                  activeOpacity={0.65}
                >
                  <Text style={styles.soundRowLabel}>{entry.label}</Text>
                  {selectedSoundKey === entry.key && (
                    <Text style={styles.soundRowCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.volumeModalActions}>
              <TouchableOpacity
                style={styles.volumeDoneBtn}
                onPress={() => {
                  stopPreview();
                  setSoundModalVisible(false);
                }}
              >
                <Text style={styles.volumeDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={resetModalVisible}
        animationType="fade"
        transparent
        onRequestClose={handleCancelReset}
      >
        <View style={styles.resetModalOverlay}>
          <View style={styles.resetModalCard}>
            <Text style={styles.resetModalIcon}>⚠️</Text>
            <Text style={styles.resetModalTitle}>Reset Chart</Text>
            <Text style={styles.resetModalDescription}>
              This will permanently remove all your personal tuning
              adjustments — Tune Prayer Timings, Ramadan tuning, and any
              date-specific tunes — and restore the original backend
              timings. This can't be undone.
            </Text>

            <View style={styles.resetModalActions}>
              <TouchableOpacity
                style={styles.resetCancelBtn}
                onPress={handleCancelReset}
              >
                <Text style={styles.resetCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.resetOkBtn,
                  resetCountdown > 0 && styles.resetOkBtnDisabled,
                ]}
                onPress={handleConfirmReset}
                disabled={resetCountdown > 0}
              >
                <Text
                  style={[
                    styles.resetOkBtnText,
                    resetCountdown > 0 && styles.resetOkBtnTextDisabled,
                  ]}
                >
                  {resetCountdown > 0 ? `OK (${resetCountdown})` : "OK"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add ID — step 1: choose Admin or User */}
      <Modal
        visible={addIdRoleModalVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCancelAddIdRole}
      >
        <Pressable
          style={styles.volumeModalOverlay}
          onPress={handleCancelAddIdRole}
        >
          <Pressable style={styles.volumeModalCard} onPress={() => {}}>
            <Text style={styles.volumeModalTitle}>Add ID</Text>
            <Text style={styles.volumeModalDescription}>
              Choose the type of ID you want to create.
            </Text>

            <View style={styles.addIdRoleRow}>
              <TouchableOpacity
                style={styles.addIdRoleOption}
                onPress={() => handleSelectAddIdRole("admin")}
                activeOpacity={0.7}
              >
                <Text style={styles.addIdRoleIcon}>🛡️</Text>
                <Text style={styles.addIdRoleLabel}>Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addIdRoleOption}
                onPress={() => handleSelectAddIdRole("user")}
                activeOpacity={0.7}
              >
                <Text style={styles.addIdRoleIcon}>👤</Text>
                <Text style={styles.addIdRoleLabel}>User</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.volumeModalActions}>
              <TouchableOpacity
                style={styles.volumeCancelBtn}
                onPress={handleCancelAddIdRole}
              >
                <Text style={styles.volumeCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add ID — step 2: fill in the form (fields depend on the chosen role) */}
      <Modal
        visible={addIdFormVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCancelAddIdForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            style={styles.volumeModalOverlay}
            onPress={handleCancelAddIdForm}
          >
            <Pressable style={styles.volumeModalCard} onPress={() => {}}>
              <Text style={styles.volumeModalTitle}>
                {addIdRole === "admin" ? "Add Admin ID" : "Add User ID"}
              </Text>
              <Text style={styles.volumeModalDescription}>
                {addIdRole === "admin"
                  ? "Create a new admin login."
                  : "Create a new user login."}
              </Text>

              <View style={styles.addIdFormFields}>
                <Text style={styles.addIdInputLabel}>ID</Text>
                <TextInput
                  style={styles.addIdInput}
                  value={addIdForm.id}
                  onChangeText={(v) => handleAddIdFieldChange("id", v)}
                  placeholder="Enter ID"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.addIdInputLabel}>Password</Text>
                <TextInput
                  style={styles.addIdInput}
                  value={addIdForm.password}
                  onChangeText={(v) => handleAddIdFieldChange("password", v)}
                  placeholder="Enter password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                />

                {addIdRole === "admin" && (
                  <>
                    <Text style={styles.addIdInputLabel}>Confirm Password</Text>
                    <TextInput
                      style={styles.addIdInput}
                      value={addIdForm.confirmPassword}
                      onChangeText={(v) =>
                        handleAddIdFieldChange("confirmPassword", v)
                      }
                      placeholder="Re-enter password"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  </>
                )}
              </View>

              <View style={styles.volumeModalActions}>
                <TouchableOpacity
                  style={styles.volumeCancelBtn}
                  onPress={handleBackToAddIdRole}
                >
                  <Text style={styles.volumeCancelBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.volumeDoneBtn,
                    addIdSubmitting && { opacity: 0.6 },
                  ]}
                  onPress={handleSubmitAddId}
                  disabled={addIdSubmitting}
                >
                  <Text style={styles.volumeDoneBtnText}>
                    {addIdSubmitting ? "Saving..." : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "transparent",
  },
  backdropTint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000",
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.white,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
  },
  scrollContent: {},
  appTitle: {
    color: colors.navy,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowIcon: { fontSize: 18, width: 32 },
  rowLabel: { color: colors.navy, fontSize: 15 },
  cityLabel: { fontWeight: "700" },
  sectionGap: { height: 16 },
  sectionTitle: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  textRow: { paddingVertical: 13, paddingHorizontal: 20 },
  textRowLabel: { color: colors.navy, fontSize: 15 },
  versionText: { color: colors.textMuted, fontSize: 14 },
  volumeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  volumeModalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  volumeModalTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  volumeModalDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  volumeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  volumeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  volumeChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  volumeChipText: { color: colors.navy, fontSize: 13 },
  volumeChipTextActive: { color: colors.white, fontWeight: "700" },
  // "Choose Notification Sound" modal — shares volumeModalOverlay/Title/
  // Description/Actions/DoneBtn with the Volume modal above, but needs its
  // own card style (taller, since it holds a scrollable list of 16 rows
  // instead of 3 inline chips) and its own row styles.
  soundModalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  soundList: {
    marginTop: 16,
    maxHeight: 360,
  },
  soundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  soundRowTextWrap: { flex: 1 },
  soundRowLabel: { color: colors.navy, fontSize: 15 },
  soundRowSubLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  soundRowCheck: { color: colors.gold, fontSize: 18, fontWeight: "700", marginLeft: 12 },
  volumeModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 24,
    marginBottom: 30,
  },
  volumeCancelBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  volumeCancelBtnText: { color: colors.textMuted, fontSize: 15 },
  volumeDoneBtn: {
    backgroundColor: colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginLeft: 8,
  },
  volumeDoneBtnText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  resetModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  resetModalCard: {
    width: "100%",
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  resetModalIcon: { fontSize: 32, marginBottom: 8 },
  resetModalTitle: {
    color: colors.navy,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  resetModalDescription: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },
  resetModalActions: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
    width: "100%",
  },
  resetCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    marginRight: 8,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetCancelBtnText: { color: colors.navy, fontSize: 15, fontWeight: "600" },
  resetOkBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    marginLeft: 8,
    alignItems: "center",
    backgroundColor: "#D64545",
  },
  resetOkBtnDisabled: { backgroundColor: colors.border },
  resetOkBtnText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  resetOkBtnTextDisabled: { color: colors.textMuted },
  addIdRoleRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  addIdRoleOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addIdRoleIcon: { fontSize: 28, marginBottom: 8 },
  addIdRoleLabel: { color: colors.navy, fontSize: 15, fontWeight: "700" },
  addIdFormFields: { marginTop: 16 },
  addIdInputLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  addIdInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.navy,
  },
});