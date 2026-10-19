import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import styles from "./styles/SignupScreen";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DocumentPicker from "expo-document-picker";
import { InAppGoogleAuthModal } from "./InAppGoogleAuthModal";
let NativeGoogleSignin: any = null;
try {
  NativeGoogleSignin = require("@react-native-google-signin/google-signin")?.GoogleSignin;
} catch (e) {
  // Native module not linked in current binary
}
import {
  AuthHeader,
  authScreenStyles,
  AUTH_TOKEN_KEY,
  AUTH_ROLE_KEY,
  Banner,
  Button,
  Checkbox,
  clearAuthMicroCache,
  FormField,
  FullScreenOverlay,
  getAuthErrorMessage,
  MinimalistCalendarIcon,
  promptFacebookOAuthAsync,
  promptGoogleOAuthAsync,
  RolePill,
  SectionTitle,
  StepBadge,
  athleteSignupSchema,
  coachSignupSchema,
  MAX_DOCUMENT_BYTES,
  extractAuthRole,
  extractAuthToken,
  requestJson,
  requestMultipart,
  storeAuthRole,
  storeAuthToken,
  type AthleteSignupValues,
  type AuthRole,
  type AuthStep,
  type BannerTone,
  type CoachSignupValues,
  type StoredUpload
} from "./authShared";

import { clearFirebaseClientCaches, getSportsOfflineFirst, db } from "../../../services/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { DatePickerModal } from "../Athlete/Profile/AthleteProfileModals";

export type InitialSocialData = {
  socialToken: { provider: "google" | "facebook"; idToken: string };
  initialData?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
};

type SignupScreenProps = {
  onGoLogin: () => void;
  initialSocialData?: InitialSocialData | null;
  onAuthenticated?: (role: AuthRole) => void;
};

type ChoiceGroupProps = {
  label: string;
  placeholder?: string;
  options: readonly string[] | string[];
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

const DAYS_OF_WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const YEARS_LIST = Array.from({ length: 57 }, (_, i) => 1970 + i);

const genderOptions = ["Male", "Female"] as const;
const DEFAULT_SPORT_OPTIONS = ["Basketball", "Track and Field", "Swimming", "Volleyball"];

const DEFAULT_ATHLETE_VALUES: AthleteSignupValues = {
  role: "athlete",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  contact_number: "",
  birthdate: "",
  gender: "Male",
  province: "Camarines Sur",
  sport_type: "" as any,
  terms_accepted: false
};

const DEFAULT_COACH_VALUES: CoachSignupValues = {
  role: "coach",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  contact_number: "",
  certification_license_num: "",
  years_of_experience: 0,
  current_institution: "",
  regional_affiliation: "",
  national_sports_league: "",
  eligible_documents: null,
  terms_accepted: false
};

function ChoiceGroup({ label, placeholder = "Select an option", options, value, error, onChange }: ChoiceGroupProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <View style={styles.dropdownGroup}>
      <Text style={styles.dropdownLabel}>{label}</Text>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        style={({ pressed }) => [
          styles.dropdownTrigger,
          error ? styles.dropdownError : undefined,
          open ? styles.dropdownTriggerOpen : undefined,
          pressed && styles.dropdownTriggerPressed
        ]}
      >
        <Text style={[styles.dropdownValueText, !value && styles.dropdownPlaceholderText]}>
          {value || placeholder}
        </Text>
        <View style={[styles.chevronWrap, open && styles.chevronOpen]}>
          <Text style={styles.dropdownChevron}>▼</Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.dropdownMenu}>
          {options.map((option, index) => {
            const selected = option === value;
            const isLast = index === options.length - 1;

            return (
              <Pressable
                key={option}
                onPress={() => handleSelect(option)}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  !isLast && styles.dropdownOptionBorder,
                  selected && styles.dropdownOptionSelected,
                  pressed && styles.dropdownOptionPressed
                ]}
              >
                <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextSelected]}>
                  {option}
                </Text>
                {selected ? <Text style={styles.dropdownCheckmark}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {error ? <Text style={authScreenStyles.error}>{error}</Text> : null}
    </View>
  );
}

export function SignupScreen({ onGoLogin, initialSocialData, onAuthenticated }: SignupScreenProps) {
  const [role, setRole] = useState<AuthRole>("athlete");
  const [step, setStep] = useState<AuthStep>(1);
  const [feedback, setFeedback] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [documentFile, setDocumentFile] = useState<StoredUpload | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);

  const [socialToken, setSocialToken] = useState<{ provider: "google" | "facebook"; idToken: string } | null>(null);
  const [coachSport, setCoachSport] = useState<string>("");
  const [sportOptions, setSportOptions] = useState<string[]>(DEFAULT_SPORT_OPTIONS);
  const socialProfileRef = useRef<{ first_name: string; last_name: string; email: string }>({
    first_name: "",
    last_name: "",
    email: "",
  });
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (initialSocialData?.socialToken) {
      setSocialToken(initialSocialData.socialToken);
      const fn = initialSocialData.initialData?.first_name || "";
      const ln = initialSocialData.initialData?.last_name || "";
      const em = initialSocialData.initialData?.email || "";
      socialProfileRef.current = { first_name: fn, last_name: ln, email: em };

      athleteForm.setValue("first_name", fn);
      athleteForm.setValue("last_name", ln);
      athleteForm.setValue("email", em);

      coachForm.setValue("first_name", fn);
      coachForm.setValue("last_name", ln);
      coachForm.setValue("email", em);

      setStep(1);
      const providerLabel = initialSocialData.socialToken.provider === "google" ? "Google" : "Facebook";
      setFeedback({
        tone: "info",
        message: `${providerLabel} connected! Select your role (Athlete or Coach) to continue.`
      });
    }
  }, [initialSocialData]);

  useEffect(() => {
    let isMounted = true;
    const fetchActiveSports = async () => {
      try {
        let sports: any[] = [];
        try {
          let snap = await getDocs(collection(db, "Sports_Configurations"));
          if (snap.empty) {
            snap = await getDocs(collection(db, "sports_configurations"));
          }
          if (!snap.empty) {
            sports = snap.docs
              .map((d) => ({ sport_id: d.id, ...d.data() }))
              .filter((s: any) => s.is_active !== false && s.active !== false);
          }
        } catch (_) {}

        if (sports.length === 0) {
          sports = await getSportsOfflineFirst(true);
        }

        if (!isMounted || !Array.isArray(sports) || sports.length === 0) return;
        const seen = new Set<string>();
        const mapped: string[] = [];
        sports.forEach((s: any) => {
          const raw = String(s.sport_name || s.name || s.id || '').trim();
          if (!raw) return;
          const upper = raw.toUpperCase().replace(/&/g, 'AND').replace(/\s+/g, ' ');
          if (seen.has(upper)) return;
          seen.add(upper);
          const label =
            upper === 'TRACK AND FIELD'
              ? 'Track and Field'
              : raw.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          mapped.push(label);
        });
        if (mapped.length > 0) {
          setSportOptions(mapped);
        }
      } catch (err: any) {
        console.warn('Could not fetch dynamic sports for signup:', err);
      }
    };
    fetchActiveSports();
    return () => {
      isMounted = false;
    };
  }, []);

  // Calendar Birthdate Picker modal state
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [socialModal, setSocialModal] = useState<{ visible: boolean; provider: 'google' | 'facebook' }>({ visible: false, provider: 'google' });
  const [pickerYear, setPickerYear] = useState(2004);
  const [pickerMonth, setPickerMonth] = useState(9);
  const [calendarMode, setCalendarMode] = useState<"DAYS" | "MONTHS" | "YEARS">("DAYS");

  const openCalendar = () => {
    const rawBirthdate = athleteForm.getValues("birthdate") || "";
    const parts = rawBirthdate.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && y >= 1950 && y <= 2030) setPickerYear(y);
      if (!isNaN(m) && m >= 0 && m <= 11) setPickerMonth(m);
    }
    setCalendarMode("DAYS");
    setShowDatePickerModal(true);
  };

  const handlePrevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear((y) => y - 1);
    } else {
      setPickerMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear((y) => y + 1);
    } else {
      setPickerMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (dayNum: number) => {
    const yyyy = pickerYear;
    const mm = String(pickerMonth + 1).padStart(2, "0");
    const dd = String(dayNum).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}`;
    athleteForm.setValue("birthdate", formatted, { shouldDirty: true, shouldValidate: true });
    setShowDatePickerModal(false);
  };

  const googleClientId = (runtimeProcessEnv("EXPO_PUBLIC_GOOGLE_CLIENT_ID") ?? "").trim();

  useEffect(() => {
    if (googleClientId && NativeGoogleSignin) {
      try {
        NativeGoogleSignin.configure({
          webClientId: googleClientId,
          offlineAccess: true
        });
      } catch (e) {
        // Native configuration catch
      }
    }
  }, [googleClientId]);

  const handleGoogleSignUpPress = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      if (Platform.OS !== "web" && NativeGoogleSignin && typeof NativeGoogleSignin.hasPlayServices === "function") {
        await NativeGoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const signInResult = await NativeGoogleSignin.signIn();
        const idToken = (signInResult as any)?.data?.idToken || (signInResult as any)?.idToken;
        const userObj = (signInResult as any)?.data?.user || (signInResult as any)?.user;

        if (idToken) {
          const fn = userObj?.givenName || userObj?.name?.split(' ')[0] || "";
          const ln = userObj?.familyName || userObj?.name?.split(' ').slice(1).join(' ') || "";
          const em = userObj?.email || "";
          if (fn || ln || em) {
            socialProfileRef.current = {
              first_name: fn || socialProfileRef.current.first_name,
              last_name: ln || socialProfileRef.current.last_name,
              email: em || socialProfileRef.current.email,
            };
            if (fn) {
              athleteForm.setValue("first_name", fn);
              coachForm.setValue("first_name", fn);
            }
            if (ln) {
              athleteForm.setValue("last_name", ln);
              coachForm.setValue("last_name", ln);
            }
            if (em) {
              athleteForm.setValue("email", em);
              coachForm.setValue("email", em);
            }
          }
          setSocialToken({ provider: "google", idToken });
          setFeedback({ tone: "info", message: `Google account connected! Please confirm your credentials below to complete your ${role.toUpperCase()} account.` });
          setStep(2);
          setLoading(false);
          return;
        }
      }
    } catch (nativeError: any) {
      if (nativeError?.code === "SIGN_IN_CANCELLED" || nativeError?.code === "12501") {
        setLoading(false);
        return;
      }
    }

    // Fall back smoothly to in-app Google Auth modal without leaving the app
    setLoading(false);
    setSocialModal({ visible: true, provider: "google" });
  };

  const handleFacebookSignUpPress = () => {
    setLoading(false);
    setFeedback(null);
    setSocialModal({ visible: true, provider: "facebook" });
  };

  const athleteForm = useForm<AthleteSignupValues>({
    resolver: zodResolver(athleteSignupSchema),
    defaultValues: DEFAULT_ATHLETE_VALUES
  });

  const coachForm = useForm<CoachSignupValues>({
    resolver: zodResolver(coachSignupSchema),
    defaultValues: DEFAULT_COACH_VALUES
  });

  const activeForm = role === "athlete" ? athleteForm : coachForm;
  const sharedErrors = activeForm.formState.errors as Partial<Record<string, { message?: string }>>;
  const athleteErrors = athleteForm.formState.errors as Partial<Record<string, { message?: string }>>;
  const coachErrors = coachForm.formState.errors as Partial<Record<string, { message?: string }>>;

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setFeedback(null);
    setDocumentFile(null);
    const sp = socialProfileRef.current;
    const currentFirst = athleteForm.getValues("first_name") || coachForm.getValues("first_name") || sp.first_name || "";
    const currentLast = athleteForm.getValues("last_name") || coachForm.getValues("last_name") || sp.last_name || "";
    const currentEmail = athleteForm.getValues("email") || coachForm.getValues("email") || sp.email || "";
    const currentContact = athleteForm.getValues("contact_number") || coachForm.getValues("contact_number") || "";

    athleteForm.reset({
      ...DEFAULT_ATHLETE_VALUES,
      first_name: currentFirst,
      last_name: currentLast,
      email: currentEmail,
      contact_number: currentContact,
    });
    coachForm.reset({
      ...DEFAULT_COACH_VALUES,
      first_name: currentFirst,
      last_name: currentLast,
      email: currentEmail,
      contact_number: currentContact,
    });
  }, [athleteForm, coachForm, role]);

  const goNext = async () => {
    const fields = socialToken
      ? (["first_name", "last_name", "email"] as const)
      : (["first_name", "last_name", "email", "password", "contact_number"] as const);
    const valid = await activeForm.trigger(fields as any);
    if (valid) {
      setFeedback(null);
      const currentValues = activeForm.getValues();
      socialProfileRef.current = {
        first_name: currentValues.first_name || socialProfileRef.current.first_name,
        last_name: currentValues.last_name || socialProfileRef.current.last_name,
        email: currentValues.email || socialProfileRef.current.email,
      };
      setStep(3);
    } else {
      const errs = activeForm.formState.errors as any;
      const firstKey = fields.find((f) => errs[f]);
      const msg = firstKey && errs[firstKey]?.message ? errs[firstKey].message : "Please fill in the required details before proceeding.";
      setFeedback({ tone: "error", message: msg });
    }
  };

  const uploadDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: false
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (typeof asset.size === "number" && asset.size > MAX_DOCUMENT_BYTES) {
      setFeedback({ tone: "error", message: "Document must be smaller than 25MB." });
      return;
    }

    const isPdf = asset.name?.toLowerCase().endsWith(".pdf") || asset.mimeType?.includes("pdf");
    const nextDocument: StoredUpload = {
      name: asset.name ?? (isPdf ? "document.pdf" : "eligible-document.png"),
      uri: asset.uri,
      mimeType: asset.mimeType ?? (isPdf ? "application/pdf" : "image/jpeg"),
      size: asset.size ?? undefined
    };

    setDocumentFile(nextDocument);
    coachForm.setValue("eligible_documents", nextDocument, { shouldValidate: true });
    setFeedback({ tone: "success", message: `${nextDocument.name} attached.` });
  };

  const onInvalid = (errors: any) => {
    setLoading(false);
    console.warn("Signup form validation errors:", errors);
    const errorKeys = Object.keys(errors);
    if (errorKeys.length === 0) return;

    const step2Fields = ["first_name", "last_name", "email", "password", "contact_number"];
    const hasStep2Error = errorKeys.some((k) => step2Fields.includes(k));

    const firstKey = errorKeys[0];
    const firstMsg = errors[firstKey]?.message || `Please check ${firstKey.replace(/_/g, " ")}.`;
    setFeedback({
      tone: "error",
      message: firstMsg,
    });

    if (hasStep2Error) {
      setStep(2);
    }
  };

  const submitAthlete = athleteForm.handleSubmit(async (values) => {
    setLoading(true);
    setFeedback(null);

    try {
      if (socialToken) {
        const endpoint = socialToken.provider === "google" ? "/users/google-login" : "/users/facebook-login";
        const { role: _r, ...restValues } = values;
        const result = await requestJson(endpoint, {
          id_token: socialToken.idToken,
          idToken: socialToken.idToken,
          token: socialToken.idToken,
          credential: socialToken.idToken,
          provider: socialToken.provider,
          role: "Athlete",
          is_registration: true,
          ...restValues
        });
        // Prevent automatic login after successful sign-up; clear local session and redirect to Login
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => null);
        await SecureStore.deleteItemAsync(AUTH_ROLE_KEY).catch(() => null);
        clearAuthMicroCache();
        clearFirebaseClientCaches();
        await AsyncStorage.multiRemove([
          "atleta_coach_dashboard_cache_v2",
          "atleta_offline_coach_profile_cache",
          "atleta_offline_athlete_profile_cache",
          "atleta_offline_teams_cache",
          "atleta_offline_matches_cache",
          "atleta_offline_athletes_cache",
          "atleta_offline_sports_cache",
          "atleta_coach_settings",
          "atleta_cached_user",
        ]).catch(() => null);

        athleteForm.reset();
        setSocialToken(null);

        Alert.alert(
          "Account Created",
          "Your athlete account has been successfully created. Please sign in with your credentials to continue.",
          [{ text: "OK", onPress: () => onGoLogin && onGoLogin() }]
        );
        if (onGoLogin) {
          onGoLogin();
        } else {
          setAccountCreated(true);
        }
        return;
      } else {
        await requestJson("/users/register", { ...values, role: "Athlete" });

        // Prevent automatic login after successful sign-up; clear local session and redirect to Login
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => null);
        await SecureStore.deleteItemAsync(AUTH_ROLE_KEY).catch(() => null);
        clearAuthMicroCache();
        clearFirebaseClientCaches();
        await AsyncStorage.multiRemove([
          "atleta_coach_dashboard_cache_v2",
          "atleta_offline_coach_profile_cache",
          "atleta_offline_athlete_profile_cache",
          "atleta_offline_teams_cache",
          "atleta_offline_matches_cache",
          "atleta_offline_athletes_cache",
          "atleta_offline_sports_cache",
          "atleta_coach_settings",
          "atleta_cached_user",
        ]).catch(() => null);

        athleteForm.reset();
        setSocialToken(null);

        Alert.alert(
          "Account Created",
          "Your athlete account has been successfully created. Please sign in with your credentials to continue.",
          [{ text: "OK", onPress: () => onGoLogin && onGoLogin() }]
        );
        if (onGoLogin) {
          onGoLogin();
        } else {
          setAccountCreated(true);
        }
        return;
      }
    } catch (error) {
      setFeedback({ tone: "error", message: getAuthErrorMessage(error, "Unable to create the account right now.") });
    } finally {
      setLoading(false);
    }
  }, onInvalid);

  const submitCoach = coachForm.handleSubmit(async (values) => {
    setLoading(true);
    setFeedback(null);

    try {
      if (!coachSport) {
        setFeedback({ tone: "error", message: "Please select your sport type." });
        setLoading(false);
        return;
      }
      if (socialToken) {
        const endpoint = socialToken.provider === "google" ? "/users/google-login" : "/users/facebook-login";
        const { role: _r, ...restValues } = values;
        const result = await requestJson(endpoint, {
          id_token: socialToken.idToken,
          idToken: socialToken.idToken,
          token: socialToken.idToken,
          credential: socialToken.idToken,
          provider: socialToken.provider,
          role: "Coach",
          is_registration: true,
          sport_type: coachSport,
          ...restValues
        });
        const token = extractAuthToken(result);
        const savedRole = extractAuthRole(result) || "coach";
        if (token) await storeAuthToken(token);
        await storeAuthRole(savedRole);

        clearAuthMicroCache();
        clearFirebaseClientCaches();
        await AsyncStorage.multiRemove([
          "atleta_coach_dashboard_cache_v2",
          "atleta_offline_coach_profile_cache",
          "atleta_offline_athlete_profile_cache",
          "atleta_offline_teams_cache",
          "atleta_offline_matches_cache",
          "atleta_offline_athletes_cache",
          "atleta_offline_sports_cache",
          "atleta_coach_settings",
          "atleta_cached_user",
        ]).catch(() => null);

        coachForm.reset();
        setDocumentFile(null);
        setSocialToken(null);

        // Prevent coaches from being automatically logged in immediately after signing up; redirect them securely to Login
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => null);
        await SecureStore.deleteItemAsync(AUTH_ROLE_KEY).catch(() => null);
        clearAuthMicroCache();
        Alert.alert(
          "Account Created",
          "Your coach account has been successfully created. Please sign in with your credentials to continue.",
          [{ text: "OK", onPress: () => onGoLogin && onGoLogin() }]
        );
        if (onGoLogin) {
          onGoLogin();
        } else {
          setAccountCreated(true);
        }
        return;
      } else {
        const payload = {
          role: "Coach",
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          password: values.password,
          contact_number: values.contact_number || undefined,
          sport_type: coachSport,
          certification_license_num: values.certification_license_num || undefined,
          years_of_experience: Number(values.years_of_experience || 0),
          current_institution: values.current_institution,
          regional_affiliation: values.regional_affiliation,
          national_sports_league: values.national_sports_league || undefined,
          professional_documents: documentFile ? [documentFile.name || "coach_license.pdf"] : []
        };

        const result = await requestJson("/users/coach", payload);
        const token = extractAuthToken(result);
        const savedRole = extractAuthRole(result) || "coach";
        if (token) await storeAuthToken(token);
        await storeAuthRole(savedRole);

        clearAuthMicroCache();
        clearFirebaseClientCaches();
        await AsyncStorage.multiRemove([
          "atleta_coach_dashboard_cache_v2",
          "atleta_offline_coach_profile_cache",
          "atleta_offline_athlete_profile_cache",
          "atleta_offline_teams_cache",
          "atleta_offline_matches_cache",
          "atleta_offline_athletes_cache",
          "atleta_offline_sports_cache",
          "atleta_coach_settings",
          "atleta_cached_user",
        ]).catch(() => null);

        coachForm.reset();
        setDocumentFile(null);
        setSocialToken(null);

        // Prevent coaches from being automatically logged in immediately after signing up; redirect them securely to Login
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => null);
        await SecureStore.deleteItemAsync(AUTH_ROLE_KEY).catch(() => null);
        clearAuthMicroCache();
        Alert.alert(
          "Account Created",
          "Your coach account has been successfully created. Please sign in with your credentials to continue.",
          [{ text: "OK", onPress: () => onGoLogin && onGoLogin() }]
        );
        if (onGoLogin) {
          onGoLogin();
        } else {
          setAccountCreated(true);
        }
        return;
      }
    } catch (error) {
      setFeedback({ tone: "error", message: getAuthErrorMessage(error, "Unable to create the account right now.") });
    } finally {
      setLoading(false);
    }
  }, onInvalid);

  const handleSocialSubmit = async () => {
    if (!socialToken) return;

    let currentToken = socialToken.idToken;
    if (socialToken.provider === "google" && NativeGoogleSignin && typeof NativeGoogleSignin.getTokens === "function") {
      try {
        const tokens = await NativeGoogleSignin.getTokens();
        if (tokens?.idToken) {
          currentToken = tokens.idToken;
        }
      } catch (e) {
        // Fall back to stored socialToken.idToken
      }
    }

    if (role === "athlete") {
      const valid = await athleteForm.trigger(["birthdate", "gender", "province", "sport_type", "terms_accepted"]);
      if (!valid) {
        setFeedback({ tone: "error", message: "Please fill in all required profile details and accept the terms." });
        return;
      }
      const values = athleteForm.getValues();
      setLoading(true);
      setFeedback(null);
      try {
        const endpoint = socialToken.provider === "google" ? "/users/google-login" : "/users/facebook-login";
        const result = await requestJson(endpoint, {
          id_token: currentToken,
          idToken: currentToken,
          token: currentToken,
          credential: currentToken,
          provider: socialToken.provider,
          role: "Athlete",
          is_registration: true,
          first_name: values.first_name || socialProfileRef.current.first_name,
          last_name: values.last_name || socialProfileRef.current.last_name,
          email: values.email || socialProfileRef.current.email,
          contact_number: values.contact_number,
          birthdate: values.birthdate,
          gender: values.gender,
          province: values.province,
          sport_type: values.sport_type,
          terms_accepted: true,
        });
        const token = extractAuthToken(result);
        const savedRole = extractAuthRole(result) || "athlete";
        if (token) await storeAuthToken(token);
        await storeAuthRole(savedRole);

        clearAuthMicroCache();
        clearFirebaseClientCaches();
        await AsyncStorage.multiRemove([
          "atleta_coach_dashboard_cache_v2",
          "atleta_offline_coach_profile_cache",
          "atleta_offline_athlete_profile_cache",
          "atleta_offline_teams_cache",
          "atleta_offline_matches_cache",
          "atleta_offline_athletes_cache",
          "atleta_offline_sports_cache",
          "atleta_coach_settings",
          "atleta_cached_user",
        ]).catch(() => null);

        athleteForm.reset();
        setSocialToken(null);

        // Prevent automatic login after successful sign-up; clear local session and redirect to Login
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => null);
        await SecureStore.deleteItemAsync(AUTH_ROLE_KEY).catch(() => null);
        clearAuthMicroCache();
        Alert.alert(
          "Account Created",
          "Your athlete account has been successfully created. Please sign in with your credentials to continue.",
          [{ text: "OK", onPress: () => onGoLogin && onGoLogin() }]
        );
        if (onGoLogin) {
          onGoLogin();
        } else {
          setAccountCreated(true);
        }
      } catch (error) {
        setFeedback({ tone: "error", message: getAuthErrorMessage(error, "Unable to create account right now.") });
      } finally {
        setLoading(false);
      }
    } else {
      if (!coachSport) {
        setFeedback({ tone: "error", message: "Please select your sport type." });
        return;
      }
      const valid = await coachForm.trigger(["years_of_experience", "current_institution", "terms_accepted"]);
      if (!valid) {
        setFeedback({ tone: "error", message: "Please fill in all required profile details." });
        return;
      }
      const values = coachForm.getValues();
      setLoading(true);
      setFeedback(null);
      try {
        const endpoint = socialToken.provider === "google" ? "/users/google-login" : "/users/facebook-login";
        const result = await requestJson(endpoint, {
          id_token: currentToken,
          idToken: currentToken,
          token: currentToken,
          credential: currentToken,
          provider: socialToken.provider,
          role: "Coach",
          is_registration: true,
          first_name: values.first_name || socialProfileRef.current.first_name,
          last_name: values.last_name || socialProfileRef.current.last_name,
          email: values.email || socialProfileRef.current.email,
          contact_number: values.contact_number,
          sport_type: coachSport,
          certification_license_num: values.certification_license_num,
          years_of_experience: values.years_of_experience,
          current_institution: values.current_institution,
          regional_affiliation: values.regional_affiliation,
          national_sports_league: values.national_sports_league,
          terms_accepted: true,
        });
        const token = extractAuthToken(result);
        const savedRole = extractAuthRole(result) || "coach";
        if (token) await storeAuthToken(token);
        await storeAuthRole(savedRole);

        clearAuthMicroCache();
        clearFirebaseClientCaches();
        await AsyncStorage.multiRemove([
          "atleta_coach_dashboard_cache_v2",
          "atleta_offline_coach_profile_cache",
          "atleta_offline_athlete_profile_cache",
          "atleta_offline_teams_cache",
          "atleta_offline_matches_cache",
          "atleta_offline_athletes_cache",
          "atleta_offline_sports_cache",
          "atleta_coach_settings",
          "atleta_cached_user",
        ]).catch(() => null);

        coachForm.reset();
        setSocialToken(null);

        // Prevent coaches from being automatically logged in immediately after signing up; redirect them securely to Login
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => null);
        await SecureStore.deleteItemAsync(AUTH_ROLE_KEY).catch(() => null);
        clearAuthMicroCache();
        Alert.alert(
          "Account Created",
          "Your coach account has been successfully created. Please sign in with your credentials to continue.",
          [{ text: "OK", onPress: () => onGoLogin && onGoLogin() }]
        );
        if (onGoLogin) {
          onGoLogin();
        } else {
          setAccountCreated(true);
        }
        return;
      } catch (error) {
        setFeedback({ tone: "error", message: getAuthErrorMessage(error, "Unable to create account right now.") });
      } finally {
        setLoading(false);
      }
    }
  };

  const submit = socialToken
    ? handleSocialSubmit
    : (role === "athlete" ? submitAthlete : submitCoach);
  const selectedGender = athleteForm.watch("gender");
  const selectedSport = athleteForm.watch("sport_type");

  if (accountCreated) {
    return (
      <View style={styles.createdScreen}>
        <View style={styles.createdPanel}>
          <Text style={styles.createdTitle}>Account Created</Text>
          <Text style={styles.createdMessage}>Your account has been created successfully. You can now log in with your account details.</Text>
          <Button label="Back to Login" onPress={onGoLogin} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {loading ? <FullScreenOverlay label="Creating your account..." /> : null}
      <ScrollView contentContainerStyle={authScreenStyles.content} keyboardShouldPersistTaps="handled">
        <View style={authScreenStyles.shell}>
          <AuthHeader />

          <SectionTitle title="Create your account" subtitle="Pick your role, fill in your details, and continue with personalized access." />
          <Banner tone={feedback?.tone ?? "info"} message={feedback?.message ?? ""} />

          <View style={styles.stepRow}>
            <StepBadge step={1} label="Role" active={step === 1} />
            <StepBadge step={2} label="Account" active={step === 2} />
            <StepBadge step={3} label="Details" active={step === 3} />
          </View>

          {step === 1 ? (
            <View>
              <Text style={styles.sectionLabel}>Select your role</Text>
              <View style={styles.roleRow}>
                <RolePill label="Athlete" selected={role === "athlete"} onPress={() => setRole("athlete")} />
                <RolePill label="Coach" selected={role === "coach"} onPress={() => setRole("coach")} />
              </View>
              <Text style={styles.helper}>The fields below will update automatically for the role you choose.</Text>
              <Button label="Continue" onPress={() => setStep(2)} />

              {!socialToken ? (
                <>
                  <View style={authScreenStyles.dividerRow}>
                    <View style={authScreenStyles.divider} />
                    <Text style={authScreenStyles.or}>or</Text>
                    <View style={authScreenStyles.divider} />
                  </View>

                  <Button
                    label="Sign Up with Google"
                    variant="secondary"
                    icon={require("../../../assets/google.png")}
                    onPress={handleGoogleSignUpPress}
                  />
                  <View style={authScreenStyles.spacer} />
                  <Button
                    label="Sign Up with Facebook"
                    variant="secondary"
                    icon={require("../../../assets/facebook.png")}
                    onPress={handleFacebookSignUpPress}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {step === 2 ? (
            <View>
              <FormField control={activeForm.control as never} name={"first_name" as never} label="First Name" placeholder="G. Francis" error={sharedErrors.first_name?.message} />
              <FormField control={activeForm.control as never} name={"last_name" as never} label="Last Name" placeholder="Pelonio" error={sharedErrors.last_name?.message} />
              <FormField control={activeForm.control as never} name={"email" as never} label="Email Address" placeholder="coach@gmail.com" autoCapitalize="none" keyboardType="email-address" error={sharedErrors.email?.message} />
              {!socialToken ? (
                <FormField control={activeForm.control as never} name={"password" as never} label="Password" placeholder="At least 8 chars" secureTextEntry error={sharedErrors.password?.message} />
              ) : (
                <View style={{ backgroundColor: "#0F172A", borderColor: "#1E293B", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: "#38BDF8", fontSize: 13, fontWeight: "700" }}>
                    {socialToken.provider === "google" ? "Google" : "Facebook"} Account Connected
                  </Text>
                  <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>
                    Authentication is secured by your social provider. Please confirm your credentials above before continuing.
                  </Text>
                </View>
              )}
              <FormField control={activeForm.control as never} name={"contact_number" as never} label="Contact Number" placeholder="09XXXXXXXXX" keyboardType="phone-pad" error={sharedErrors.contact_number?.message} />

              <View style={styles.navRow}>
                <Button label="Back" variant="ghost" onPress={() => setStep(1)} />
                <View style={styles.navSpacer} />
                <Button label="Next" onPress={goNext} />
              </View>
            </View>
          ) : null}

          {step === 3 && role === "athlete" ? (
            <View>
              <Pressable onPress={openCalendar}>
                <View pointerEvents="none">
                  <FormField
                    control={athleteForm.control}
                    name="birthdate"
                    label="Birthdate"
                    placeholder="YYYY-MM-DD"
                    rightAccessory={<MinimalistCalendarIcon />}
                    error={athleteErrors.birthdate?.message}
                    editable={false}
                  />
                </View>
              </Pressable>
              <ChoiceGroup label="Gender" placeholder="Select Gender" options={genderOptions} value={selectedGender} error={athleteErrors.gender?.message} onChange={(value) => athleteForm.setValue("gender", value as AthleteSignupValues["gender"], { shouldDirty: true, shouldValidate: true })} />
              <FormField control={athleteForm.control} name="province" label="Province" placeholder="Camarines Sur" error={athleteErrors.province?.message} />
              <ChoiceGroup label="Sport Type" placeholder="Select Sport Type" options={sportOptions} value={selectedSport} error={athleteErrors.sport_type?.message} onChange={(value) => athleteForm.setValue("sport_type", value as AthleteSignupValues["sport_type"], { shouldDirty: true, shouldValidate: true })} />

              <Checkbox
                value={athleteForm.watch("terms_accepted")}
                onValueChange={(val) => athleteForm.setValue("terms_accepted", val, { shouldDirty: true, shouldValidate: true })}
                label="I Agree to the Terms of Service and Privacy Protocol for Performance Tracking"
                error={athleteErrors.terms_accepted?.message}
              />

              <View style={styles.navRow}>
                <Button label="Back" variant="ghost" onPress={() => setStep(2)} />
                <View style={styles.navSpacer} />
                <Button label="Sign Up" loading={loading} onPress={submit} />
              </View>
            </View>
          ) : null}

          {step === 3 && role === "coach" ? (
            <View>
              <ChoiceGroup
                label="Sport Coaching"
                placeholder="Select Sport Type"
                options={sportOptions}
                value={coachSport}
                onChange={setCoachSport}
              />
              <FormField control={coachForm.control} name="certification_license_num" label="Certification License Number" placeholder="Optional" error={coachErrors.certification_license_num?.message} />
              <FormField control={coachForm.control} name="years_of_experience" label="Years of Experience" placeholder="0 - 60" keyboardType="numeric" error={coachErrors.years_of_experience?.message} />
              <FormField control={coachForm.control} name="current_institution" label="Current Institution" placeholder="e.g. Ateneo de Naga University" error={coachErrors.current_institution?.message} />
              <FormField control={coachForm.control} name="regional_affiliation" label="Regional Affiliation (Optional)" placeholder="e.g. Bicol Regional Athletic Association (BRAA) (Optional)" error={coachErrors.regional_affiliation?.message} />
              <FormField control={coachForm.control} name="national_sports_league" label="National Sports League (Optional)" placeholder="e.g. Batang Pinoy / Palarong Pambansa (Optional)" error={coachErrors.national_sports_league?.message} />

              <View style={styles.documentBox}>
                <Text style={styles.documentLabel}>Credentials & Documents (Optional)</Text>
                <Button label={documentFile ? "Replace File" : "Choose File (Optional)"} variant="secondary" onPress={uploadDocument} />
                <Text style={styles.documentHint}>{documentFile ? documentFile.name : "Optional: Professional license, certification, image, or PDF. Max 25MB."}</Text>
                {coachErrors.eligible_documents?.message ? <Text style={authScreenStyles.error}>{coachErrors.eligible_documents.message}</Text> : null}
              </View>

              <Checkbox
                value={coachForm.watch("terms_accepted")}
                onValueChange={(val) => coachForm.setValue("terms_accepted", val, { shouldDirty: true, shouldValidate: true })}
                label="I Agree to the Terms of Service and Privacy Protocol for Performance Tracking"
                error={coachErrors.terms_accepted?.message}
              />

              <View style={styles.navRow}>
                <Button label="Back" variant="ghost" onPress={() => setStep(2)} />
                <View style={styles.navSpacer} />
                <Button label="Sign Up" loading={loading} onPress={submit} />
              </View>
            </View>
          ) : null}


          <Text style={authScreenStyles.footer}>
            Already have an account? <Text style={authScreenStyles.footerLink} onPress={onGoLogin}>Log In</Text>
          </Text>
        </View>
      </ScrollView>

      <DatePickerModal
        visible={showDatePickerModal}
        onClose={() => setShowDatePickerModal(false)}
        pickerYear={pickerYear}
        pickerMonth={pickerMonth}
        calendarMode={calendarMode}
        setCalendarMode={setCalendarMode}
        setPickerMonth={setPickerMonth}
        setPickerYear={setPickerYear}
        birthdate={athleteForm.watch("birthdate") || ""}
        onSelectDay={handleSelectDay}
        monthNames={MONTH_NAMES}
        daysOfWeek={DAYS_OF_WEEK}
        yearsList={YEARS_LIST}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      <InAppGoogleAuthModal
        visible={socialModal.visible}
        provider={socialModal.provider}
        onClose={() => setSocialModal((prev) => ({ ...prev, visible: false }))}
        onSuccess={(tokens) => {
          const token = tokens.idToken || tokens.accessToken;
          if (token) {
            try {
              if (token.includes('.')) {
                const parts = token.split('.');
                if (parts.length === 3) {
                  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                  let decoded = '';
                  if (typeof (globalThis as any).atob === 'function') {
                    decoded = (globalThis as any).atob(b64);
                  } else if (typeof (globalThis as any).Buffer !== 'undefined') {
                    decoded = (globalThis as any).Buffer.from(b64, 'base64').toString('utf8');
                  }
                  if (decoded) {
                    const payload = JSON.parse(decodeURIComponent(escape(decoded)));
                    const fn = payload.given_name || payload.name?.split(' ')[0] || "";
                    const ln = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || "";
                    const em = payload.email || "";
                    if (fn || ln || em) {
                      socialProfileRef.current = {
                        first_name: fn || socialProfileRef.current.first_name,
                        last_name: ln || socialProfileRef.current.last_name,
                        email: em || socialProfileRef.current.email,
                      };
                      if (fn) {
                        athleteForm.setValue("first_name", fn);
                        coachForm.setValue("first_name", fn);
                      }
                      if (ln) {
                        athleteForm.setValue("last_name", ln);
                        coachForm.setValue("last_name", ln);
                      }
                      if (em) {
                        athleteForm.setValue("email", em);
                        coachForm.setValue("email", em);
                      }
                    }
                  }
                }
              }
            } catch (_) {
              // Token parsing error handled gracefully
            }
            setSocialToken({ provider: socialModal.provider, idToken: token });
            setFeedback({
              tone: "info",
              message: `${socialModal.provider === "facebook" ? "Facebook" : "Google"} account connected! Please confirm your credentials below to complete your ${role.toUpperCase()} account.`
            });
            setStep(2);
          }
        }}
        onError={(err) => {
          setFeedback({
            tone: "error",
            message: err || `${socialModal.provider === "facebook" ? "Facebook" : "Google"} sign-up failed.`
          });
        }}
      />
    </View>
  );
}

function runtimeProcessEnv(key: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  return runtime.process?.env?.[key];
}


