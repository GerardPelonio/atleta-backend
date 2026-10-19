import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoachSettingsData, DEFAULT_COACH_SETTINGS } from "../DataTypes";
import { requestAuthenticatedJson, getStoredAuthToken } from "../../Authentication/authShared";
import { db } from "../../../../services/firebaseClient";
import { doc, getDoc, setDoc } from "firebase/firestore";
import styles from "./styles/CoachSettings";

export const COACH_SETTINGS_STORAGE_KEY = "@atleta_coach_settings_preferences";

export interface CoachSettingsProps {
  settings?: CoachSettingsData;
  onUpdateSettings?: (updated: CoachSettingsData) => void;
  onBack?: () => void;
  onLogout?: () => void;
  onChangePassword?: () => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

// Helper Reusable Password Input Field Component
const PasswordInputField = ({
  label,
  value,
  placeholder,
  onChangeText,
  isSecure,
  onToggleSecure,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  isSecure: boolean;
  onToggleSecure: () => void;
}) => (
  <>
    <Text style={styles.inputLabel}>{label}</Text>
    <View style={styles.inputWrapper}>
      <TextInput
        style={styles.passwordInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        secureTextEntry={isSecure}
      />
      <TouchableOpacity onPress={onToggleSecure}>
        <Ionicons
          name={isSecure ? "eye-off-outline" : "eye-outline"}
          size={20}
          color="#64748B"
        />
      </TouchableOpacity>
    </View>
  </>
);

// Resolve current authenticated coach UID from token or settings
const resolveCurrentCoachUid = async (settingsCoachId?: string): Promise<string> => {
  if (settingsCoachId && settingsCoachId !== "coach_erick_001") {
    return String(settingsCoachId).replace(/^coach_/, "");
  }
  try {
    const token = await getStoredAuthToken();
    if (token && token.includes(".")) {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = typeof atob === "function" ? atob(base64) : ((globalThis as any).Buffer ? (globalThis as any).Buffer.from(base64, "base64").toString("utf-8") : "");
      if (decoded) {
        const payload = JSON.parse(decoded);
        return String(payload.uid || payload.user_id || payload.sub || "").replace(/^coach_/, "");
      }
    }
  } catch (_) {}
  return "";
};

// API Request: update coach settings & preferences (PUT /api/coach/settings)
export function CoachSettings({
  settings = DEFAULT_COACH_SETTINGS,
  onUpdateSettings,
  onBack,
  onLogout,
  onChangePassword,
  onOpenTerms,
  onOpenPrivacy,
}: CoachSettingsProps) {
  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top, 16) + 10;

  // Local Reactive Client State
  const [settingsState, setSettingsState] = useState<CoachSettingsData>(settings);
  const [philosophyInput, setPhilosophyInput] = useState<string>(
    settings.coachingPhilosophy || settings.coaching_philosophy || ""
  );
  const [isSavingPhilosophy, setIsSavingPhilosophy] = useState(false);

  // Load persisted settings & philosophy on mount: Firestore first, then scoped cache
  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const cleanUid = await resolveCurrentCoachUid(settings.coach_id);
        const scopedKey = cleanUid ? `@atleta_coach_settings_${cleanUid}` : COACH_SETTINGS_STORAGE_KEY;

        // 1. Fetch live from Firestore first based on user UID
        let liveSettings: Partial<CoachSettingsData> | null = null;
        let livePhilosophy = "";
        if (cleanUid) {
          try {
            const canonicalId = `coach_${cleanUid}`;
            const [cDoc1, cDoc2, uDoc] = await Promise.all([
              getDoc(doc(db, "Coach_Profiles", canonicalId)).catch(() => null),
              getDoc(doc(db, "Coach_Profiles", cleanUid)).catch(() => null),
              getDoc(doc(db, "Users", cleanUid)).catch(() => null),
            ]);
            const coachData = (cDoc1 && cDoc1.exists()) ? cDoc1.data() : (cDoc2 && cDoc2.exists()) ? cDoc2.data() : null;
            const userData = (uDoc && uDoc.exists()) ? uDoc.data() : null;
            const merged = { ...(userData || {}), ...(coachData || {}) };

            if (merged.settings) {
              liveSettings = merged.settings;
            }
            livePhilosophy = merged.coachingPhilosophy || merged.coaching_philosophy || merged.philosophy || "";
          } catch (fsErr) {
            console.warn("Firestore live settings fetch notice:", fsErr);
          }
        }

        if (liveSettings || livePhilosophy) {
          if (isMounted) {
            setSettingsState((prev) => {
              const updated = {
                ...prev,
                ...(liveSettings || {}),
                coachingPhilosophy: livePhilosophy || prev.coachingPhilosophy || "",
                coaching_philosophy: livePhilosophy || prev.coaching_philosophy || "",
              };
              if (cleanUid) {
                AsyncStorage.setItem(scopedKey, JSON.stringify(updated)).catch(() => null);
              }
              return updated;
            });
            if (livePhilosophy) {
              setPhilosophyInput(livePhilosophy);
            }
          }
          return;
        }

        // 2. Scoped local cache fallback
        const stored = await AsyncStorage.getItem(scopedKey);
        if (stored && isMounted) {
          try {
            const parsed = JSON.parse(stored);
            setSettingsState((prev) => ({ ...prev, ...parsed }));
            if (parsed.coachingPhilosophy || parsed.coaching_philosophy) {
              setPhilosophyInput(parsed.coachingPhilosophy || parsed.coaching_philosophy);
            }
          } catch (_) {}
        }
      } catch (_) {}
    };

    loadSettings();
    return () => {
      isMounted = false;
    };
  }, [settings.coach_id]);

  // Modals & Passwords State
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentSec, setShowCurrentSec] = useState(true);
  const [showNewSec, setShowNewSec] = useState(true);
  const [showConfirmSec, setShowConfirmSec] = useState(true);
  const [passwordError, setPasswordError] = useState("");

  // Update Setting Helper with user-scoped storage & Firestore-first persistence
  const updateSetting = async (key: keyof CoachSettingsData, value: any) => {
    const updated = { ...settingsState, [key]: value, updated_at: new Date().toISOString() };
    setSettingsState(updated);
    if (onUpdateSettings) onUpdateSettings(updated);

    const cleanUid = await resolveCurrentCoachUid(settings.coach_id);
    const scopedKey = cleanUid ? `@atleta_coach_settings_${cleanUid}` : COACH_SETTINGS_STORAGE_KEY;

    try {
      await AsyncStorage.setItem(scopedKey, JSON.stringify(updated));
    } catch (storeErr) {
      console.warn("Settings storage error:", storeErr);
    }

    // Direct Firestore write scoped strictly to this coach's documents
    if (cleanUid) {
      const canonicalId = `coach_${cleanUid}`;
      const firestoreSettingsPayload = {
        settings: {
          data_sync_preference: updated.data_sync_preference,
          game_log_updates: updated.game_log_updates,
          recruitment_inquiries: updated.recruitment_inquiries,
          updated_at: updated.updated_at,
        },
        data_sync_preference: updated.data_sync_preference,
        updated_at: updated.updated_at,
      };
      await Promise.all([
        setDoc(doc(db, "Coach_Profiles", canonicalId), firestoreSettingsPayload, { merge: true }).catch(() => null),
        setDoc(doc(db, "Coach_Profiles", cleanUid), firestoreSettingsPayload, { merge: true }).catch(() => null),
        setDoc(doc(db, "Users", cleanUid), firestoreSettingsPayload, { merge: true }).catch(() => null),
      ]);
    }

    try {
      await requestAuthenticatedJson("/coaches/me/settings", "PATCH", {
        data_sync_preference: updated.data_sync_preference,
        notification_preferences: {
          game_log_updates: updated.game_log_updates,
          recruitment_inquiries: updated.recruitment_inquiries,
        },
      });
    } catch (err) {
      console.warn("Settings sync error:", err);
    }
  };

  // Coaching Philosophy Save Handler
  const handleSavePhilosophy = async () => {
    setIsSavingPhilosophy(true);
    const trimmed = philosophyInput.trim();
    try {
      const cleanUid = await resolveCurrentCoachUid(settings.coach_id);
      const canonicalId = cleanUid ? `coach_${cleanUid}` : "";
      const philosophyPayload = {
        coachingPhilosophy: trimmed,
        coaching_philosophy: trimmed,
        philosophy: trimmed,
        quote: trimmed,
        updated_at: new Date().toISOString(),
      };

      // 1. Direct Firestore write
      if (cleanUid) {
        await Promise.all([
          setDoc(doc(db, "Coach_Profiles", canonicalId), philosophyPayload, { merge: true }).catch(() => null),
          setDoc(doc(db, "Coach_Profiles", cleanUid), philosophyPayload, { merge: true }).catch(() => null),
          setDoc(doc(db, "Users", cleanUid), philosophyPayload, { merge: true }).catch(() => null),
        ]);
      }

      // 2. User-scoped cache update
      const scopedKey = cleanUid ? `@atleta_coach_settings_${cleanUid}` : COACH_SETTINGS_STORAGE_KEY;
      const updated = {
        ...settingsState,
        coachingPhilosophy: trimmed,
        coaching_philosophy: trimmed,
      };
      setSettingsState(updated);
      if (onUpdateSettings) onUpdateSettings(updated);
      await AsyncStorage.setItem(scopedKey, JSON.stringify(updated)).catch(() => null);

      // 3. API background sync
      requestAuthenticatedJson("/coaches/me/profile", "PATCH", philosophyPayload).catch(() => null);

      Alert.alert("Coaching Philosophy Saved", "Your coaching philosophy has been successfully updated and will be displayed to athletes.");
    } catch (err: any) {
      console.warn("Save philosophy error:", err);
      Alert.alert("Error", "Could not save coaching philosophy. Please try again.");
    } finally {
      setIsSavingPhilosophy(false);
    }
  };

  const handleOpenChangePassword = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setShowCurrentSec(true);
    setShowNewSec(true);
    setShowConfirmSec(true);
    setShowChangePasswordModal(true);
    if (onChangePassword) onChangePassword();
  };

  const handleSavePassword = async () => {
    if (!currentPassword.trim()) return setPasswordError("Current password is required.");
    if (newPassword.length < 6) return setPasswordError("New password must be at least 6 characters.");
    if (newPassword !== confirmPassword) return setPasswordError("New password and confirm password do not match.");

    try {
      await requestAuthenticatedJson("/users/change-password", "POST", { password: newPassword });
      setPasswordError("");
      setShowChangePasswordModal(false);
      setShowPasswordSuccessModal(true);
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to update password.");
    }
  };

  const isSyncAuto = settingsState.data_sync_preference === "Automatic";

  return (
    <View style={styles.container}>
      {/* FIXED TOP HEADER */}
      <View style={[styles.fixedHeaderContainer, { paddingTop: headerTopPadding }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SETTINGS</Text>
        </View>
      </View>

      {/* SCROLLABLE SETTINGS BODY */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerTopPadding + 70 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* PRIVACY & DATA */}
        <Text style={styles.sectionLabel}>PRIVACY & DATA</Text>
        <View style={styles.cardBox}>
          <View style={styles.rowItem}>
            <View style={styles.itemLeftContent}>
              <Text style={styles.itemTitle}>Data Sync Preference</Text>
              <Text style={styles.itemSubtext}>
                {isSyncAuto
                  ? "Automatic: Syncs scoresheets, match logs & athlete metrics in background when online."
                  : "Manual: Queues data locally offline until you initiate manual synchronization."}
              </Text>
            </View>
            <Switch
              value={isSyncAuto}
              onValueChange={(val) => updateSetting("data_sync_preference", val ? "Automatic" : "Manual")}
              trackColor={{ false: "#1E293B", true: "#00C8FF" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* APPLICATION PREFERENCES */}
        <Text style={styles.sectionLabel}>APPLICATION PREFERENCES</Text>
        <View style={styles.cardBox}>
          <View style={[styles.rowItem, styles.rowBorder]}>
            <Text style={styles.itemTitle}>Game Log Updates</Text>
            <Switch
              value={settingsState.game_log_updates}
              onValueChange={(val) => updateSetting("game_log_updates", val)}
              trackColor={{ false: "#1E293B", true: "#00C8FF" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.itemTitle}>Recruitment Inquiries</Text>
            <Switch
              value={settingsState.recruitment_inquiries}
              onValueChange={(val) => updateSetting("recruitment_inquiries", val)}
              trackColor={{ false: "#1E293B", true: "#00C8FF" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* COACHING PHILOSOPHY */}
        <Text style={styles.sectionLabel}>COACHING PHILOSOPHY</Text>
        <View style={styles.cardBox}>
          <View style={{ padding: 16 }}>
            <Text style={[styles.itemSubtext, { marginBottom: 10, color: "#94A3B8" }]}>
              Define your coaching philosophy and player expectations. This statement is displayed on your athlete-facing coach preview profile card.
            </Text>
            <TextInput
              style={{
                backgroundColor: "#0F172A",
                borderColor: "#334155",
                borderWidth: 1,
                borderRadius: 8,
                color: "#F8FAFC",
                padding: 12,
                minHeight: 88,
                textAlignVertical: "top",
                fontSize: 14,
              }}
              placeholder="e.g. Relentless effort, high athletic IQ, and character on and off the court."
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={4}
              value={philosophyInput}
              onChangeText={setPhilosophyInput}
            />
            <TouchableOpacity
              style={{
                backgroundColor: "#00C8FF",
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                marginTop: 12,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
              }}
              onPress={handleSavePhilosophy}
              disabled={isSavingPhilosophy}
              activeOpacity={0.8}
            >
              {isSavingPhilosophy ? (
                <ActivityIndicator size="small" color="#080F21" style={{ marginRight: 6 }} />
              ) : (
                <Ionicons name="checkmark-done" size={18} color="#080F21" style={{ marginRight: 6 }} />
              )}
              <Text style={{ color: "#080F21", fontWeight: "700", fontSize: 13, letterSpacing: 0.5 }}>
                {isSavingPhilosophy ? "SAVING..." : "SAVE PHILOSOPHY"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECURITY & COMPLIANCE */}
        <Text style={styles.sectionLabel}>SECURITY & COMPLIANCE</Text>
        <View style={styles.cardBox}>
          <TouchableOpacity style={[styles.rowItem, styles.rowBorder]} onPress={handleOpenChangePassword} activeOpacity={0.7}>
            <Text style={styles.itemTitle}>Change Password</Text>
            <Ionicons name="key-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rowItem, styles.rowBorder]}
            onPress={() => {
              if (onOpenTerms) onOpenTerms();
              else setShowTermsModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.itemTitle}>Terms of Service</Text>
            <Ionicons name="open-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => {
              if (onOpenPrivacy) onOpenPrivacy();
              else setShowPrivacyModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.itemTitle}>Privacy Protocol</Text>
            <Ionicons name="shield-checkmark-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity style={styles.logoutButton} onPress={() => setShowLogoutModal(true)} activeOpacity={0.8}>
          <Text style={styles.logoutText}>LOG OUT</Text>
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>

      {/* TERMS OF SERVICE MODAL */}
      <Modal visible={showTermsModal} transparent animationType="slide" onRequestClose={() => setShowTermsModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTermsModal(false)}>
          <TouchableOpacity style={[styles.modalContentCard, { maxHeight: "80%" }]} activeOpacity={1} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>TERMS OF SERVICE</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 10 }}>
              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                1. ACCEPTANCE OF TERMS & ATHLETIC INTEGRITY
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                By accessing the Atleta Sports Management Platform, coaches agree to uphold professional coaching ethics, verify athlete roster eligibility, and adhere to national and regional tournament standards (e.g., Batang Pinoy, BRAA, DepEd, PSC).
              </Text>

              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                2. CREDENTIALS & INSTITUTION AFFILIATIONS
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                Coaches must provide authentic certifications, license credentials, and institutional affiliations. Misrepresentation of official credentials or tournament qualifications may result in account termination.
              </Text>

              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                3. SCORESHEET LOGGING & AUDIT VALIDATION
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                All match logs, box score data, and OCR-scanned scoresheets are submitted for validation and certification by authorized Tournament Officials. Falsifying athlete stats or box scores is strictly prohibited.
              </Text>

              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                4. SCOUTING & RECRUITMENT ETHICS
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                Recruitment inquiries and scouting proposals sent through the discovery network must respect student-athlete amateur status, school transfer protocols, and youth protection guidelines.
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.primaryCtaBtn} onPress={() => setShowTermsModal(false)} activeOpacity={0.85}>
              <Text style={styles.primaryCtaBtnText}>I UNDERSTAND</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* PRIVACY PROTOCOL MODAL */}
      <Modal visible={showPrivacyModal} transparent animationType="slide" onRequestClose={() => setShowPrivacyModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPrivacyModal(false)}>
          <TouchableOpacity style={[styles.modalContentCard, { maxHeight: "80%" }]} activeOpacity={1} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>PRIVACY PROTOCOL</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 10 }}>
              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                1. ATHLETE PERFORMANCE DATA PROTECTION
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                Atleta complies with the Philippine Data Privacy Act of 2012 (RA 10173). Performance metrics, biometrics (height, weight, wingspan), and workload analytics (ACWR, fatigue scores) are processed securely for sports analytics and development.
              </Text>

              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                2. CONTACT INFORMATION & IDENTITY CONFIDENTIALITY
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                Student-athlete personal contact numbers, email addresses, and PSA documents are protected. Contact details are accessible only to verified coaches through authorized scouting workflows.
              </Text>

              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                3. ENCRYPTED CLOUD SYNCHRONIZATION
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                All synchronized data transmissions use HTTPS/TLS encryption. Offline-cached records are securely stored and synced to Firestore when internet connectivity is re-established.
              </Text>

              <Text style={{ color: "#00C8FF", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
                4. USER CONTROL & PREFERENCES
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
                Coaches can configure their notification preferences and data sync settings directly in this menu. Account deletion and data export requests can be initiated at any time.
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.primaryCtaBtn} onPress={() => setShowPrivacyModal(false)} activeOpacity={0.85}>
              <Text style={styles.primaryCtaBtnText}>CLOSE</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* LOGOUT CONFIRMATION MODAL */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ width: "100%", maxWidth: 360, backgroundColor: "#0F172A", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center" }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(239,68,68,0.15)", justifyContent: "center", alignItems: "center", marginBottom: 16 }}>
              <Ionicons name="log-out-outline" size={32} color="#EF4444" />
            </View>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" }}>Log Out Account?</Text>
            <Text style={{ color: "#94A3B8", fontSize: 13, lineHeight: 18, textAlign: "center", marginBottom: 24 }}>
              Are you sure you want to log out of your Coach session? You will need to log back in to access your teams.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "#1E293B", paddingVertical: 14, borderRadius: 10, alignItems: "center" }}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.8}
              >
                <Text style={{ color: "#94A3B8", fontWeight: "700", fontSize: 13 }}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "#EF4444", paddingVertical: 14, borderRadius: 10, alignItems: "center" }}
                onPress={() => {
                  setShowLogoutModal(false);
                  if (onLogout) onLogout();
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>YES, LOG OUT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CHANGE PASSWORD MODAL */}
      <Modal visible={showChangePasswordModal} transparent animationType="slide" onRequestClose={() => setShowChangePasswordModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowChangePasswordModal(false)}>
          <TouchableOpacity style={styles.modalContentCard} activeOpacity={1} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CHANGE PASSWORD</Text>
              <TouchableOpacity onPress={() => setShowChangePasswordModal(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <PasswordInputField
              label="CURRENT PASSWORD *"
              value={currentPassword}
              placeholder="Current Password"
              onChangeText={setCurrentPassword}
              isSecure={showCurrentSec}
              onToggleSecure={() => setShowCurrentSec(!showCurrentSec)}
            />

            <PasswordInputField
              label="NEW PASSWORD *"
              value={newPassword}
              placeholder="New Password"
              onChangeText={setNewPassword}
              isSecure={showNewSec}
              onToggleSecure={() => setShowNewSec(!showNewSec)}
            />

            <PasswordInputField
              label="CONFIRM PASSWORD *"
              value={confirmPassword}
              placeholder="Confirm Password"
              onChangeText={setConfirmPassword}
              isSecure={showConfirmSec}
              onToggleSecure={() => setShowConfirmSec(!showConfirmSec)}
            />

            {Boolean(passwordError) && <Text style={styles.errorText}>{passwordError}</Text>}

            <TouchableOpacity style={styles.primaryCtaBtn} onPress={handleSavePassword} activeOpacity={0.8}>
              <Text style={styles.primaryCtaBtnText}>UPDATE PASSWORD</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* PASSWORD CHANGED SUCCESS MODAL */}
      <Modal visible={showPasswordSuccessModal} transparent animationType="fade" onRequestClose={() => setShowPasswordSuccessModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPasswordSuccessModal(false)}>
          <View style={styles.modalContentCard}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle-sharp" size={44} color="#00C8FF" />
            </View>
            <Text style={styles.successTitle}>PASSWORD UPDATED !</Text>
            <Text style={styles.successMessage}>
              Your coach account password has been successfully updated. Please use your new password next time you log in.
            </Text>
            <TouchableOpacity style={styles.primaryCtaBtn} onPress={() => setShowPasswordSuccessModal(false)} activeOpacity={0.85}>
              <Text style={styles.primaryCtaBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default CoachSettings;
