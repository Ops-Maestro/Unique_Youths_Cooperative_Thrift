import { Capacitor } from "@capacitor/core";
import {
  AccessControl,
  NativeBiometric
} from "@capgo/capacitor-native-biometric";

/*
 * Stable credential namespace used by the native biometric store.
 *
 * IMPORTANT:
 * This is an application identifier, not the backend URL. It must remain
 * stable across environments and app builds so credentials can be found
 * again on the same device.
 */
export const BIOMETRIC_SERVER =
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
          server:
            BIOMETRIC_SERVER
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
   * The successful biometric prompt belongs to setCredentials().
   * Once this call resolves, the credential has been accepted by the native
   * plugin. The caller should persist its own local UI state and validate the
   * credential later through the real biometric login path.
   */
  await NativeBiometric.setCredentials({
    username,
    password,
    server:
      BIOMETRIC_SERVER,
    accessControl:
      AccessControl.BIOMETRY_CURRENT_SET, // stronger security – requires the currently enrolled biometrics
    authValidityDuration: 60, // 60 seconds validity after biometric verification
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
      server:
        BIOMETRIC_SERVER
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
   * The plugin performs the native BiometricPrompt verification before
   * releasing the encrypted credentials.
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