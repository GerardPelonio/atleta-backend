import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextInputProps
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  authScreenStyles,
  bannerStyles,
  buttonStyles,
  calendarStyles,
  checkboxStyles,
  fieldStyles,
  overlayStyles,
  pillStyles,
  stepStyles,
  titleStyles,
} from "./styles/authShared";
import * as SecureStore from "expo-secure-store";
import { type DocumentPickerAsset } from "expo-document-picker";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import { z } from "zod";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as AuthSession from "expo-auth-session";

WebBrowser.maybeCompleteAuthSession();

declare const process: any;

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

const isExpoExecution = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === "expo";
const expoHostUri = Constants.expoConfig?.hostUri || (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost || (Constants as any)?.manifest?.debuggerHost || "";
const isTunnel = expoHostUri.includes("exp.direct") || expoHostUri.includes("ngrok") || !expoHostUri;
const hostIp = (expoHostUri ? expoHostUri.split(":")[0] : "").trim() || "192.168.1.34";

export const CLOUD_PROD_API = "https://atleta-backend.vercel.app/api/v1";
export const API_BASE = CLOUD_PROD_API;

export async function getActiveApiBase(): Promise<string> {
  return CLOUD_PROD_API;
}

export const AUTH_TOKEN_KEY = (
  runtime.process?.env?.EXPO_PUBLIC_AUTH_TOKEN_KEY ||
  "atleta_auth_token"
).trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "atleta_auth_token";

export const AUTH_ROLE_KEY = (
  runtime.process?.env?.EXPO_PUBLIC_AUTH_ROLE_KEY ||
  "atleta_auth_role"
).trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "atleta_auth_role";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25000;

export function parseJwtPayload(token?: string): Record<string, any> | null {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    let jsonStr = "";
    if (typeof (globalThis as any).atob === "function") {
      jsonStr = (globalThis as any).atob(base64);
    } else {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      let str = base64.replace(/=+$/, "");
      let output = "";
      for (let bc = 0, bs = 0, buffer: any, idx = 0; (buffer = str.charAt(idx++)); ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4) ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0) {
        buffer = chars.indexOf(buffer);
      }
      jsonStr = output;
    }
    return JSON.parse(decodeURIComponent(escape(jsonStr)));
  } catch (_) {
    try {
      const parts = token!.split(".");
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const raw = (globalThis as any).atob ? (globalThis as any).atob(b64) : "";
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

// Types
export type BannerTone = "error" | "success" | "info";
export type AuthRole = "athlete" | "coach";
export type AuthStep = 1 | 2 | 3;
export type StoredUpload = Pick<DocumentPickerAsset, "name" | "uri" | "mimeType" | "size">;

// Data Validation
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .regex(
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
    "Enter a valid email address."
  );

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .regex(/[A-Z]/, "Password must include at least 1 uppercase letter.")
  .regex(/[^a-zA-Z0-9]/, "Password must include at least 1 special symbol (e.g. !@#$%^&*).");

export const contactSchema = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    let cleaned = val.replace(/[\s\-_()]/g, "");
    if (cleaned.startsWith("+63")) cleaned = "0" + cleaned.slice(3);
    else if (cleaned.startsWith("63") && cleaned.length === 12) cleaned = "0" + cleaned.slice(2);
    return cleaned;
  },
  z
    .string()
    .trim()
    .min(1, "Contact number is required.")
    .regex(/^09\d{9}$/, "Contact number must be 11 digits starting with 09 (e.g. 09123456789).")
);

export const athleteSignupSchema = z.object({
  role: z.literal("athlete"),
  first_name: z.string().trim().min(1, "First name is required.").max(255, "First name is too long."),
  last_name: z.string().trim().min(1, "Last name is required.").max(255, "Last name is too long."),
  email: emailSchema,
  password: passwordSchema,
  contact_number: contactSchema,
  birthdate: z.string().trim().min(1, "Birthdate is required.").refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Birthdate must use the YYYY-MM-DD format."
  }),
  gender: z.enum(["Male", "Female"], {
    errorMap: () => ({ message: "Select a gender." })
  }),
  province: z.string().trim().min(1, "Province is required.").max(255, "Province is too long."),
  sport_type: z.string().trim().min(1, "Select a sport type.").max(100, "Sport name is too long."),
  terms_accepted: z.boolean().refine((val) => val === true, {
    message: "You must agree to the Terms of Service and Privacy Protocol."
  })
});

export const coachSignupSchema = z.object({
  role: z.literal("coach"),
  first_name: z.string().trim().min(1, "First name is required.").max(255, "First name is too long."),
  last_name: z.string().trim().min(1, "Last name is required.").max(255, "Last name is too long."),
  email: emailSchema,
  password: passwordSchema,
  contact_number: contactSchema,
  certification_license_num: z.string().trim().max(100, "License number is too long.").optional().or(z.literal("")),
  years_of_experience: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? 0 : Number(val)),
    z.number().int().min(0, "Years of experience must be at least 0.").max(60, "Years of experience cannot exceed 60.")
  ),
  current_institution: z.string().trim().min(1, "Current institution is required.").max(255, "Current institution is too long."),
  regional_affiliation: z.string().trim().max(255, "Regional affiliation is too long.").optional().or(z.literal("")),
  national_sports_league: z.string().trim().max(255, "League name is too long.").optional().or(z.literal("")),
  eligible_documents: z
    .object({
      name: z.string().optional(),
      uri: z.string(),
      mimeType: z.string().optional().nullable(),
      size: z.number().optional().nullable()
    })
    .nullable()
    .optional(),
  terms_accepted: z.boolean().refine((val) => val === true, {
    message: "You must agree to the Terms of Service and Privacy Protocol."
  })
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email or username is required."),
  password: z.string().min(1, "Password is required.")
});

export const resetSchema = z.object({
  email: emailSchema
});

export type AthleteSignupValues = z.infer<typeof athleteSignupSchema>;
export type CoachSignupValues = z.infer<typeof coachSignupSchema>;
export type LoginValues = z.infer<typeof loginSchema>;
export type ResetValues = z.infer<typeof resetSchema>;

// Error Handling
const AUTH_ERROR_MAP: Record<number, string> = {
  400: "Validation failed. Check if your details are correct and try again.",
  401: "Unauthorized. Please verify your email and password.",
  409: "An account already exists for that email address."
};

export function sanitizeUserErrorMessage(message: string): string {
  if (!message) return "An unexpected error occurred. Please try again.";

  if (
    message.includes("initializeApp") ||
    message.includes("Google OAuth2") ||
    message.includes("default credentials") ||
    message.includes("FIREBASE_SERVICE_ACCOUNT") ||
    message.includes("EXPO_PUBLIC")
  ) {
    return "Authentication service is temporarily unavailable. Please try again later.";
  }
  if (message === "Internal server error." || message === "Internal server error") {
    return "Something went wrong on our server. Please try again later.";
  }
  return message;
}

export function authErrorMessage(status: number | undefined, fallback: string) {
  return (status && AUTH_ERROR_MAP[status]) || fallback;
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message && error.message !== "Something went wrong.") {
    return sanitizeUserErrorMessage(error.message);
  }
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : undefined;
  return authErrorMessage(status, fallback);
}

// This lets users to stay logged in when reopenning the app
export async function storeAuthToken(token: string) {
  clearAuthMicroCache();
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

// This keeps the role of the user when reopening the app
export async function storeAuthRole(role: AuthRole) {
  clearAuthMicroCache();
  await SecureStore.setItemAsync(AUTH_ROLE_KEY, role);
}

export async function getStoredAuthRole(): Promise<AuthRole | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const role = await Promise.race([
      SecureStore.getItemAsync(AUTH_ROLE_KEY).catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 1500);
      }),
    ]);
    return role === "coach" || role === "athlete" ? role : null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function extractAuthToken(payload: Record<string, unknown>) {
  const token = payload.token ?? payload.access_token ?? payload.jwt;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function extractAuthRole(payload: Record<string, unknown>, emailFallback?: string): AuthRole {
  const rawRole = (payload.role ?? (payload.user as { role?: string } | undefined)?.role) as string | undefined;
  if (typeof rawRole === "string") {
    const lower = rawRole.toLowerCase();
    if (lower === "coach") return "coach";
    if (lower === "athlete") return "athlete";
  }
  return emailFallback?.toLowerCase().includes("coach") ? "coach" : "athlete";
}

async function withRequestTimeout<T>(request: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await request(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request Timeout, Try Again Later.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchApi(path: string, options: RequestInit) {
  const url = `${CLOUD_PROD_API}${path}`;

  const headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(options.headers || {}),
  };

  const response = await withRequestTimeout((signal) =>
    fetch(url, { ...options, headers, signal })
  );

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    let serverMessage: string | undefined = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : undefined;
    if (typeof payload.details === "string" && payload.details.trim().length > 0 && !payload.details.includes("node:internal") && !payload.details.includes("    at ")) {
      serverMessage = payload.details;
    }
    if (!serverMessage && Array.isArray(payload.errors) && payload.errors.length > 0) {
      serverMessage = (payload.errors[0] as { message?: string }).message;
    }
    const error = new Error(serverMessage ?? "Something went wrong.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return payload;
}


export async function getStoredAuthToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(AUTH_TOKEN_KEY).catch(() => null);
}

const inFlightGetRequests = new Map<string, Promise<any>>();
const getResponseMicroCache = new Map<string, { data: any; timestamp: number }>();
const MICRO_CACHE_TTL_MS = 1500; // 1.5s snappy microcache to eliminate redundant duplicate queries across screens

export function clearAuthMicroCache() {
  getResponseMicroCache.clear();
  inFlightGetRequests.clear();
}

// Handles authenticated JSON requests with Authorization Bearer header
export async function requestAuthenticatedJson(
  path: string,
  method: string = "GET",
  body?: unknown,
  forceRefresh: boolean = false
) {
  const isGet = method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD";

  if (forceRefresh) {
    getResponseMicroCache.delete(path);
  }

  if (isGet && !forceRefresh) {
    const cached = getResponseMicroCache.get(path);
    if (cached && Date.now() - cached.timestamp < MICRO_CACHE_TTL_MS) {
      return cached.data;
    }
    const inFlight = inFlightGetRequests.get(path);
    if (inFlight) {
      return inFlight;
    }
  }

  const exec = (async () => {
    try {
      const token = await getStoredAuthToken();
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      if (!isGet) {
        headers["Idempotency-Key"] = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      const data = await fetchApi(path, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });

      if (isGet && data) {
        getResponseMicroCache.set(path, { data, timestamp: Date.now() });
      } else if (!isGet) {
        // Automatically invalidate client cache on any state mutations
        getResponseMicroCache.clear();
      }

      return data;
    } finally {
      if (isGet) {
        inFlightGetRequests.delete(path);
      }
    }
  })();

  if (isGet) {
    inFlightGetRequests.set(path, exec);
  }

  return exec;
}

export function requestJson(path: string, body: unknown, method: string = "POST") {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD") {
    headers["Idempotency-Key"] = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  return fetchApi(path, {
    method,
    headers,
    body: JSON.stringify(body)
  });
}

// Handles file upload requests
export async function requestMultipart(path: string, body: FormData) {
  const token = await getStoredAuthToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  return fetchApi(path, {
    method: "POST",
    headers,
    body
  });
}

// UI Components
export function Banner({ tone, message }: { tone: BannerTone; message?: string | null }) {
  if (!message) return null;
  return (
    <View style={[bannerStyles.banner, bannerStyles[tone]]}>
      <Text style={bannerStyles.text}>{message}</Text>
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  helperText?: string;
  error?: string;
  rightAccessory?: ReactNode;
};

export function Field({ label, helperText, error, rightAccessory, secureTextEntry, style, ...props }: FieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isPasswordField = Boolean(secureTextEntry);
  const effectiveSecure = isPasswordField ? !isPasswordVisible : false;

  const renderedAccessory = rightAccessory ? (
    <Pressable accessibilityRole="button" onPress={() => inputRef.current?.focus()} style={fieldStyles.rightAccessory}>
      {rightAccessory}
    </Pressable>
  ) : isPasswordField ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
      onPress={() => setIsPasswordVisible((prev) => !prev)}
      style={fieldStyles.rightAccessory}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name={isPasswordVisible ? "eye-off-outline" : "eye-outline"} size={22} color="#6b7280" />
    </Pressable>
  ) : null;

  return (
    <View style={fieldStyles.group}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.inputWrap, error ? fieldStyles.inputError : undefined]}>
        <TextInput
          ref={inputRef}
          placeholderTextColor="#9aa2b8"
          secureTextEntry={effectiveSecure}
          style={[fieldStyles.input, renderedAccessory ? fieldStyles.inputWithAccessory : undefined, style]}
          {...props}
        />
        {renderedAccessory}
      </View>
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : helperText ? <Text style={fieldStyles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

type FormFieldProps<T extends FieldValues> = Omit<FieldProps, "value" | "onChangeText" | "onBlur"> & {
  control: Control<T>;
  name: Path<T>;
};

export function FormField<T extends FieldValues>({ control, name, ...props }: FormFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Field
      {...props}
      value={field.value === null || field.value === undefined ? "" : String(field.value)}
      onBlur={field.onBlur}
      onChangeText={field.onChange}
      error={fieldState.error?.message}
    />
  );
}

export function MinimalistCalendarIcon({ size = 22, color = "#141c3a" }: { size?: number; color?: string }) {
  const width = size;
  const height = Math.round(size * 1.05);
  const ringHeight = Math.round(size * 0.22);
  const ringWidth = 2.2;
  const borderWidth = 1.8;
  const borderRadius = 4;
  const dotSize = Math.max(2.5, Math.round(size * 0.13));

  return (
    <View style={{ width, height, justifyContent: "flex-end", alignItems: "center" }}>
      <View style={[calendarStyles.ringRow, { left: width * 0.12, right: width * 0.12 }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: ringWidth, height: ringHeight, backgroundColor: color, borderRadius: ringWidth / 2 }} />
        ))}
      </View>

      <View style={{ width, height: height * 0.88, borderWidth, borderColor: color, borderRadius, overflow: "hidden" }}>
        <View style={{ height: Math.round(height * 0.2), borderBottomWidth: borderWidth, borderBottomColor: color, width: "100%" }} />
        <View style={calendarStyles.dotGrid}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={calendarStyles.dotRow}>
              {[0, 1, 2].map((col) => (
                <View key={col} style={{ width: dotSize, height: dotSize, backgroundColor: color, borderRadius: 0.5 }} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  icon?: ImageSourcePropType;
};

export function Button({ label, onPress, loading = false, variant = "primary", icon }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        buttonStyles.base,
        buttonStyles[variant],
        pressed && !loading && buttonStyles.pressed,
        loading && buttonStyles.disabled
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? "#16203f" : "#fff"} />
      ) : (
        <View style={buttonStyles.contentRow}>
          {icon ? <Image source={icon} style={buttonStyles.icon} /> : null}
          <Text style={[buttonStyles.text, variant === "secondary" && buttonStyles.secondaryText, variant === "ghost" && buttonStyles.ghostText]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function RolePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[pillStyles.pill, selected && pillStyles.selected]}>
      <Text style={[pillStyles.text, selected && pillStyles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={titleStyles.wrap}>
      <Text style={titleStyles.title}>{title}</Text>
      {subtitle ? <Text style={titleStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function StepBadge({ step, label, active }: { step: number; label: string; active: boolean }) {
  return (
    <View style={[stepStyles.badge, active && stepStyles.badgeActive]}>
      <Text style={[stepStyles.step, active && stepStyles.stepActive]}>{step}</Text>
      <Text style={[stepStyles.label, active && stepStyles.labelActive]}>{label}</Text>
    </View>
  );
}

function GlowingProgressBar() {
  const sweepAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sweepAnim]);

  const translateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={{ width: 140, height: 4, backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: 2, overflow: "hidden", marginTop: 22 }}>
      <Animated.View
        style={{
          width: 60,
          height: "100%",
          backgroundColor: "#00C8FF",
          borderRadius: 2,
          shadowColor: "#00C8FF",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 8,
          elevation: 6,
          transform: [{ translateX }],
        }}
      />
    </View>
  );
}

const atletaLogoSource = require("../../../assets/atleta_logo.png");

export function FullScreenOverlay({ label }: { label?: string }) {
  return (
    <View style={[overlayStyles.overlay, { backgroundColor: "#070D19", justifyContent: "center", alignItems: "center" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 16 }}>
        <Image
          source={atletaLogoSource}
          style={{ width: 48, height: 48 }}
          resizeMode="contain"
        />
        <Text style={{ color: "#FFFFFF", fontSize: 30, fontWeight: "900", letterSpacing: 5, textAlign: "center" }}>
          ATLETA
        </Text>
      </View>
      {label ? (
        <Text style={[overlayStyles.text, { color: "#38BDF8", marginTop: 8, fontSize: 12, fontWeight: "600", textAlign: "center", paddingHorizontal: 32, letterSpacing: 1.2, textTransform: "uppercase" }]}>
          {label}
        </Text>
      ) : null}
      <GlowingProgressBar />
    </View>
  );
}

type CheckboxProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  error?: string;
};

export function Checkbox({ value, onValueChange, label, error }: CheckboxProps) {
  return (
    <View style={checkboxStyles.wrap}>
      <Pressable
        onPress={() => onValueChange(!value)}
        style={({ pressed }) => [
          checkboxStyles.container,
          pressed && checkboxStyles.pressed
        ]}
      >
        <View style={[checkboxStyles.box, value && checkboxStyles.boxChecked, error ? checkboxStyles.boxError : undefined]}>
          {value ? <Text style={checkboxStyles.checkmark}>✓</Text> : null}
        </View>
        <Text style={checkboxStyles.label}>{label}</Text>
      </Pressable>
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function AuthHeader() {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 24, marginTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <Image
          source={atletaLogoSource}
          style={{ width: 40, height: 40, marginRight: 10 }}
          resizeMode="contain"
        />
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 26,
            fontWeight: "900",
            letterSpacing: 3,
            includeFontPadding: false,
          }}
        >
          ATLETA
        </Text>
      </View>
    </View>
  );
}

export interface GoogleAuthResult {
  type: "success" | "cancel" | "error";
  idToken?: string;
  accessToken?: string;
  error?: string;
}

export function extractTokensFromUrl(rawUrl: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawUrl) return result;

  const hashIndex = rawUrl.indexOf("#");
  const queryIndex = rawUrl.indexOf("?");

  const queryString =
    queryIndex !== -1
      ? hashIndex !== -1 && hashIndex > queryIndex
        ? rawUrl.substring(queryIndex + 1, hashIndex)
        : rawUrl.substring(queryIndex + 1)
      : "";

  const hashString = hashIndex !== -1 ? rawUrl.substring(hashIndex + 1) : "";

  if (queryString) {
    new URLSearchParams(queryString).forEach((val, key) => {
      result[key] = val;
    });
  }
  if (hashString) {
    new URLSearchParams(hashString).forEach((val, key) => {
      result[key] = val;
    });
  }

  return result;
}

export async function promptGoogleOAuthAsync(): Promise<GoogleAuthResult> {
  const isExpoGo =
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  const googleClientId = (
    runtime.process?.env?.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    (Platform.OS === "android" ? runtime.process?.env?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID : undefined) ||
    (Platform.OS === "ios" ? runtime.process?.env?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID : undefined) ||
    ""
  ).trim();
  const fallbackGoogleClientId = "203586668533-uii0i4gjqcm2cmj4ssvrdq70a2efhmnf.apps.googleusercontent.com";
  const webClientId = googleClientId || fallbackGoogleClientId;

  const rawScheme = Constants.expoConfig?.scheme;
  const appScheme = typeof rawScheme === "string"
    ? rawScheme
    : (Array.isArray(rawScheme) && rawScheme.length > 0 ? rawScheme[0] : "com.anonymous.atleta");

  const expoOwner =
    Constants.expoConfig?.owner ||
    (Constants as any).manifest2?.extra?.expoClient?.owner ||
    (Constants as any).manifest?.owner ||
    "gerardpelonio303511";
  const expoSlug = Constants.expoConfig?.slug || "atleta";
  const defaultProxyRedirectUri = `https://auth.expo.io/@${expoOwner}/${expoSlug}`;
  const customRedirectUri = (runtime.process?.env?.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ?? "").trim();
  const proxyRedirectUri = customRedirectUri || defaultProxyRedirectUri;

  const state = Math.random().toString(36).substring(2, 15);
  const nonce = Math.random().toString(36).substring(2, 15);

  if (isExpoGo) {
    const returnUrl = Linking.createURL("expo-auth-session");

    const googleAuthParams = new URLSearchParams({
      client_id: webClientId,
      redirect_uri: proxyRedirectUri,
      response_type: "id_token token",
      scope: "openid profile email",
      state,
      nonce,
      prompt: "select_account"
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleAuthParams.toString()}`;

    const proxyStartUrl = `${proxyRedirectUri}/start?${new URLSearchParams({
      authUrl: googleAuthUrl,
      returnUrl
    }).toString()}`;

    try {
      const browserResult = await WebBrowser.openAuthSessionAsync(proxyStartUrl, returnUrl);

      if (browserResult.type === "success" && browserResult.url) {
        const parsed = extractTokensFromUrl(browserResult.url);
        const token = parsed.id_token || parsed.access_token || parsed.token;
        if (token) {
          return {
            type: "success",
            idToken: parsed.id_token,
            accessToken: parsed.access_token || token
          };
        }
        if (parsed.error) {
          return {
            type: "error",
            error: parsed.error_description || parsed.error
          };
        }
        return {
          type: "error",
          error: "No authentication token returned from Google."
        };
      }

      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        return { type: "cancel" };
      }

      return {
        type: "error",
        error: "Google sign-in was not completed."
      };
    } catch (err: any) {
      return {
        type: "error",
        error: err?.message || "Google sign-in encountered an unexpected error."
      };
    }
  } else {
    const standaloneRedirectUri = customRedirectUri || "https://atleta-v1.firebaseapp.com/__/auth/handler";

    const googleAuthParams = new URLSearchParams({
      client_id: webClientId,
      redirect_uri: standaloneRedirectUri,
      response_type: "id_token token",
      scope: "openid profile email",
      state,
      nonce,
      prompt: "select_account"
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleAuthParams.toString()}`;

    try {
      const browserResult = await WebBrowser.openAuthSessionAsync(googleAuthUrl, standaloneRedirectUri);

      if (browserResult.type === "success" && browserResult.url) {
        const parsed = extractTokensFromUrl(browserResult.url);
        const token = parsed.id_token || parsed.access_token || parsed.token;
        if (token) {
          return {
            type: "success",
            idToken: parsed.id_token,
            accessToken: parsed.access_token || token
          };
        }
        return {
          type: "error",
          error: parsed.error_description || parsed.error || "No authentication token returned from Google."
        };
      }

      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        return { type: "cancel" };
      }

      return {
        type: "error",
        error: "Google sign-in was not completed."
      };
    } catch (err: any) {
      return {
        type: "error",
        error: err?.message || "Google sign-in encountered an unexpected error."
      };
    }
  }
}

export type FacebookAuthResult = GoogleAuthResult;

export async function promptFacebookOAuthAsync(): Promise<FacebookAuthResult> {
  const isExpoGo =
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  const rawScheme = Constants.expoConfig?.scheme;
  const appScheme = typeof rawScheme === "string"
    ? rawScheme
    : (Array.isArray(rawScheme) && rawScheme.length > 0 ? rawScheme[0] : "com.anonymous.atleta");

  const facebookAppId = (
    runtime.process?.env?.EXPO_PUBLIC_FACEBOOK_APP_ID ||
    runtime.process?.env?.FACEBOOK_APP_ID ||
    (Constants.expoConfig as any)?.facebookAppId ||
    (Constants.expoConfig as any)?.extra?.facebookAppId ||
    (Constants as any).manifest2?.extra?.expoClient?.facebookAppId ||
    (Constants as any).manifest?.facebookAppId ||
    "1478346524097898"
  ).trim();

  const expoOwner =
    Constants.expoConfig?.owner ||
    (Constants as any).manifest2?.extra?.expoClient?.owner ||
    (Constants as any).manifest?.owner ||
    "gerardpelonio303511";
  const expoSlug = Constants.expoConfig?.slug || "atleta";
  const defaultProxyRedirectUri = `https://auth.expo.io/@${expoOwner}/${expoSlug}`;
  const customRedirectUri = (
    runtime.process?.env?.EXPO_PUBLIC_FACEBOOK_REDIRECT_URI ||
    runtime.process?.env?.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ||
    ""
  ).trim();
  const proxyRedirectUri = customRedirectUri || defaultProxyRedirectUri;

  const state = Math.random().toString(36).substring(2, 15);

  if (isExpoGo) {
    const returnUrl = Linking.createURL("expo-auth-session");

    const fbAuthParams = new URLSearchParams({
      client_id: facebookAppId,
      redirect_uri: proxyRedirectUri,
      response_type: "token",
      scope: "public_profile,email",
      state
    });

    const fbAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?${fbAuthParams.toString()}`;

    const proxyStartUrl = `${proxyRedirectUri}/start?${new URLSearchParams({
      authUrl: fbAuthUrl,
      returnUrl
    }).toString()}`;

    try {
      const browserResult = await WebBrowser.openAuthSessionAsync(proxyStartUrl, returnUrl);

      if (browserResult.type === "success" && browserResult.url) {
        const parsed = extractTokensFromUrl(browserResult.url);
        const token = parsed.access_token || parsed.token || parsed.id_token;
        if (token) {
          return {
            type: "success",
            accessToken: token,
            idToken: token
          };
        }
        if (parsed.error || parsed.error_message || parsed.error_description) {
          return {
            type: "error",
            error: parsed.error_description || parsed.error_message || parsed.error
          };
        }
        return {
          type: "error",
          error: "No authentication token returned from Facebook."
        };
      }

      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        return { type: "cancel" };
      }

      return {
        type: "error",
        error: "Facebook sign-in was not completed."
      };
    } catch (err: any) {
      return {
        type: "error",
        error: err?.message || "Facebook sign-in encountered an unexpected error."
      };
    }
  } else {
    const schemeRedirectUri = AuthSession.makeRedirectUri({ scheme: appScheme });

    const fbAuthParams = new URLSearchParams({
      client_id: facebookAppId,
      redirect_uri: schemeRedirectUri,
      response_type: "token",
      scope: "public_profile,email",
      state
    });

    const fbAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?${fbAuthParams.toString()}`;

    try {
      const browserResult = await WebBrowser.openAuthSessionAsync(fbAuthUrl, schemeRedirectUri);

      if (browserResult.type === "success" && browserResult.url) {
        const parsed = extractTokensFromUrl(browserResult.url);
        const token = parsed.access_token || parsed.token || parsed.id_token;
        if (token) {
          return {
            type: "success",
            accessToken: token,
            idToken: token
          };
        }
        return {
          type: "error",
          error: parsed.error_description || parsed.error_message || parsed.error || "No authentication token returned from Facebook."
        };
      }

      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        return { type: "cancel" };
      }

      return {
        type: "error",
        error: "Facebook sign-in was not completed."
      };
    } catch (err: any) {
      return {
        type: "error",
        error: err?.message || "Facebook sign-in encountered an unexpected error."
      };
    }
  }
}

export {
  authScreenStyles,
  bannerStyles,
  buttonStyles,
  calendarStyles,
  checkboxStyles,
  fieldStyles,
  overlayStyles,
  pillStyles,
  stepStyles,
  titleStyles,
};


