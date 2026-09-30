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
import useTranslation from '../i18n/Usetranslation.js';
import { SUPPORTED_LOCALES, setLocale } from '../i18n/localeStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.76;

const VOLUME_OPTIONS = [
  { key: "low", labelKey: "drawer.volumeSoft" },
  { key: "medium", labelKey: "drawer.volumeMedium" },
  { key: "high", labelKey: "drawer.volumeLoud" },
];

// Languages offered in the drawer's Language picker — code must match a
// SUPPORTED_LOCALES entry in localeStore.js, nameKey resolves via
// common.languageName in that language's own dictionary (so each name is
// always shown in its own script, regardless of the currently active
// language).
const LANGUAGE_OPTIONS = [
  { code: "en", nativeName: "English" },
  { code: "bn", nativeName: "বাংলা" },
  { code: "ur", nativeName: "اردو" },
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
// entry here must be kept in sync with it by key. Each sound now has three
// intensity variants (low/medium/high) generated from its original
// recording — see getLibrarySoundFile in notificationSetup.js for the
// filename convention these must match.
const NOTIFICATION_SOUND_ASSETS = {
  sound_01: {
    low: require("../../assets/sounds/salat_high_1_low.wav"),
    medium: require("../../assets/sounds/salat_high_1.wav"),
    high: require("../../assets/sounds/salat_high_1_high.wav"),
  },
  sound_02: {
    low: require("../../assets/sounds/salat_high_2_low.wav"),
    medium: require("../../assets/sounds/salat_high_2.wav"),
    high: require("../../assets/sounds/salat_high_2_high.wav"),
  },
  sound_03: {
    low: require("../../assets/sounds/salat_high_3_low.wav"),
    medium: require("../../assets/sounds/salat_high_3.wav"),
    high: require("../../assets/sounds/salat_high_3_high.wav"),
  },
  sound_04: {
    low: require("../../assets/sounds/salat_high_4_low.wav"),
    medium: require("../../assets/sounds/salat_high_4.wav"),
    high: require("../../assets/sounds/salat_high_4_high.wav"),
  },
  sound_05: {
    low: require("../../assets/sounds/salat_high_5_low.wav"),
    medium: require("../../assets/sounds/salat_high_5.wav"),
    high: require("../../assets/sounds/salat_high_5_high.wav"),
  },
  sound_06: {
    low: require("../../assets/sounds/salat_high_6_low.wav"),
    medium: require("../../assets/sounds/salat_high_6.wav"),
    high: require("../../assets/sounds/salat_high_6_high.wav"),
  },
  sound_07: {
    low: require("../../assets/sounds/salat_high_7_low.wav"),
    medium: require("../../assets/sounds/salat_high_7.wav"),
    high: require("../../assets/sounds/salat_high_7_high.wav"),
  },
  sound_08: {
    low: require("../../assets/sounds/salat_high_8_low.wav"),
    medium: require("../../assets/sounds/salat_high_8.wav"),
    high: require("../../assets/sounds/salat_high_8_high.wav"),
  },
  sound_09: {
    low: require("../../assets/sounds/salat_high_9_low.wav"),
    medium: require("../../assets/sounds/salat_high_9.wav"),
    high: require("../../assets/sounds/salat_high_9_high.wav"),
  },
  sound_10: {
    low: require("../../assets/sounds/salat_high_10_low.wav"),
    medium: require("../../assets/sounds/salat_high_10.wav"),
    high: require("../../assets/sounds/salat_high_10_high.wav"),
  },
  sound_11: {
    low: require("../../assets/sounds/salat_high_11_low.wav"),
    medium: require("../../assets/sounds/salat_high_11.wav"),
    high: require("../../assets/sounds/salat_high_11_high.wav"),
  },
  sound_12: {
    low: require("../../assets/sounds/salat_high_12_low.wav"),
    medium: require("../../assets/sounds/salat_high_12.wav"),
    high: require("../../assets/sounds/salat_high_12_high.wav"),
  },
  sound_13: {
    low: require("../../assets/sounds/salat_high_13_low.wav"),
    medium: require("../../assets/sounds/salat_high_13.wav"),
    high: require("../../assets/sounds/salat_high_13_high.wav"),
  },
  sound_14: {
    low: require("../../assets/sounds/salat_high_14_low.wav"),
    medium: require("../../assets/sounds/salat_high_14.wav"),
    high: require("../../assets/sounds/salat_high_14_high.wav"),
  },
  sound_15: {
    low: require("../../assets/sounds/salat_high_15_low.wav"),
    medium: require("../../assets/sounds/salat_high_15.wav"),
    high: require("../../assets/sounds/salat_high_15_high.wav"),
  },
};

// "Language" and "Volume" are handled specially (each opens its own
// picker below) — every other row here still just shows the generic
// "coming soon" placeholder.
const ITEMS_MAIN = [
 
  { icon: "🔊", labelKey: "drawer.volume", id: "volume" },
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
  const { t, locale } = useTranslation();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
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
        previewPlayerRef.current.pause();
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
    Alert.alert(label, t("drawer.comingSoonBody"));
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
          t("drawer.rateAppNotOnStoreTitle"),
          t("drawer.rateAppNotOnStoreBody"),
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

    Alert.alert(t("drawer.rateApp"), t("drawer.comingSoonBody"));
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
      Alert.alert(t("drawer.missingInfoTitle"), t("drawer.missingInfoBody"));
      return;
    }
    if (addIdRole === "admin" && password !== confirmPassword) {
      Alert.alert(t("drawer.passwordMismatchTitle"), t("drawer.passwordMismatchBody"));
      return;
    }

    setAddIdSubmitting(true);
    try {
      // TODO: wire this up to a real backend endpoint (e.g. POST
      // /api/auth/register) once one exists — for now this just confirms
      // the submission locally, mirroring the other "coming soon" rows.
      await new Promise((resolve) => setTimeout(resolve, 300));
      Alert.alert(
        t("drawer.idCreatedTitle"),
        t("drawer.idCreatedBody", {
          role: addIdRole === "admin" ? t("drawer.admin") : t("drawer.user"),
          id: id.trim(),
        }),
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

  // Mirrors notificationSoundStore's getEffectiveSoundFile(): if the user
  // has explicitly picked one of the 15 library sounds, THAT is what will
  // actually fire on a real reminder — the volume-intensity clip only
  // applies when no explicit choice has been made. Preview must follow the
  // same precedence, or tapping a volume chip plays a clip that isn't the
  // one the user will really hear.
  const getEffectivePreviewAsset = (level) => {
    const entryAssets = selectedSoundKey && NOTIFICATION_SOUND_ASSETS[selectedSoundKey];
    if (entryAssets) {
      return entryAssets[level] || entryAssets.medium;
    }
    return SOUND_ASSETS[level];
  };

  const handleSelectVolume = async (level) => {
    setVolumeLevelState(level);
    await setVolumeLevel(level);
    // Fire the effective sound immediately on tap, same as the 15-sound
    // picker's handleSelectSound does — otherwise the chip looks unresponsive
    // until the separate "Preview" button is pressed.
    playPreview(getEffectivePreviewAsset(level));
  };

  // Plays whichever sound will actually fire for a real reminder right now,
  // so the preview is instant instead of waiting on a scheduled OS
  // notification.
  const handlePreviewVolume = () => {
    playPreview(getEffectivePreviewAsset(volumeLevel));
  };

  const handleOpenLanguage = () => {
    setLanguageModalVisible(true);
  };

  const handleSelectLanguage = (code) => {
    setLocale(code);
    setLanguageModalVisible(false);
  };

  const handleMenuItemPress = (item) => {
    if (item.id === "volume") {
      handleOpenVolume();
      return;
    }
  
    handlePlaceholder(t(item.labelKey));
  };

  const handleOpenSoundPicker = () => {
    onClose();
    setSoundModalVisible(true);
  };

  const stopPreview = () => {
    if (previewPlayerRef.current) {
      previewPlayerRef.current.pause();
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
    // Preview at the CURRENT volume intensity, not always "medium" — this
    // is what will actually fire for a real reminder (see
    // notificationSoundStore's getEffectiveSoundFile).
    playPreview(NOTIFICATION_SOUND_ASSETS[key][volumeLevel]);
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
              <Text style={styles.appTitle}>{t("drawer.appTitle")}</Text>

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
                  key={item.id}
                  icon={item.icon}
                  label={t(item.labelKey)}
                  onPress={() => handleMenuItemPress(item)}
                />
              ))}

              <DrawerRow
                icon="🔔"
                label={t("drawer.chooseNotificationSound")}
                onPress={handleOpenSoundPicker}
              />
           
              <DrawerRow
                icon="🎚️"
                label={t("drawer.tunePrayerTimings")}
                onPress={handleTune}
              />
              <DrawerRow
                icon="🗓️"
                label={t("drawer.tuneSpecificDate")}
                onPress={handleDateTune}
              />
                <DrawerRow
                icon="🔄"
                label={t("drawer.resetChart")}
                onPress={handleReset}
              />
              <DrawerRow
                icon="🆔"
                label={t("drawer.addId")}
                onPress={handleOpenAddId}
              />

              <View style={styles.sectionGap} />

              {/* Contact Us */}
              <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>{t("drawer.contactUs")}</Text>
              <TouchableOpacity onPress={handleEmail} style={styles.textRow}>
                <Text style={styles.textRowLabel}>{t("drawer.sendEmail")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReportIssue}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.reportIssue")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSuggestFeature}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.suggestFeature")}</Text>
              </TouchableOpacity>

              {/* About */}
              <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>{t("drawer.aboutSection")}</Text>
              <TouchableOpacity
                onPress={handleAbout}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.aboutApp")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRateApp}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.rateApp")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePlaceholder(t("drawer.inviteFriends"))}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>
                  {t("drawer.inviteFriends")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLegal}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>
                  {t("drawer.termsPrivacy")}
                </Text>
              </TouchableOpacity>
              <View style={styles.textRow}>
                <Text style={styles.versionText}>
                  {t("drawer.currentVersion", { version: APP_VERSION })}
                </Text>
              </View>

              {/* Masarat / Developer links */}
              <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>{t("drawer.developerSection")} </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL("https://a2mation.com")}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.ourWebsite")}</Text>
              </TouchableOpacity>
             

               <View style={styles.sectionGap} />
              <Text style={styles.sectionTitle}>{t("drawer.otherAppSection")}</Text>
             
              <TouchableOpacity
                 onPress={() => Linking.openURL("https://play.google.com/store/apps/details?id=com.A2mation.A2Gold")}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.otherApp")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                Linking.openURL("market://dev?id=6595292842765885781").catch(() => {
                Linking.openURL("https://play.google.com/store/apps/dev?id=6595292842765885781");
              });
              }}
                style={styles.textRow}
              >
                <Text style={styles.textRowLabel}>{t("drawer.ourOtherApps")}</Text>
              </TouchableOpacity>
            
            

              <View style={{ height: 32 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={languageModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <Pressable
          style={styles.volumeModalOverlay}
          onPress={() => setLanguageModalVisible(false)}
        >
          <Pressable style={styles.volumeModalCard} onPress={() => {}}>
            <Text style={styles.volumeModalTitle}>{t("drawer.chooseLanguage")}</Text>
            <Text style={styles.volumeModalDescription}>
              {t("drawer.chooseLanguageDescription")}
            </Text>

            <View style={{ marginTop: 16 }}>
              {LANGUAGE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.code}
                  onPress={() => handleSelectLanguage(option.code)}
                  style={styles.soundRow}
                  activeOpacity={0.65}
                >
                  <Text style={styles.soundRowLabel}>{option.nativeName}</Text>
                  {locale === option.code && (
                    <Text style={styles.soundRowCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.volumeModalActions}>
              <TouchableOpacity
                style={styles.volumeDoneBtn}
                onPress={() => setLanguageModalVisible(false)}
              >
                <Text style={styles.volumeDoneBtnText}>{t("common.done")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
            <Text style={styles.volumeModalTitle}>{t("drawer.reminderVolume")}</Text>
            <Text style={styles.volumeModalDescription}>
              {t("drawer.reminderVolumeDescription")}
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
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.volumeModalActions}>
              {/* <TouchableOpacity
                style={styles.volumeCancelBtn}
                onPress={handlePreviewVolume}
              >
                <Text style={styles.volumeCancelBtnText}>{t("drawer.preview")}</Text>
              </TouchableOpacity> */}
              <TouchableOpacity
                style={styles.volumeDoneBtn}
                onPress={() => setVolumeModalVisible(false)}
              >
                <Text style={styles.volumeDoneBtnText}>Save</Text>
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
            <Text style={styles.volumeModalTitle}>{t("drawer.chooseNotificationSound")}</Text>
            <Text style={styles.volumeModalDescription}>
              {t("drawer.chooseSoundDescription")}
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
                  <Text style={styles.soundRowLabel}>{t("drawer.defaultVolumeBased")}</Text>
                  <Text style={styles.soundRowSubLabel}>
                    {t("drawer.defaultVolumeBasedSub")}
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
                <Text style={styles.volumeDoneBtnText}>{t("common.done")}</Text>
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
            <Text style={styles.resetModalTitle}>{t("drawer.resetChartTitle")}</Text>
            <Text style={styles.resetModalDescription}>
              {t("drawer.resetChartDescription")}
            </Text>

            <View style={styles.resetModalActions}>
              <TouchableOpacity
                style={styles.resetCancelBtn}
                onPress={handleCancelReset}
              >
                <Text style={styles.resetCancelBtnText}>{t("common.cancel")}</Text>
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
                  {resetCountdown > 0
                    ? t("drawer.resetOkCountdown", { seconds: resetCountdown })
                    : t("common.ok")}
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
            <Text style={styles.volumeModalTitle}>{t("drawer.addIdTitle")}</Text>
            <Text style={styles.volumeModalDescription}>
              {t("drawer.addIdDescription")}
            </Text>

            <View style={styles.addIdRoleRow}>
              <TouchableOpacity
                style={styles.addIdRoleOption}
                onPress={() => handleSelectAddIdRole("admin")}
                activeOpacity={0.7}
              >
                <Text style={styles.addIdRoleIcon}>🛡️</Text>
                <Text style={styles.addIdRoleLabel}>{t("drawer.admin")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addIdRoleOption}
                onPress={() => handleSelectAddIdRole("user")}
                activeOpacity={0.7}
              >
                <Text style={styles.addIdRoleIcon}>👤</Text>
                <Text style={styles.addIdRoleLabel}>{t("drawer.user")}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.volumeModalActions}>
              <TouchableOpacity
                style={styles.volumeCancelBtn}
                onPress={handleCancelAddIdRole}
              >
                <Text style={styles.volumeCancelBtnText}>{t("common.cancel")}</Text>
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
                {addIdRole === "admin" ? t("drawer.addAdminId") : t("drawer.addUserId")}
              </Text>
              <Text style={styles.volumeModalDescription}>
                {addIdRole === "admin"
                  ? t("drawer.createAdminLogin")
                  : t("drawer.createUserLogin")}
              </Text>

              <View style={styles.addIdFormFields}>
                <Text style={styles.addIdInputLabel}>{t("drawer.idLabel")}</Text>
                <TextInput
                  style={styles.addIdInput}
                  value={addIdForm.id}
                  onChangeText={(v) => handleAddIdFieldChange("id", v)}
                  placeholder={t("drawer.enterId")}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.addIdInputLabel}>{t("drawer.passwordLabel")}</Text>
                <TextInput
                  style={styles.addIdInput}
                  value={addIdForm.password}
                  onChangeText={(v) => handleAddIdFieldChange("password", v)}
                  placeholder={t("drawer.enterPassword")}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                />

                {addIdRole === "admin" && (
                  <>
                    <Text style={styles.addIdInputLabel}>{t("drawer.confirmPasswordLabel")}</Text>
                    <TextInput
                      style={styles.addIdInput}
                      value={addIdForm.confirmPassword}
                      onChangeText={(v) =>
                        handleAddIdFieldChange("confirmPassword", v)
                      }
                      placeholder={t("drawer.reenterPassword")}
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
                  <Text style={styles.volumeCancelBtnText}>{t("common.back")}</Text>
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
                    {addIdSubmitting ? t("drawer.saving") : t("common.save")}
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