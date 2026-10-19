import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import styles from "./styles/LoginScreen";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AuthHeader,
  authScreenStyles,
  Banner,
  Button,
  FormField,
  getAuthErrorMessage,
  promptFacebookOAuthAsync,
  promptGoogleOAuthAsync,
  SectionTitle,
  extractAuthRole,
  extractAuthToken,
  loginSchema,
  requestJson,
  storeAuthRole,
  storeAuthToken,
  clearAuthMicroCache,
  API_BASE,
  type AuthRole,
  type BannerTone,
  type LoginValues
} from "./authShared";
import { db, clearFirebaseClientCaches } from "../../../services/firebaseClient";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { InAppGoogleAuthModal } from "./InAppGoogleAuthModal";
let NativeGoogleSignin: any = null;
try {
  NativeGoogleSignin = require("@react-native-google-signin/google-signin")?.GoogleSignin;
} catch (e) {
  // Native module not linked in current binary
}

function parseJwtPayload(token?: string) {
  try {
    if (!token || !token.includes(".")) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    let decoded = "";
    if (typeof (globalThis as any).atob === "function") {
      decoded = (globalThis as any).atob(b64);
    } else if (typeof (globalThis as any).Buffer !== "undefined") {
      decoded = (globalThis as any).Buffer.from(b64, "base64").toString("utf8");
    }
    if (decoded) {
      return JSON.parse(decodeURIComponent(escape(decoded)));
    }
  } catch (_) {}
  return null;
}

export type SocialSignupPayload = {
  socialToken: { provider: "google" | "facebook"; idToken: string };
  initialData?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
};

type LoginScreenProps = {
  onGoSignup: (socialData?: SocialSignupPayload) => void;
  onGoReset: () => void;
  onAuthenticated?: (role: AuthRole) => void;
};

export function LoginScreen({ onGoSignup, onGoReset, onAuthenticated }: LoginScreenProps) {
  const [feedback, setFeedback] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialModal, setSocialModal] = useState<{ visible: boolean; provider: 'google' | 'facebook' }>({ visible: false, provider: 'google' });

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  const googleClientId = (runtimeProcessEnv("EXPO_PUBLIC_GOOGLE_CLIENT_ID") ?? "").trim();

  useEffect(() => {
    if (googleClientId && NativeGoogleSignin) {
      try {
        NativeGoogleSignin.configure({
          webClientId: googleClientId,
          offlineAccess: true
        });
      } catch (e) {
        //
      }
    }
  }, [googleClientId]);

  const handleSocialAuthWithToken = async (
    provider: "google" | "facebook",
    idToken: string,
    fallbackUser?: { email?: string; givenName?: string; familyName?: string; photo?: string }
  ) => {
    setLoading(true);
    setFeedback(null);
    let extractedEmail = (fallbackUser?.email || "").trim().toLowerCase();
    let extractedFirstName = fallbackUser?.givenName || "";
    let extractedLastName = fallbackUser?.familyName || "";
    let extractedAvatar = fallbackUser?.photo || "";

    try {
      const jwtPayload = parseJwtPayload(idToken);
      if (jwtPayload?.email) extractedEmail = jwtPayload.email.trim().toLowerCase();
      if (jwtPayload?.given_name) extractedFirstName = jwtPayload.given_name;
      else if (jwtPayload?.name) extractedFirstName = jwtPayload.name.split(" ")[0];
      if (jwtPayload?.family_name) extractedLastName = jwtPayload.family_name;
      else if (jwtPayload?.name) extractedLastName = jwtPayload.name.split(" ").slice(1).join(" ");
      if (jwtPayload?.picture) extractedAvatar = jwtPayload.picture;

      const endpoint = provider === "google" ? "/users/google-login" : "/users/facebook-login";
      const socialAuthPayload = {
        id_token: idToken,
        idToken,
        token: idToken,
        credential: idToken,
        access_token: idToken,
        accessToken: idToken,
        provider,
        email: extractedEmail,
        first_name: extractedFirstName,
        last_name: extractedLastName,
        avatar_url: extractedAvatar,
      };

      let result: any = null;
      try {
        result = await requestJson(endpoint, socialAuthPayload);
      } catch (err: any) {
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("not found") || msg.includes("exist") || msg.includes("sign up") || msg.includes("signup")) {
          // Route immediately to sign up
          onGoSignup?.({
            socialToken: { provider, idToken },
            initialData: {
              email: extractedEmail,
              first_name: extractedFirstName,
              last_name: extractedLastName,
              avatar_url: extractedAvatar,
            }
          });
          return;
        }
      }

      const resData = result as any;
      if (resData?.user?.email && !extractedEmail) extractedEmail = String(resData.user.email).toLowerCase().trim();
      if (resData?.user?.first_name && !extractedFirstName) extractedFirstName = resData.user.first_name;
      if (resData?.user?.last_name && !extractedLastName) extractedLastName = resData.user.last_name;
      if (resData?.user?.avatar_url && !extractedAvatar) extractedAvatar = resData.user.avatar_url;

      // Branch B (Account Does Not Exist - New User):
      // If no matching document is found in Firestore, do not create a default account or route to the dashboard.
      // Temporarily hold the verified social credentials in staging state and redirect to Sign-Up / Onboarding Screen.
      if (
        resData?.account_exists === false ||
        resData?.require_signup ||
        resData?.is_new_user ||
        !resData?.token
      ) {
        onGoSignup?.({
          socialToken: { provider, idToken },
          initialData: {
            email: extractedEmail || resData?.user?.email || "",
            first_name: extractedFirstName || resData?.user?.first_name || "",
            last_name: extractedLastName || resData?.user?.last_name || "",
            avatar_url: extractedAvatar || resData?.user?.avatar_url || "",
          }
        });
        return;
      }

      // Branch A (Account Exists):
      // Fetch user's role from Firestore, securely store session tokens via Expo SecureStore, and route directly to dashboard.
      const token = extractAuthToken(result);
      const tokenPayload = token ? parseJwtPayload(token) : null;

      // Verify that the returned token belongs to the authenticated social account
      if (extractedEmail && tokenPayload?.email) {
        const payloadEmail = String(tokenPayload.email).trim().toLowerCase();
        if (payloadEmail !== extractedEmail) {
          throw new Error(`Account mismatch: signed in as ${extractedEmail} but retrieved session for ${payloadEmail}.`);
        }
      }

      const tokenRole = tokenPayload?.role ? String(tokenPayload.role).toLowerCase() : "";
      const role = (tokenRole === "coach" || tokenRole === "athlete" ? tokenRole : extractAuthRole(result, extractedEmail)) as AuthRole;

      clearAuthMicroCache();
      clearFirebaseClientCaches();
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const atletaKeys = allKeys.filter((k) => k.startsWith("atleta_") || k.startsWith("@atleta_"));
        if (atletaKeys.length > 0) {
          await AsyncStorage.multiRemove(atletaKeys);
        }
      } catch (_) {}

      if (token) await storeAuthToken(token);
      await storeAuthRole(role);

      onAuthenticated?.(role);
    } catch (error: any) {
      const msg = getAuthErrorMessage(error, `Unable to authenticate with ${provider}.`);
      if (
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("exist") ||
        msg.toLowerCase().includes("sign up") ||
        msg.toLowerCase().includes("signup") ||
        msg.toLowerCase().includes("register") ||
        error?.code === "USER_NOT_FOUND"
      ) {
        onGoSignup?.({
          socialToken: { provider, idToken },
          initialData: {
            email: extractedEmail,
            first_name: extractedFirstName,
            last_name: extractedLastName,
            avatar_url: extractedAvatar,
          }
        });
        return;
      }
      setFeedback({
        tone: "error",
        message: msg
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignInPress = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      if (Platform.OS !== "web" && NativeGoogleSignin) {
        // Explicitly sign out first so Google always displays the account chooser
        if (typeof NativeGoogleSignin.signOut === "function") {
          await NativeGoogleSignin.signOut().catch(() => null);
        }
        if (typeof NativeGoogleSignin.hasPlayServices === "function") {
          await NativeGoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          const signInResult = await NativeGoogleSignin.signIn();
          const idToken = (signInResult as any)?.data?.idToken || (signInResult as any)?.idToken;
          const userObj = (signInResult as any)?.data?.user || (signInResult as any)?.user;

          if (idToken) {
            await handleSocialAuthWithToken("google", idToken, userObj);
            return;
          }
        }
      }
    } catch (nativeError: any) {
      if (nativeError?.code === "SIGN_IN_CANCELLED" || nativeError?.code === "12501") {
        setLoading(false);
        return;
      }
    }

    // Fall back seamlessly to in-app Google Auth modal without leaving the app
    setLoading(false);
    setSocialModal({ visible: true, provider: "google" });
  };

  const handleFacebookSignInPress = () => {
    setLoading(false);
    setFeedback(null);
    setSocialModal({ visible: true, provider: "facebook" });
  };

  const submit = form.handleSubmit(
    async (values) => {
      setLoading(true);
      setFeedback(null);

      try {
        const payload = {
          email: values.email.trim().toLowerCase().replace(/%40/gi, "@"),
          password: values.password.trim()
        };
        const result = await requestJson("/users/login", payload);
        const token = extractAuthToken(result);
        const tokenPayload = token ? parseJwtPayload(token) : null;
        const tokenRole = tokenPayload?.role ? String(tokenPayload.role).toLowerCase() : "";
        const role = (tokenRole === "coach" || tokenRole === "athlete" ? tokenRole : extractAuthRole(result, payload.email)) as AuthRole;

        clearAuthMicroCache();
        clearFirebaseClientCaches();
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const atletaKeys = allKeys.filter((k) => k.startsWith("atleta_") || k.startsWith("@atleta_"));
          if (atletaKeys.length > 0) {
            await AsyncStorage.multiRemove(atletaKeys);
          }
        } catch (_) {}

        if (token) await storeAuthToken(token);
        await storeAuthRole(role);

        onAuthenticated?.(role);
        form.reset(values);
      } catch (error: any) {
        const displayMsg = getAuthErrorMessage(error, "Invalid email or password. Please check your credentials and try again.");
        setFeedback({
          tone: "error",
          message: displayMsg
        });
        Alert.alert("Authentication Failed", displayMsg);
      } finally {
        setLoading(false);
      }
    },
    (errors) => {
      const firstError = Object.values(errors)[0]?.message as string | undefined;
      const msg = firstError || "Please enter your email and password.";
      setFeedback({
        tone: "error",
        message: msg
      });
      Alert.alert("Authentication Failed", msg);
    }
  );

  return (
    <ScrollView contentContainerStyle={authScreenStyles.content} keyboardShouldPersistTaps="handled">
      <View style={authScreenStyles.shell}>
        <AuthHeader />
        <SectionTitle title="Log In" subtitle="Access your ATLETA dashboard using your credentials or social account." />
        <Banner tone={feedback?.tone ?? "info"} message={feedback?.message} />

        <FormField
          control={form.control}
          name="email"
          label="Email Address"
          placeholder="athlete@domain.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <FormField
          control={form.control}
          name="password"
          label="Password"
          placeholder="Enter your password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={{ marginTop: 6 }}>
          <Button label="Login" loading={loading} onPress={submit} />
        </View>

        <Text style={styles.link} onPress={onGoReset}>
          Forgot Password?
        </Text>

        <View style={[authScreenStyles.dividerRow, styles.dividerRow]}>
          <View style={authScreenStyles.divider} />
          <Text style={authScreenStyles.or}>or</Text>
          <View style={authScreenStyles.divider} />
        </View>

        <Button
          label="Login with Google"
          variant="secondary"
          icon={require("../../../assets/google.png")}
          onPress={handleGoogleSignInPress}
        />
        <View style={authScreenStyles.spacer} />
        <Button
          label="Login with Facebook"
          variant="secondary"
          icon={require("../../../assets/facebook.png")}
          onPress={handleFacebookSignInPress}
        />

        <Text style={authScreenStyles.footer}>
          Don&apos;t have an account? <Text style={authScreenStyles.footerLink} onPress={() => onGoSignup?.()}>Sign Up</Text>
        </Text>

        <InAppGoogleAuthModal
          visible={socialModal.visible}
          provider={socialModal.provider}
          onClose={() => setSocialModal((prev) => ({ ...prev, visible: false }))}
          onSuccess={(tokens) => {
            const token = tokens.idToken || tokens.accessToken;
            if (token) {
              handleSocialAuthWithToken(socialModal.provider, token);
            }
          }}
          onError={(err) => {
            setFeedback({
              tone: "error",
              message: err || `${socialModal.provider === "facebook" ? "Facebook" : "Google"} sign-in could not be completed.`
            });
          }}
        />
      </View>
    </ScrollView>
  );
}

function runtimeProcessEnv(key: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  return runtime.process?.env?.[key];
}


