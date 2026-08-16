import { Capacitor } from "@capacitor/core";
import {
  AccessControl,
  NativeBiometric
} from "@capgo/capacitor-native-biometric";

const BIOMETRIC_SERVER =
  import.meta.env.VITE_API_URL ||
  "unique-youth-cooperative-thrift";

export function isNativeMobileApp() {
  return Capacitor.isNativePlatform();
}

export async function checkNativeBiometricAvailability() {
  if (!isNativeMobileApp()) {
    return {
      available: false,
      strongBiometryAvailable: false
    };
  }

  try {
    const result =
      await NativeBiometric.isAvailable();

    return {
      available:
        !!result.isAvailable,

      strongBiometryAvailable:
        !!result.strongBiometryIsAvailable
    };
  } catch {
    return {
      available: false,
      strongBiometryAvailable: false
    };
  }
}

export async function hasNativeBiometricCredentials() {
  if (!isNativeMobileApp()) {
    return false;
  }

  try {
    const result =
      await NativeBiometric.isCredentialsSaved(
        {
          server: BIOMETRIC_SERVER
        }
      );

    return !!result.isSaved;
  } catch {
    return false;
  }
}

export async function saveNativeBiometricCredentials(
  username: string,
  password: string
) {
  if (!isNativeMobileApp()) {
    throw new Error(
      "Native biometric authentication is only available in the mobile app."
    );
  }

  const availability =
    await checkNativeBiometricAvailability();

  if (!availability.available) {
    throw new Error(
      "Fingerprint or another supported biometric method is not available on this device."
    );
  }

  if (
    !availability.strongBiometryAvailable
  ) {
    throw new Error(
      "A strong biometric method such as fingerprint is not currently available for this device."
    );
  }

  /*
   * Store the member credentials inside Android Keystore-protected
   * storage. The credentials cannot be retrieved without biometric
   * authentication.
   *
   * BIOMETRY_ANY means the credentials remain valid when the user
   * adds another fingerprint later.
   *
   * authValidityDuration: 0 means every secure read requires a
   * fresh biometric authentication.
   */
  await NativeBiometric.setCredentials({
    username,
    password,
    server: BIOMETRIC_SERVER,
    accessControl:
      AccessControl.BIOMETRY_ANY,
    authValidityDuration: 0,
    title:
      "Enable fingerprint login",
    negativeButtonText:
      "Cancel"
  });
}

export async function disableNativeBiometricCredentials() {
  if (!isNativeMobileApp()) {
    return;
  }

  await NativeBiometric.deleteCredentials(
    {
      server: BIOMETRIC_SERVER
    }
  );
}

export async function loginWithNativeBiometric() {
  if (!isNativeMobileApp()) {
    throw new Error(
      "Native biometric authentication is only available in the mobile app."
    );
  }

  const availability =
    await checkNativeBiometricAvailability();

  if (!availability.available) {
    throw new Error(
      "Fingerprint authentication is not available on this device."
    );
  }

  if (
    !availability.strongBiometryAvailable
  ) {
    throw new Error(
      "A strong biometric method such as fingerprint is not available on this device."
    );
  }

  /*
   * The plugin performs the native BiometricPrompt verification
   * before decrypting the credentials.
   *
   * No Google Password Manager / WebAuthn passkey selection is
   * involved here.
   */
  const credentials =
    await NativeBiometric.getSecureCredentials(
      {
        server:
          BIOMETRIC_SERVER,

        title:
          "Fingerprint login"
      }
    );

  if (
    !credentials?.username ||
    !credentials?.password
  ) {
    throw new Error(
      "No biometric login credentials were found for this device."
    );
  }

  return {
    username:
      credentials.username,

    password:
      credentials.password
  };
}