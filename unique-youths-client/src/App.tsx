import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable
} from "@simplewebauthn/browser";

import {
  NativeBiometric,
  BiometryType
} from "@capgo/capacitor-native-biometric";

import { api } from "./lib/api";
import { LandingPage } from "./components/LandingPage";

// ============================================================
// BIOMETRIC HELPERS
// ============================================================
import {
  saveNativeBiometricCredentials,
  hasNativeBiometricCredentials,
  disableNativeBiometricCredentials,
  loginWithNativeBiometric,
  BIOMETRIC_SERVER
} from "./lib/nativeBiometric";

// ============================================================
// SCROLL DIRECTION HOOK
// ============================================================
function useScrollDirection() {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      if (current > lastScrollY.current && current > 50) {
        setIsVisible(false);
      } else if (current < lastScrollY.current) {
        setIsVisible(true);
      }
      lastScrollY.current = current;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return isVisible;
}

/* ============================================================
 * APP CONTENT
 * ============================================================ */

const slides = [
  {
    title: "Your ₦11,000 monthly plan",
    text: "₦10,000 goes into the shared savings pot and ₦1,000 supports the community party fund."
  },
  {
    title: "Pay by the 5th",
    text: "The absolute monthly payment deadline is the 5th of every month."
  },
  {
    title: "Late payment means a ₦4,000 fine",
    text: "Any contribution paid after the 5th automatically carries the immutable flat late-payment fine."
  },
  {
    title: "Join correctly",
    text: "All new community members must register via this webapp and complete the mandatory Rules verification and digital guarantor sign-off to join a circle."
  }
];

const rules = `1. Monthly contribution is ₦11,000: ₦10,000 goes into the shared savings pot + ₦1,000 goes into the party fund.
2. The absolute monthly payment deadline is the 5th.
3. A payment made after the 5th automatically attracts a flat ₦4,000 late-payment fine.
4. Members must provide truthful registration and bank information.
5. A nominated guarantor must complete the required sign-off process.
6. Members must review these rules completely before accepting them.
7. Payment happens off-platform: send your contribution to the admin and share proof in the community. An admin confirms it here once received.
8. Each month, the savings pot is formed from the ₦10,000 savings portion actually paid by members for that month. One or two eligible members may be selected at random, according to the circle's configured recipient count.
9. The gross payout per selected recipient is the month's actual savings pot divided by the number of selected recipients.
10. A separate maintenance fee is charged to each selected recipient. The fee scales with your circle size. For example: 4 members = ₦1,500 per winner, 6 members = ₦1,800, 8 members = ₦3,100, 10 members = ₦3,400, 12 members = ₦3,700, 14 members = ₦4,000, and 16–20 members = a fixed ₦5,000. The actual fee is calculated as ₦500 × ceil(circle size ÷ 2).
11. The recipient's net payout is the gross payout minus the maintenance fee. The ₦1,000 party-fund contribution remains separate from the savings pot and recipient payout.
12. Members must continue their monthly contribution obligations even after receiving a lump-sum payout.
13. Members must not attempt to manipulate recipient selection or circle records.
14. Community announcements and payment notices are official records of the circle.
15. After completing this form, an administrator manually verifies your nominated guarantor. You will be notified once you can log in and are placed in a circle.`;

const STEP_LABELS = [
  "Personal",
  "Bank",
  "Email OTP",
  "Guarantor",
  "Rules"
];

const PASSWORD_TIP =
  "Use at least 8 characters and mix uppercase, lowercase, numbers and a symbol (e.g. Bright#Sunrise92) so no one can easily guess it. Don't reuse a password from another account.";

const BLANK_FORM = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  primaryPhone: "",
  residentialAddress: "",
  bank: {
    bankName: "",
    accountNumber: "",
    accountName: ""
  },
  otpChannel: "email"
};

const HAS_REGISTERED_KEY =
  "uy_has_registered";

const THEME_KEY =
  "uy_theme";

const SUPPORT_PHONE =
  String(
    (import.meta as any).env?.VITE_SUPPORT_PHONE ||
      ""
  ).trim();

const SUPPORT_PHONE_TEL =
  SUPPORT_PHONE.replace(
    /[^+0-9]/g,
    ""
  );

const TOKEN_KEY =
  "memberToken";

const PASSKEY_ENABLED_KEY =
  "uy_passkey_enabled";

const NATIVE_BIOMETRIC_ENABLED_KEY =
  "uy_native_biometric_enabled";

const NATIVE_BIOMETRIC_SERVER =
  "unique-youth-cooperative-thrift";

type Theme =
  | "light"
  | "dark"
  | "system";

/* ============================================================
 * DEVICE / PLATFORM HELPERS
 * ============================================================ */

function getDeviceId() {
  let id =
    localStorage.getItem(
      "uy_device_id"
    );

  if (!id) {
    id = crypto.randomUUID();

    localStorage.setItem(
      "uy_device_id",
      id
    );
  }

  return id;
}

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isNativeAndroidApp() {
  try {
    return (
      isNativeApp() &&
      Capacitor.getPlatform() ===
        "android"
    );
  } catch {
    return false;
  }
}

function applyTheme(
  theme: Theme
) {
  const isDark =
    theme === "dark" ||
    (
      theme === "system" &&
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
    );

  document.documentElement.classList.toggle(
    "dark",
    isDark
  );
}

function useTheme() {
  const [
    theme,
    setTheme
  ] = useState<Theme>(
    (
      localStorage.getItem(
        THEME_KEY
      ) as Theme
    ) || "system"
  );

  useEffect(() => {
    applyTheme(theme);

    localStorage.setItem(
      THEME_KEY,
      theme
    );

    if (
      theme !== "system"
    ) {
      return;
    }

    const mq =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

    const handler = () =>
      applyTheme(
        "system"
      );

    mq.addEventListener(
      "change",
      handler
    );

    return () =>
      mq.removeEventListener(
        "change",
        handler
      );
  }, [theme]);

  return [
    theme,
    setTheme
  ] as const;
}

/* ============================================================
 * HEADER / GENERAL UI
 * ============================================================ */

function ThemeToggle({
  theme,
  setTheme
}: {
  theme: Theme;

  setTheme: (
    t: Theme
  ) => void;
}) {
  const options: {
    id: Theme;
    label: string;
  }[] = [
    {
      id: "light",
      label: "Light"
    },
    {
      id: "system",
      label: "Auto"
    },
    {
      id: "dark",
      label: "Dark"
    }
  ];

  return (
    <div className="inline-flex rounded-lg border border-white/30 overflow-hidden text-[11px] sm:text-xs shrink-0">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() =>
            setTheme(o.id)
          }
          className={`px-2 sm:px-2.5 py-1.5 font-semibold ${
            theme === o.id
              ? "bg-white text-blue-900"
              : "text-blue-100 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RefreshIcon({
  spinning
}: {
  spinning?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        spinning
          ? "animate-spin"
          : ""
      }
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      <span className="bg-white rounded-full p-1 shrink-0 flex items-center justify-center">
        <img
          src="/brand/logo-badge.png"
          alt="Unique Youth logo"
          className="w-8 h-8 sm:w-9 sm:h-9"
        />
      </span>

      <div className="min-w-0">
        <b className="block leading-tight truncate">
          Unique Youth
        </b>

        <span className="text-blue-200 text-[10px] sm:text-xs uppercase tracking-wide">
          Cooperative Thrift
        </span>
      </div>
    </div>
  );
}

function AvatarButton({
  user,
  onClick
}: {
  user: any;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open my profile"
      title="My profile"
      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-white/70 shadow-sm shrink-0 bg-blue-600 flex items-center justify-center text-sm font-black focus:outline-none focus:ring-2 focus:ring-white"
    >
      {user?.avatarDataUrl ? (
        <img
          src={
            user.avatarDataUrl
          }
          alt="Your profile"
          className="w-full h-full object-cover"
        />
      ) : (
        <span>
          {(
            user?.firstName ||
            "?"
          )[0]}
        </span>
      )}
    </button>
  );
}

function AppFooter() {
  return (
    <footer className="text-center text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-200 py-6 px-4">
      © {new Date().getFullYear()} Unique
      Youth Cooperative Thrift. All rights
      reserved.

      <span className="mx-1.5">
        ·
      </span>

      v1.4.0
    </footer>
  );
}

/* ============================================================
 * MOBILE APP PROMO
 * ============================================================ */

const APK_DOWNLOAD_URL =
  (import.meta as any)
    .env
    ?.VITE_APK_DOWNLOAD_URL ||
  "";

function isStandalone() {
  if (
    typeof window ===
    "undefined"
  ) {
    return false;
  }

  return (
    window.matchMedia?.(
      "(display-mode: standalone)"
    ).matches ||
    (window.navigator as any)
      .standalone === true ||
    !!(window as any)
      .Capacitor
  );
}

function GetTheApp() {
  const [
    open,
    setOpen
  ] =
    useState<
      "android" |
        "ios" |
        null
    >(null);

  const [
    dismissed,
    setDismissed
  ] =
    useState<boolean>(() => {
      try {
        return (
          localStorage.getItem(
            "uy_dismissed_get_the_app"
          ) === "1"
        );
      } catch {
        return false;
      }
    });

  if (
    isStandalone() ||
    dismissed
  ) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);

    localStorage.setItem(
      "uy_dismissed_get_the_app",
      "1"
    );
  };

  return (
    <div className="relative mt-5 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow border border-blue-100 dark:border-slate-700">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss mobile app message"
        title="Dismiss"
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none"
      >
        ×
      </button>

      <div className="flex items-center gap-3 pr-8">
        <img
          src="/brand/logo-badge.png"
          alt=""
          className="w-10 h-10 shrink-0"
        />

        <div>
          <h2 className="font-bold text-slate-900 dark:text-white">
            Get the mobile app
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Install Unique Youth on your
            phone's home screen for faster,
            app-like access.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() =>
            setOpen(
              o =>
                o ===
                "android"
                  ? null
                  : "android"
            )
          }
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            open ===
            "android"
              ? "bg-blue-800 text-white border-blue-800"
              : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
          }`}
        >
          Android
        </button>

        <button
          type="button"
          onClick={() =>
            setOpen(
              o =>
                o === "ios"
                  ? null
                  : "ios"
            )
          }
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            open === "ios"
              ? "bg-blue-800 text-white border-blue-800"
              : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
          }`}
        >
          iPhone
        </button>
      </div>

      {open ===
        "android" && (
        <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          {APK_DOWNLOAD_URL ? (
            <a
              href={
                APK_DOWNLOAD_URL
              }
              className="inline-block bg-red-600 text-white font-semibold px-5 py-3 rounded-lg"
            >
              Download APK
            </a>
          ) : (
            <p className="text-amber-600 dark:text-amber-400">
              The Android download isn't
              set up yet — add
              <code className="mx-1">
                VITE_APK_DOWNLOAD_URL
              </code>
              once the app is published.
            </p>
          )}

          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            After downloading, open the file
            and allow "Install from unknown
            sources" if prompted.
          </p>
        </div>
      )}

      {open === "ios" && (
        <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          <p>
            iPhone doesn't support installing
            apps outside the App Store this way,
            but Safari can add this site to your
            home screen.
          </p>

          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li>
              Open this page in{" "}
              <b>Safari</b>.
            </li>
            <li>
              Tap the{" "}
              <b>Share</b> icon.
            </li>
            <li>
              Tap{" "}
              <b>Add to Home Screen</b>.
            </li>
            <li>
              Tap <b>Add</b>.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * FINANCE TYPES
 * ============================================================ */

type PayoutSummary = {
  circleSize: number;
  paidMemberCount: number;
  recipientCount: number;
  savingsPot: number;
  partyFund: number;
  grossPayoutPerRecipient: number;
  maintenanceFeePerRecipient: number;
  totalMaintenanceFees: number;
  netPayoutPerRecipient: number;
  totalNetPayout: number;
};

type DrawState = {
  available: boolean;

  draw: {
    status:
      | "idle"
      | "rolling"
      | "completed";

    startedAt: string | null;

    completedAt: string | null;

    durationMs: number;

    recipientCount?: number;
  };

  selectedCount: number;

  payout?:
    | PayoutSummary
    | null;
};

const MEMBER_DRAW_POLL_MS =
  500;

const MEMBER_DRAW_RESULT_VISIBLE_MS =
  60000;

function formatNaira(
  value:
    | number
    | null
    | undefined
) {
  return `₦${Number(
    value || 0
  ).toLocaleString()}`;
}

/* ============================================================
 * AUTH ERROR HELPERS
 * ============================================================ */

function getWebAuthnErrorMessage(
  error: any,
  fallback: string
) {
  const name =
    error?.name;

  if (
    name ===
    "NotAllowedError"
  ) {
    return "Biometric/passkey authentication was cancelled or was not allowed on this device.";
  }

  if (
    name ===
    "InvalidStateError"
  ) {
    return "This biometric/passkey credential is already registered on this account.";
  }

  if (
    name ===
    "NotSupportedError"
  ) {
    return "This browser or device does not support the requested biometric/passkey authentication.";
  }

  if (
    name ===
    "SecurityError"
  ) {
    return "Biometric/passkey authentication requires a secure site. Use HTTPS in production or localhost during local development.";
  }

  if (
    name ===
      "UnknownError"
  ) {
    return "The device could not complete the biometric/passkey operation. Try again.";
  }

  if (
    typeof error?.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallback;
}

function getNativeBiometricErrorMessage(
  error: any,
  fallback: string
) {
  const message =
    String(
      error?.message ||
        error ||
        ""
    ).toLowerCase();

  if (
    message.includes("cancel")
  ) {
    return "Fingerprint authentication was cancelled.";
  }

  if (
    message.includes("lockout")
  ) {
    return "Fingerprint authentication is temporarily locked. Try again later.";
  }

  if (
    message.includes(
      "not enrolled"
    ) ||
    message.includes(
      "biometrics unavailable"
    )
  ) {
    return "No fingerprint is enrolled on this device. Add a fingerprint in Android Settings and try again.";
  }

  return (
    error?.message ||
    fallback
  );
}

/* ============================================================
 * FAQ / FEEDBACK / SUPPORT CONTENT
 * ============================================================ */

const FAQ_ITEMS = [
  {
    question:
      "How much do I contribute each month?",
    answer:
      "The monthly contribution is ₦11,000. ₦10,000 goes into the savings pot and ₦1,000 goes into the party fund."
  },
  {
    question:
      "When is the payment deadline?",
    answer:
      "The absolute monthly payment deadline is the 5th of every month."
  },
  {
    question:
      "What happens when I pay after the deadline?",
    answer:
      "A flat ₦4,000 late-payment fine is automatically applied."
  },
  {
    question:
      "How are payout recipients selected?",
    answer:
      "Eligible paid members are selected through the circle's random draw process."
  },
  {
    question:
      "Can I continue contributing after receiving a payout?",
    answer:
      "Yes. Receiving a lump-sum payout does not end your monthly contribution obligations."
  },
  {
    question:
      "How does fingerprint login work in the Android app?",
    answer:
      "The Android app uses the device's native fingerprint authentication. Your credentials are stored in secure Android credential storage and are released only after successful fingerprint verification."
  }
];

/* ============================================================
 * DRAW UI
 * ============================================================ */

function MemberRollingDice({
  drawState,
  drawRemaining
}: {
  drawState:
    | DrawState
    | null;

  drawRemaining: number;
}) {
  if (
    !drawState ||
    drawState.draw
      .status ===
      "idle"
  ) {
    return null;
  }

  const rolling =
    drawState.draw
      .status ===
    "rolling";

  const completed =
    drawState.draw
      .status ===
    "completed";

  const recipientCount =
    drawState.draw
      .recipientCount ||
    drawState.payout
      ?.recipientCount ||
    2;

  const payout =
    drawState.payout;

  return (
    <div className="mt-5 rounded-2xl overflow-hidden border-2 border-red-200 dark:border-red-900 shadow-sm">
      {rolling && (
        <div className="bg-red-50 dark:bg-red-950/20 p-6 sm:p-8 text-center">
          <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
            <div className="absolute w-28 h-28 rounded-full bg-red-100 dark:bg-red-950/40 animate-ping opacity-50" />

            <div className="relative w-24 h-24 rounded-3xl bg-red-600 text-white flex items-center justify-center shadow-xl animate-[memberDiceRoll_0.7s_ease-in-out_infinite]">
              <span className="text-6xl select-none">
                🎲
              </span>
            </div>
          </div>

          <h2 className="mt-6 text-2xl font-black text-slate-900 dark:text-white">
            The monthly draw is happening
          </h2>

          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {recipientCount} eligible paid
            member
            {recipientCount === 1
              ? ""
              : "s"} are being randomly
            selected to receive this
            month's lump-sum payout.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 shadow">
            {drawRemaining >
            0
              ? `Revealing result in ${drawRemaining}s`
              : "Revealing result..."}
          </div>
        </div>
      )}

      {completed && (
        <div className="bg-green-50 dark:bg-green-950/30 p-6 text-center">
          <div className="text-4xl">
            🎉
          </div>

          <h2 className="mt-2 text-xl font-black text-green-700 dark:text-green-300">
            {recipientCount} recipient
            {recipientCount ===
            1
              ? ""
              : "s"} have been selected
          </h2>

          {payout && (
            <div className="mt-5 max-w-xl mx-auto">
              <div className="grid sm:grid-cols-2 gap-3 text-left">
                <div className="rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Savings pot
                  </p>

                  <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {formatNaira(
                      payout.savingsPot
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gross per recipient
                  </p>

                  <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {formatNaira(
                      payout.grossPayoutPerRecipient
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Maintenance fee
                  </p>

                  <p className="text-xl font-black text-red-600 dark:text-red-400 mt-1">
                    {formatNaira(
                      payout.maintenanceFeePerRecipient
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Net per recipient
                  </p>

                  <p className="text-xl font-black text-green-700 dark:text-green-400 mt-1">
                    {formatNaira(
                      payout.netPayoutPerRecipient
                    )}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-green-700/80 dark:text-green-300/80">
                The monthly draw result will
                disappear from your dashboard
                automatically after 1 minute.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * STATUS / ANNOUNCEMENT UI
 * ============================================================ */

const STATUS_COPY: Record<
  string,
  {
    title: string;
    text: string;
  }
> = {
  awaiting_guarantor_review:
    {
      title:
        "Awaiting guarantor review",

      text:
        "An administrator is verifying your nominated guarantor. You'll be able to see your circle position once this is done."
    },

  awaiting_slot_assignment:
    {
      title:
        "Almost there!",

      text:
        "Your guarantor has been verified. An administrator will place you into a circle slot shortly."
    },

  rejected: {
    title:
      "Registration not approved",

    text:
      "Your guarantor could not be verified. Please contact an administrator for details."
  }
};

const STATUS_FONT = {
  fontFamily:
    "'FreeMono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};

function AppUpdateBanner({
  announcements
}: {
  announcements: any[];
}) {
  const appUpdates =
    announcements?.filter(
      (a: any) =>
        a.type ===
        "app_update"
    ) || [];

  if (
    !appUpdates.length
  ) {
    return null;
  }

  return (
    <div className="bg-red-700 text-white px-4 py-3 border-b border-red-800 shadow-md">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {appUpdates.map(
          (
            update: any,
            idx: number
          ) => {
            const description =
              String(
                update.description ||
                  ""
              );

            const urlMatch =
              description.match(
                /https?:\/\/[^\s]+/i
              );

            const downloadUrl =
              urlMatch?.[0] ||
              "";

            const message =
              downloadUrl
                ? description
                    .replace(
                      downloadUrl,
                      ""
                    )
                    .trim()
                : description;

            return (
              <div
                key={
                  update._id ||
                  idx
                }
                className="text-sm font-medium text-center sm:text-left flex-1"
              >
                🚀{" "}
                <span className="font-bold underline">
                  App Update Available:
                </span>{" "}
                <span>
                  {message}
                </span>

                {downloadUrl && (
                  <>
                    {" "}
                    <a
                      href={
                        downloadUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-yellow-200 hover:text-white"
                    >
                      APK
                    </a>
                  </>
                )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

function PartyBanner({
  announcements
}: {
  announcements: any[];
}) {
  const [
    dismissed,
    setDismissed
  ] = useState<
    string[]
  >(() => {
    try {
      return JSON.parse(
        localStorage.getItem(
          "uy_dismissed_party_banners"
        ) || "[]"
      );
    } catch {
      return [];
    }
  });

  const banner =
    announcements?.find(
      (a: any) =>
        a.type ===
          "party_banner" &&
        !dismissed.includes(
          a._id
        )
    );

  if (!banner) {
    return null;
  }

  const dismiss = () => {
    const next = [
      ...dismissed,
      banner._id
    ];

    setDismissed(
      next
    );

    localStorage.setItem(
      "uy_dismissed_party_banners",
      JSON.stringify(
        next
      )
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-5 bg-black/70">
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-4 sm:p-8 md:p-10 text-center border-4 border-double border-red-600/50 dark:border-red-400/50">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="sticky top-0 float-right ml-auto text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-2xl font-bold z-10 bg-white dark:bg-slate-900 px-2"
        >
          ×
        </button>


        <div className="clear-both" />

        <span className="block text-5xl sm:text-6xl text-red-600/20 dark:text-red-400/20 font-black leading-none">
          "
        </span>

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-red-700 dark:text-red-400 -mt-3 sm:-mt-4 uppercase tracking-wide">
          🎉 Party Time!
        </h2>

        <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-800 dark:text-slate-100 mt-4 sm:mt-6 leading-relaxed break-words">
          {banner.description}
        </p>

        {(
          banner.venue ||
          banner.eventDate
        ) && (
          <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4 text-sm sm:text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">
            {banner.venue && (
              <div className="flex items-start justify-center gap-2 sm:gap-3 px-1">
                <span className="text-xl sm:text-2xl shrink-0">
                  📍
                </span>

                <span className="text-left break-words max-w-[80%] sm:max-w-[90%] word-break">
                  {
                    banner.venue
                  }
                </span>
              </div>
            )}

            {banner.eventDate && (
              <div className="flex items-start justify-center gap-2 sm:gap-3 px-1">
                <span className="text-xl sm:text-2xl shrink-0">
                  🗓️
                </span>

                <span className="text-left break-words max-w-[80%] sm:max-w-[90%] word-break">
                  {new Date(
                    banner.eventDate
                  ).toLocaleString(
                    undefined,
                    {
                      dateStyle:
                        "medium",
                      timeStyle:
                        "short"
                    }
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        <span className="block text-5xl sm:text-6xl text-red-600/20 dark:text-red-400/20 font-black leading-none rotate-180 mt-4 sm:mt-6">
          "
        </span>

        <div className="flex items-center justify-center gap-3 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t dark:border-slate-700">
          <img
            src="/brand/logo-badge.png"
            alt=""
            className="w-10 h-10 sm:w-12 sm:h-12"
          />

          <div className="text-left">
            <p className="font-black text-sm sm:text-lg text-slate-900 dark:text-white leading-tight">
              Unique Youth
            </p>

            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Cooperative Thrift Club
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BroadcastModal({
  announcements
}: {
  announcements: any[];
}) {
  const broadcasts =
    announcements?.filter(
      (a: any) =>
        a.isBroadcast &&
        a.type !==
          "party_banner" &&
        a.type !==
          "app_update"
    ) || [];

  if (
    !broadcasts.length
  ) {
    return null;
  }

  const text =
    broadcasts
      .map(
        (a: any) =>
          a.description
      )
      .join(
        "     •     "
      );

  const duration =
    Math.min(
      60,
      Math.max(
        20,
        broadcasts.length *
          10
      )
    );

  return (
    <div className="bg-gradient-to-r from-red-600 to-red-700 text-white overflow-hidden py-4">
      <div
        className="inline-block whitespace-nowrap animate-marquee font-black text-lg"
        style={{
          animationDuration:
            `${duration}s`
        }}
      >
        {text}
      </div>
    </div>
  );
}

/* ============================================================
 * GENERIC UI COMPONENTS
 * ============================================================ */

function StepNav({
  onBack,
  children
}: {
  onBack: () => void;
  children: any;
}) {
  return (
    <div className="flex gap-3 mt-2">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 px-5 py-3 rounded-lg font-semibold border dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        Back
      </button>

      {children}
    </div>
  );
}

function Panel({
  title,
  children
}: any) {
  return (
    <div className="border dark:border-slate-700 rounded-2xl shadow-sm p-4 sm:p-5 dark:bg-slate-900">
      <h2 className="text-2xl font-bold mb-5">
        {title}
      </h2>

      {children}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder
}: any) {
  return (
    <label className="block mb-3">
      <span className="text-sm font-semibold capitalize">
        {label}
      </span>

      <input
        className="mt-1 w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
        type={type}
        value={value}
        onChange={e =>
          onChange(
            e.target.value
          )
        }
        autoComplete={
          autoComplete
        }
        placeholder={
          placeholder
        }
        required
      />
    </label>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  enterKeyHint,
  autoComplete = "current-password"
}: any) {
  const [
    visible,
    setVisible
  ] = useState(false);

  return (
    <label className="block mb-3">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <span className="mt-1 flex items-stretch border dark:border-slate-600 dark:bg-slate-800 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
        <input
          className="w-full p-3 outline-none dark:bg-slate-800 dark:text-white"
          type={
            visible
              ? "text"
              : "password"
          }
          value={value}
          onChange={e =>
            onChange(
              e.target.value
            )
          }
          enterKeyHint={
            enterKeyHint
          }
          autoComplete={
            autoComplete
          }
          required
        />

        <button
          type="button"
          onClick={() =>
            setVisible(
              v => !v
            )
          }
          className="px-3 text-xs font-semibold text-slate-500 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap"
          tabIndex={-1}
        >
          {visible
            ? "Hide"
            : "Show"}
        </button>
      </span>
    </label>
  );
}

function Card({
  t,
  v
}: any) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow">
      <p className="text-slate-500 dark:text-slate-300 text-sm">
        {t}
      </p>

      <b className="text-2xl text-slate-900 dark:text-white">
        {v}
      </b>
    </div>
  );
}

/* ============================================================
 * RULES MODAL (Moved outside ProfilePage for stable identity)
 * ============================================================ */

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Community Rules & Governance
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              By remaining in this community, you agree to these rules – the same ones you accepted when you registered.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center font-black transition"
          >
            ×
          </button>
        </div>
        <div className="p-6 sm:p-8 space-y-5 text-sm sm:text-base text-slate-700 dark:text-slate-200">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900">
            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2">📌 Payment Reporting Process (Updated)</h3>
            <p>
              When you click the <strong>"I've paid for this month"</strong> button on your dashboard, your report is
              immediately sent to the Admin panel with a <strong>"Payment reported — awaiting confirmation"</strong> status.
              <br /><br />
              <strong>If the Admin confirms your proof:</strong> Your payment is permanently recorded in the system, and your dashboard will show a green <strong>"Confirmed"</strong> badge.
              <br /><br />
              <strong>If the Admin rejects your proof:</strong> Your dashboard will show <strong>"Payment report needs attention"</strong> along with the Admin's reason. You can check the reason, fix the issue, and report the payment again.
              <br /><br />
              <em className="text-slate-500 dark:text-slate-400">Your Ledger record is only created when an Admin manually confirms your payment.</em>
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">1. Monthly Contribution</h3>
            <p>₦11,000 every month – ₦10,000 into the shared pot, ₦1,000 into the party/Owambe fund.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">2. Payment Deadline</h3>
            <p>The 5th of every month. Paying after the 5th automatically attracts a flat ₦4,000 late fee – no exceptions, no negotiation.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">3. How to Pay</h3>
            <p>Send your contribution to the admin’s account (details pinned separately/shared privately), then post a clear screenshot of the transfer in Payment Proofs – make sure your name, amount, and date are visible. The admin confirms it in the app once verified; check your own dashboard to see it reflected.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">4. Payouts</h3>
            <p>
              Each month, one or two eligible members are randomly selected to receive a lump‑sum payout from the savings pot.
              The gross payout per recipient is the total savings pot (the ₦10,000 savings portion actually paid by members that month) divided by the number of selected recipients.
              A maintenance fee is deducted from each gross payout. The fee scales based on your circle size. For example: 4 members = ₦1,500 fee per winner, 6 members = ₦1,800 fee per winner, 8 members = ₦3,100 fee per winner, 10 members = ₦3,400 fee per winner, 12 members = ₦3,700 fee per winner, 14 members = ₦4,000 fee per winner, and 16 to 20 members = a fixed ₦5,000 fee per winner.
              The actual amounts vary each month based on how many members have paid and the size of your circle. The net payout you receive is the gross payout minus this maintenance fee.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">5. Respect</h3>
            <p>No insults, harassment, or disrespect toward any member or admin, here or in the app. This is a trust-based financial community – treat it that way.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">6. No Spam</h3>
            <p>No unrelated adverts, forwarded chain messages, links, or promotional content in any group. Repeated violations get you removed.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">7. Disputes</h3>
            <p>Raise any disagreement about a payment or payout privately with an admin, not in the group. Admins have final say, consistent with what’s recorded in the app.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">8. Privacy</h3>
            <p>Don’t screenshot or share another member’s personal details, phone number, or payment history outside this community.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">9. Missed Payments</h3>
            <p>Persistent non-payment is a breach of what you agreed to at registration and may result in removal from the circle and the community – your nominated guarantor may be contacted.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">10. Leaving the Circle Early</h3>
            <p>If you must exit before your circle completes, speak to an admin directly – do not just stop paying or leave the group silently.</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">11. Official Records</h3>
            <p>This WhatsApp community is a companion to the official app. The app’s records are the official record of who has paid and who has been paid out – this group is for proof-sharing and communication, not the source of truth.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * MAIN APP
 * ============================================================ */

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [
    slide,
    setSlide
  ] = useState(0);

  const [
    step,
    setStep
  ] = useState(0);

  const [
    theme,
    setTheme
  ] = useTheme();

  // MODIFIED: mode now accepts "" (landing page) and defaults to ""
  const [
    mode,
    setMode
  ] =
    useState<
      "register" |
        "login" |
        ""
    >("");

  // NEW: store the scroll position when leaving the landing page
  const [landingScrollPos, setLandingScrollPos] = useState(0);

  const [
    msg,
    setMsg
  ] = useState("");

  const [
    error,
    setError
  ] = useState("");

  const [
    form,
    setForm
  ] = useState<any>(
    BLANK_FORM
  );

  const [
    confirmPassword,
    setConfirmPassword
  ] = useState("");

  const [
    userId,
    setUserId
  ] = useState("");

  const [
    otp,
    setOtp
  ] = useState("");

  const [
    regToken,
    setRegToken
  ] = useState("");

  const [
    memberToken,
    setMemberToken
  ] = useState(
    sessionStorage.getItem(
      TOKEN_KEY
    ) || ""
  );

  const [
    loginForm,
    setLoginForm
  ] = useState({
    usernameOrEmail: "",
    password: ""
  });

  const [
    rulesEnd,
    setRulesEnd
  ] = useState(false);

  const [
    accepted,
    setAccepted
  ] = useState(false);

  const [
    dashboard,
    setDashboard
  ] = useState<any>(
    null
  );

  const [
    ann,
    setAnn
  ] = useState<any[]>(
    []
  );

  const [
    guarantor,
    setGuarantor
  ] = useState({
    name: "",
    phone: ""
  });

  const [
    showForgot,
    setShowForgot
  ] = useState(false);

  const [
    drawState,
    setDrawState
  ] =
    useState<
      DrawState | null
    >(null);

  const [
    drawRemaining,
    setDrawRemaining
  ] = useState(0);

  const [
    webAuthnSupported,
    setWebAuthnSupported
  ] = useState(false);

  const [
    platformAuthenticatorAvailable,
    setPlatformAuthenticatorAvailable
  ] = useState(false);

  const [
    nativeBiometricAvailable,
    setNativeBiometricAvailable
  ] = useState(false);

  const [
    nativeFingerprintAvailable,
    setNativeFingerprintAvailable
  ] = useState(false);

  const [
    biometricBusy,
    setBiometricBusy
  ] = useState(false);

  const [
    biometricEnabled,
    setBiometricEnabled
  ] = useState<boolean>(() => {
    try {
      if (
        isNativeAndroidApp()
      ) {
        return (
          localStorage.getItem(
            NATIVE_BIOMETRIC_ENABLED_KEY
          ) === "1"
        );
      }

      return (
        localStorage.getItem(
          PASSKEY_ENABLED_KEY
        ) === "1"
      );
    } catch {
      return false;
    }
  });

  // ============================================================
  // NEW: STATE FOR FINGERPRINT PASSWORD MODAL
  // ============================================================
  const [showFingerprintPasswordModal, setShowFingerprintPasswordModal] = useState(false);
  const [fingerprintPassword, setFingerprintPassword] = useState("");
  const [fingerprintPasswordError, setFingerprintPasswordError] = useState("");

  // ============================================================
  // FIXED: ADDED MISSING STATE FOR REAL-TIME POLLING
  // ============================================================
  const [
    isPaymentReportingOpen,
    setIsPaymentReportingOpen
  ] = useState(true);

  const drawPollRef =
    useRef<
      number | null
    >(null);

  const drawCountdownRef =
    useRef<
      number | null
    >(null);

  const drawHideRef =
    useRef<
      number | null
    >(null);

  useEffect(() => {
    const id =
      setInterval(
        () =>
          setSlide(
            s =>
              (s + 1) %
              slides.length
          ),
        3000
      );

    return () =>
      clearInterval(id);
  }, []);

  /* ==========================================================
   * AUTHENTICATION CAPABILITY DETECTION
   * ========================================================== */

  useEffect(() => {
    let mounted =
      true;

    const detectAuthentication =
      async () => {
        if (
          isNativeAndroidApp()
        ) {
          try {
            const result =
              await NativeBiometric.isAvailable(
                {
                  useFallback:
                    false
                }
              );

            if (!mounted)
              return;

            const fingerprint =
              result.biometryType ===
              BiometryType.FINGERPRINT;

            setNativeBiometricAvailable(
              Boolean(
                result.isAvailable
              )
            );

            setNativeFingerprintAvailable(
              Boolean(
                result.isAvailable &&
                fingerprint
              )
            );

            setWebAuthnSupported(
              false
            );

            setPlatformAuthenticatorAvailable(
              false
            );

            return;
          } catch {
            if (!mounted)
              return;

            setNativeBiometricAvailable(
              false
            );

            setNativeFingerprintAvailable(
              false
            );

            setWebAuthnSupported(
              false
            );

            setPlatformAuthenticatorAvailable(
              false
            );

            return;
          }
        }

        try {
          if (
            !browserSupportsWebAuthn()
          ) {
            if (
              mounted
            ) {
              setWebAuthnSupported(
                false
              );

              setPlatformAuthenticatorAvailable(
                false
              );
            }

            return;
          }

          const platform =
            await platformAuthenticatorIsAvailable();

          if (
            mounted
          ) {
            setWebAuthnSupported(
              true
            );

            setPlatformAuthenticatorAvailable(
              platform
            );
          }
        } catch {
          if (
            mounted
          ) {
            setWebAuthnSupported(
              false
            );

            setPlatformAuthenticatorAvailable(
              false
            );
          }
        }
      };

    detectAuthentication();

    return () => {
      mounted =
        false;
    };
  }, []);

  const set = (
    k: string,
    v: string
  ) =>
    setForm(
      (x: any) => ({
        ...x,
        [k]: v
      })
    );

  const setBank = (
    k: string,
    v: string
  ) =>
    setForm(
      (x: any) => ({
        ...x,
        bank: {
          ...x.bank,
          [k]: v
        }
      })
    );

  /* ==========================================================
   * DRAW HELPERS
   * ========================================================== */

  const clearDrawTimers =
    () => {
      if (
        drawPollRef.current !==
        null
      ) {
        window.clearTimeout(
          drawPollRef.current
        );

        drawPollRef.current =
          null;
      }

      if (
        drawCountdownRef.current !==
        null
      ) {
        window.clearInterval(
          drawCountdownRef.current
        );

        drawCountdownRef.current =
          null;
      }

      if (
        drawHideRef.current !==
        null
      ) {
        window.clearTimeout(
          drawHideRef.current
        );

        drawHideRef.current =
          null;
      }
    };

  useEffect(() => {
    return () =>
      clearDrawTimers();
  }, []);

  const beginDrawCountdown =
    (
      startedAt: string,
      durationMs: number
    ) => {
      if (
        drawCountdownRef.current !==
        null
      ) {
        window.clearInterval(
          drawCountdownRef.current
        );
      }

      const update =
        () => {
          const elapsed =
            Date.now() -
            new Date(
              startedAt
            ).getTime();

          const remaining =
            Math.max(
              0,
              durationMs -
                elapsed
            );

          setDrawRemaining(
            Math.ceil(
              remaining /
                1000
            )
          );

          if (
            remaining <=
            0
          ) {
            if (
              drawCountdownRef.current !==
              null
            ) {
              window.clearInterval(
                drawCountdownRef.current
              );

              drawCountdownRef.current =
                null;
            }

            setDrawRemaining(
              0
            );
          }
        };

      update();

      drawCountdownRef.current =
        window.setInterval(
          update,
          100
        );
    };

  const pollMemberDraw =
    async (
      token: string
    ) => {
      try {
        const state: DrawState =
          await api(
            "/api/member/draw-status",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        setDrawState(
          state
        );

        if (
          state.draw.status ===
          "rolling"
        ) {
          if (
            state.draw
              .startedAt
          ) {
            beginDrawCountdown(
              state.draw
                .startedAt,
              state.draw
                .durationMs
            );
          }

          drawPollRef.current =
            window.setTimeout(
              () =>
                pollMemberDraw(
                  token
                ),
              MEMBER_DRAW_POLL_MS
            );

          return;
        }

        if (
          state.draw.status ===
          "completed"
        ) {
          setDrawRemaining(
            0
          );

          if (
            state.selectedCount >
            0
          ) {
            if (
              drawHideRef.current !==
              null
            ) {
              window.clearTimeout(
                drawHideRef.current
              );
            }

            drawHideRef.current =
              window.setTimeout(
                () => {
                  setDrawState(
                    null
                  );

                  setDrawRemaining(
                    0
                  );
                },
                MEMBER_DRAW_RESULT_VISIBLE_MS
              );
          }

          return;
        }

        setDrawRemaining(
          0
        );
      } catch {
        /* draw polling remains independent */
      }
    };

  /* ==========================================================
   * ANDROID NATIVE FINGERPRINT
   * ========================================================== */

  // --- REPLACED enableNativeBiometricLogin with modal-based flow ---
  const startNativeBiometricEnrollment = async () => {
    if (!memberToken) {
      setError("Please log in with your password before enabling fingerprint login.");
      return;
    }
    if (!isNativeAndroidApp()) {
      setError("Native fingerprint login is only available inside the Android app.");
      return;
    }
    let availability;
    try {
      availability = await NativeBiometric.isAvailable({ useFallback: false });
    } catch (e: any) {
      setError(getNativeBiometricErrorMessage(e, "Android biometric authentication is not available."));
      return;
    }
    if (!availability?.isAvailable) {
      setError("Fingerprint authentication is not available on this device. Register a fingerprint in Android Settings.");
      return;
    }
    setNativeBiometricAvailable(true);
    setNativeFingerprintAvailable(true);

    // Show the password modal instead of window.prompt
    setShowFingerprintPasswordModal(true);
    setFingerprintPassword("");
    setFingerprintPasswordError("");
  };

  // --- REPLACED submitFingerprintPassword with helper-based flow ---
  const submitFingerprintPassword = async () => {
    const password = fingerprintPassword.trim();
    if (!password) {
      setFingerprintPasswordError("Please enter your password.");
      return;
    }

    setBiometricBusy(true);
    setError("");
    setMsg("");
    setFingerprintPasswordError("");

    try {
      const username = String(
        dashboard?.user?.username || dashboard?.user?.email || loginForm.usernameOrEmail || ""
      ).trim();
      if (!username) {
        throw new Error("Your username or email could not be determined.");
      }

      // Verify password by attempting login
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ usernameOrEmail: username, password, deviceId: getDeviceId() })
      });

      // Store credentials with biometric protection using helper
      await saveNativeBiometricCredentials(username, password);

      // Confirm credential was saved
      const saved = await hasNativeBiometricCredentials();
      if (!saved) {
        throw new Error("Credential was not saved after fingerprint setup.");
      }

      localStorage.setItem(NATIVE_BIOMETRIC_ENABLED_KEY, "1");
      setBiometricEnabled(true);
      setMsg("Fingerprint login has been enabled on this Android device.");
      setShowFingerprintPasswordModal(false);
    } catch (e: any) {
      let errorMsg = getNativeBiometricErrorMessage(e, "Unable to enable fingerprint login.");
      if (String(e?.message || "").toLowerCase().includes("cancel")) {
        errorMsg = "Fingerprint setup was cancelled. Please try again.";
      }
      setFingerprintPasswordError(errorMsg);
      setError(errorMsg);
    } finally {
      setBiometricBusy(false);
    }
  };

  // --- REPLACED disableNativeBiometricLogin with helper-based flow ---
  const disableNativeBiometricLogin = async () => {
    if (!isNativeAndroidApp()) {
      setError("Native fingerprint login is only available inside the Android app.");
      return;
    }

    const confirmed = window.confirm("Disable fingerprint login on this Android device?");
    if (!confirmed) return;

    setError("");
    setMsg("");
    setBiometricBusy(true);

    try {
      await disableNativeBiometricCredentials();
      localStorage.removeItem(NATIVE_BIOMETRIC_ENABLED_KEY);
      setBiometricEnabled(false);
      setMsg("Fingerprint login has been disabled on this Android device.");
    } catch (e: any) {
      setError(getNativeBiometricErrorMessage(e, "Unable to disable fingerprint login."));
    } finally {
      setBiometricBusy(false);
    }
  };

  // --- REPLACED nativeBiometricLogin with helper-based flow ---
  const nativeBiometricLogin = async () => {
    if (!isNativeAndroidApp()) return;

    if (!nativeFingerprintAvailable) {
      setError("Fingerprint authentication is not available on this Android device.");
      return;
    }

    setError("");
    setMsg("");
    setBiometricBusy(true);

    try {
      const credentials = await loginWithNativeBiometric();

      const loginResult = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          usernameOrEmail: credentials.username,
          password: credentials.password,
          deviceId: getDeviceId()
        })
      });

      sessionStorage.setItem(TOKEN_KEY, loginResult.token);
      localStorage.setItem(HAS_REGISTERED_KEY, "1");
      setMemberToken(loginResult.token);
      setMsg("Fingerprint login successful.");
    } catch (e: any) {
      const message = getNativeBiometricErrorMessage(e, "Fingerprint authentication failed.");
      // If credential not found, clear local flag
      if (
        String(e?.message || e || "")
          .toLowerCase()
          .includes("credential") ||
        String(e?.message || e || "")
          .toLowerCase()
          .includes("saved")
      ) {
        localStorage.removeItem(NATIVE_BIOMETRIC_ENABLED_KEY);
        setBiometricEnabled(false);
      }
      setError(message);
    } finally {
      setBiometricBusy(false);
    }
  };

  /* ==========================================================
   * WEB WEBAUTHN / PASSKEY
   * ========================================================== */

  const enableWebBiometricLogin =
    async () => {
      if (
        !memberToken
      ) {
        setError(
          "Please log in with your password before enabling biometric/passkey login."
        );

        return;
      }

      if (
        !webAuthnSupported
      ) {
        setError(
          "This browser does not support biometric/passkey login."
        );

        return;
      }

      setError("");
      setMsg("");
      setBiometricBusy(
        true
      );

      try {
        const options =
          await api(
            "/api/auth/passkey/register/options",
            {
              headers: {
                Authorization:
                  `Bearer ${memberToken}`
              }
            }
          );

        const registrationResponse =
          await startRegistration({
            optionsJSON:
              options
          });

        const verification =
          await api(
            "/api/auth/passkey/register/verify",
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${memberToken}`,

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  registrationResponse
                )
            }
          );

        localStorage.setItem(
          PASSKEY_ENABLED_KEY,
          "1"
        );

        setBiometricEnabled(
          true
        );

        setMsg(
          verification.message ||
            "Biometric/passkey login has been enabled on this device."
        );
      } catch (
        e: any
      ) {
        setError(
          getWebAuthnErrorMessage(
            e,
            "Unable to enable biometric/passkey login."
          )
        );
      } finally {
        setBiometricBusy(
          false
        );
      }
    };

  const disableWebBiometricLogin =
    async () => {
      if (
        !memberToken
      ) {
        setError(
          "Please log in before disabling biometric/passkey login."
        );

        return;
      }

      const confirmed =
        window.confirm(
          "Disable biometric/passkey login for this account? Registered web passkeys will be revoked."
        );

      if (!confirmed) {
        return;
      }

      setError("");
      setMsg("");
      setBiometricBusy(
        true
      );

      try {
        const result =
          await api(
            "/api/auth/passkey/disable",
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${memberToken}`
              }
            }
          );

        localStorage.removeItem(
          PASSKEY_ENABLED_KEY
        );

        setBiometricEnabled(
          false
        );

        setMsg(
          result.message ||
            "Biometric/passkey login has been disabled."
        );

        await loadDashboard();
      } catch (
        e: any
      ) {
        setError(
          e.message ||
            "Unable to disable biometric/passkey login."
        );
      } finally {
        setBiometricBusy(
          false
        );
      }
    };

  const enableBiometricLogin =
    async () => {
      if (
        isNativeAndroidApp()
      ) {
        await startNativeBiometricEnrollment();
        return;
      }

      await enableWebBiometricLogin();
    };

  const disableBiometricLogin =
    async () => {
      if (
        isNativeAndroidApp()
      ) {
        await disableNativeBiometricLogin();
        return;
      }

      await disableWebBiometricLogin();
    };

  const biometricLogin =
    async () => {
      if (
        isNativeAndroidApp()
      ) {
        await nativeBiometricLogin();
        return;
      }

      const identifier =
        loginForm.usernameOrEmail.trim();

      if (!identifier) {
        setError(
          "Enter your email or username first, then choose biometric/passkey login."
        );

        return;
      }

      if (
        !webAuthnSupported
      ) {
        setError(
          "This browser does not support biometric/passkey login."
        );

        return;
      }

      setError("");
      setMsg("");
      setBiometricBusy(
        true
      );

      try {
        const options =
          await api(
            "/api/auth/passkey/login/options",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  usernameOrEmail:
                    identifier
                })
            }
          );

        const authenticationResponse =
          await startAuthentication({
            optionsJSON:
              options
          });

        const verification =
          await api(
            "/api/auth/passkey/login/verify",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  authenticationResponse
                )
            }
          );

        sessionStorage.setItem(
          TOKEN_KEY,
          verification.token
        );

        localStorage.setItem(
          HAS_REGISTERED_KEY,
          "1"
        );

        setMemberToken(
          verification.token
        );

        setMsg(
          verification.message ||
            "Biometric/passkey login successful."
        );
      } catch (
        e: any
      ) {
        setError(
          getWebAuthnErrorMessage(
            e,
            "Biometric/passkey login failed."
          )
        );
      } finally {
        setBiometricBusy(
          false
        );
      }
    };

  /* ==========================================================
   * REGISTRATION FLOW
   * ========================================================== */

  const resetWizard =
    () => {
      setStep(0);
      setForm(
        BLANK_FORM
      );
      setConfirmPassword("");
      setUserId("");
      setOtp("");
      setRegToken("");
      setGuarantor({
        name: "",
        phone: ""
      });
      setAccepted(false);
      setRulesEnd(false);
      setLoginForm({
        usernameOrEmail:
          "",
        password:
          ""
      });
      setMsg("");
      setError("");
      setShowForgot(false);
    };

  const start =
    async () => {
      try {
        setError("");

        if (userId) {
          setStep(2);
          return;
        }

        const d =
          await api(
            "/api/auth/register",
            {
              method:
                "POST",

              body:
                JSON.stringify(
                  form
                )
            }
          );

        setUserId(
          d.userId
        );

        setStep(2);

        setMsg(
          d.message ||
            "Verification code sent."
        );
      } catch (
        e: any
      ) {
        setError(
          e.message
        );
      }
    };

  const verify =
    async () => {
      try {
        setError("");

        if (regToken) {
          setStep(3);
          return;
        }

        const d =
          await api(
            "/api/auth/verify-otp",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  userId,
                  otp
                })
            }
          );

        setRegToken(
          d.registrationToken
        );

        setMsg("");
        setStep(3);
      } catch (
        e: any
      ) {
        setError(
          e.message
        );
      }
    };

  const finish =
    async () => {
      try {
        setError("");

        await api(
          "/api/member/complete-registration",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${regToken}`
            },

            body:
              JSON.stringify({
                guarantorName:
                  guarantor.name,

                guarantorPhone:
                  guarantor.phone,

                rulesAccepted:
                  accepted
              })
          }
        );

        localStorage.setItem(
          HAS_REGISTERED_KEY,
          "1"
        );

        setLoginForm(
          l => ({
            ...l,
            usernameOrEmail:
              form.username ||
              form.email
          })
        );

        setMsg(
          "Registration submitted! An administrator will verify your guarantor, then you can log in below."
        );

        setMode(
          "login"
        );
      } catch (
        e: any
      ) {
        setError(
          e.message
        );
      }
    };

  const reportMonthlyPayment =
    async () => {
      if (!memberToken) {
        return;
      }

      const payment =
        dashboard?.currentMonthPayment;

      if (
        payment?.status ===
        "paid"
      ) {
        return;
      }

      if (
        payment?.status ===
        "reported"
      ) {
        setMsg(
          `Your ${payment.month} payment is already awaiting administrator confirmation.`
        );

        return;
      }

      const confirmed =
        window.confirm(
          `Have you paid your ${payment?.month || "current month"} contribution of ₦11,000? Only confirm this after the payment has been made and your proof/receipt has been sent to the admin via WhatsApp.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setError("");
        setMsg("");

        const result =
          await api(
            "/api/member/payment-claims/current",
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${memberToken}`,

                "Content-Type":
                  "application/json"
              }
            }
          );

        setMsg(
          result.message
        );

        await loadDashboard();
      } catch (
        e: any
      ) {
        setError(
          e.message ||
          "Unable to report your payment right now."
        );
      }
    };

  const login =
    async () => {
      try {
        setError("");
        setMsg("");

        const d =
          await api(
            "/api/auth/login",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  ...loginForm,
                  deviceId:
                    getDeviceId()
                })
            }
          );

        sessionStorage.setItem(
          TOKEN_KEY,
          d.token
        );

        localStorage.setItem(
          HAS_REGISTERED_KEY,
          "1"
        );

        setMemberToken(
          d.token
        );
      } catch (
        e: any
      ) {
        setError(
          e.message
        );
      }
    };

  /* ==========================================================
   * DASHBOARD DATA
   * ========================================================== */

  const loadDashboard =
    async () => {
      try {
        const t =
          sessionStorage.getItem(
            TOKEN_KEY
          ) ||
          memberToken;

        if (!t) {
          return;
        }

        const d =
          await api(
            "/api/member/me",
            {
              headers: {
                Authorization:
                  `Bearer ${t}`
              }
            }
          );

        setDashboard(
          d
        );

        if (
          isNativeAndroidApp()
        ) {
          /*
           * Android biometric UI state is controlled locally after a
           * successful enable/disable operation. Do not run an async native
           * credential-presence probe from every dashboard refresh; that probe
           * can race with setup and overwrite the switch state.
           *
           * Actual credential validity is enforced by getSecureCredentials()
           * when the member attempts biometric login.
           */
          setBiometricEnabled(
            localStorage.getItem(
              NATIVE_BIOMETRIC_ENABLED_KEY
            ) === "1"
          );
        } else {
          const backendPasskeyCount =
            Number(
              d?.user
                ?.passkeyCount ||
                d?.user
                  ?.passkeys?.length ||
                0
            );

          if (
            backendPasskeyCount >
            0
          ) {
            localStorage.setItem(
              PASSKEY_ENABLED_KEY,
              "1"
            );

            setBiometricEnabled(
              true
            );
          } else {
            localStorage.removeItem(
              PASSKEY_ENABLED_KEY
            );

            setBiometricEnabled(
              false
            );
          }
        }

        const a =
          await api(
            "/api/member/announcements",
            {
              headers: {
                Authorization:
                  `Bearer ${t}`
              }
            }
          );

        setAnn(a);

        await pollMemberDraw(
          t
        );
      } catch (
        e: any
      ) {
        if (
          String(
            e.message
          )
            .toLowerCase()
            .includes(
              "token"
            )
        ) {
          sessionStorage.removeItem(
            TOKEN_KEY
          );

          setMemberToken(
            ""
          );
        }

        setError(
          e.message
        );
      }
    };

  useEffect(() => {
    if (
      memberToken
    ) {
      loadDashboard();
    }
  }, [
    memberToken
  ]);

  useEffect(() => {
    if (
      !memberToken
    ) {
      return;
    }

    const id =
      setInterval(
        loadDashboard,
        8000
      );

    return () =>
      clearInterval(id);
  }, [
    memberToken
  ]);

  // ============================================================
  // FIXED: POLL PAYMENT WINDOW STATUS FROM BACKEND
  // ============================================================
  useEffect(() => {
    if (!memberToken) return;
    const fetchStatus = async () => {
      try {
        const res = await api('/api/member/settings/payment-reporting', {
          headers: { Authorization: `Bearer ${memberToken}` }
        });
        setIsPaymentReportingOpen(res.open === true);
      } catch {
        setIsPaymentReportingOpen(true);
      }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 4000);
    return () => clearInterval(id);
  }, [memberToken]);

  const onLogout =
    async () => {
      clearDrawTimers();

      try {
        await api(
          "/api/auth/member/logout",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${
                  sessionStorage.getItem(
                    TOKEN_KEY
                  )
                }`
            }
          }
        );
      } catch {}

      sessionStorage.removeItem(
        TOKEN_KEY
      );

      setMemberToken("");

      setDashboard(
        null
      );

      setAnn([]);

      setDrawState(
        null
      );

      setDrawRemaining(
        0
      );

      resetWizard();

      setMode(
        "login"
      );
    };

  /* ==========================================================
   * ANDROID BACK BUTTON HANDLER (SAFE FOR WEB)
   * ========================================================== */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handler = () => {
      if (location.pathname !== "/") {
        navigate(-1);
      } else if (mode !== "") {
        // If on login/register, go back to landing
        setMode("");
        setLandingScrollPos(window.scrollY);
        setTimeout(() => window.scrollTo(0, landingScrollPos), 50);
      } else {
        // Optionally exit the app (only works natively)
        // App.exitApp();
      }
    };

    let listener: any = null;
    try {
      const listener = CapacitorApp.addListener("backButton", handler);
    } catch (e) {
      // Ignore if not available (web fallback)
    }

    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [location, navigate, mode, landingScrollPos]);

  // ============================================================
  // SCROLL DIRECTION FOR HEADER
  // ============================================================
  const headerVisible = useScrollDirection();

  /* ==========================================================
   * NOT LOGGED IN
   * ========================================================== */

  if (
    !memberToken
  ) {
    // If we are in login or registration mode, show the existing forms
    if (mode === 'login' || mode === 'register') {
      const goPersonalContinue =
        () => {
          setError("");

          if (
            form.password.length <
            8
          ) {
            setError(
              "Password must be at least 8 characters."
            );

            return;
          }

          if (
            form.password !==
            confirmPassword
          ) {
            setError(
              "Passwords do not match. Please re-type your confirmation."
            );

            return;
          }

          setStep(1);
        };

      return (
        <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <header className={`bg-blue-800 text-white px-3 sm:px-5 py-3 sm:py-4 flex justify-between items-center gap-3 flex-wrap sticky top-0 z-50 transition-transform duration-300 ${
            headerVisible ? "translate-y-0" : "-translate-y-full"
          }`}>
            <Brand />

            <div className="flex items-center gap-2 ml-auto">
              <ThemeToggle
                theme={
                  theme
                }
                setTheme={
                  setTheme
                }
              />

              <div className="flex gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode(
                      "login"
                    );
                    window.scrollTo(0, 0);
                    setError("");
                    setMsg("");
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold ${
                    mode ===
                    "login"
                      ? "bg-white text-blue-800"
                      : "bg-blue-700 text-blue-100"
                  }`}
                >
                  Log In
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetWizard();
                    setMode(
                      "register"
                    );
                    window.scrollTo(0, 0);
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold ${
                    mode ===
                    "register"
                      ? "bg-white text-blue-800"
                      : "bg-blue-700 text-blue-100"
                  }`}
                >
                  Register
                </button>
              </div>
            </div>
          </header>

          {/* Back to Home button – now restores saved scroll position */}
          <div className="max-w-2xl mx-auto px-3 sm:px-5 pt-4">
            <button
              type="button"
              onClick={() => {
                setMode("");
                // Restore the saved scroll position after re-render
                setTimeout(() => {
                  window.scrollTo(0, landingScrollPos);
                }, 50);
              }}
              className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition flex items-center gap-2"
            >
              <span className="text-xl">←</span> Back to Home
            </button>
          </div>

          <section className="bg-blue-50 dark:bg-slate-900 p-5 sm:p-6 text-center">
            <div className="max-w-xl mx-auto">
              <div className="min-h-48 flex flex-col justify-center">
                <h1 className="text-2xl sm:text-3xl font-black text-blue-800 dark:text-blue-300">
                  {
                    slides[
                      slide
                    ].title
                  }
                </h1>

                <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400">
                  {
                    slides[
                      slide
                    ].text
                  }
                </p>
              </div>

              <div className="flex justify-center gap-2">
                {slides.map(
                  (_, i) => (
                    <span
                      key={i}
                      className={`h-2 w-8 rounded ${
                        i ===
                        slide
                          ? "bg-red-600"
                          : "bg-blue-200 dark:bg-slate-700"
                      }`}
                    />
                  )
                )}
              </div>
            </div>
          </section>

          <main className="max-w-2xl mx-auto p-3 sm:p-5">
            {mode ===
            "login" ? (
              <>
                {msg && (
                  <div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                    {msg}
                  </div>
                )}

                {error && (
                  <div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                <Panel title="Log in to your account">
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      login();
                    }}
                  >
                    <Input
                      label="Email or username"
                      value={
                        loginForm.usernameOrEmail
                      }
                      onChange={(
                        v: string
                      ) => {
                        setLoginForm({
                          ...loginForm,
                          usernameOrEmail:
                            v
                        });

                        setError("");
                      }}
                      autoComplete="username"
                    />

                    <PasswordInput
                      label="Password"
                      value={
                        loginForm.password
                      }
                      onChange={(
                        v: string
                      ) => {
                        setLoginForm({
                          ...loginForm,
                          password:
                            v
                        });

                        setError("");
                      }}
                      enterKeyHint="go"
                    />

                    <button
                      type="submit"
                      className="btn"
                      disabled={
                        biometricBusy
                      }
                    >
                      Log in
                    </button>
                  </form>

                  {isNativeAndroidApp() ? (
                    nativeBiometricAvailable && (
                      <div className="mt-5 pt-5 border-t dark:border-slate-700">
                        <div className="text-center">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Fingerprint login
                          </p>

                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Use the fingerprint registered on
                            this Android device to securely
                            sign in.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={
                            biometricLogin
                          }
                          disabled={
                            biometricBusy ||
                            !biometricEnabled
                          }
                          className="mt-3 w-full border-2 border-blue-800 dark:border-blue-500 text-blue-800 dark:text-blue-300 font-bold py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          {biometricBusy
                            ? "Waiting for fingerprint..."
                            : "Log in with fingerprint"}
                        </button>

                        {!biometricEnabled && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
                            First log in with your password,
                            then enable fingerprint login from
                            your profile.
                          </p>
                        )}
                      </div>
                    )
                  ) : (
                    webAuthnSupported && (
                      <div className="mt-5 pt-5 border-t dark:border-slate-700">
                        <div className="text-center">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Biometric / passkey login
                          </p>

                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Use your fingerprint, Face ID,
                            Windows Hello, or another
                            supported device authenticator.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={
                            biometricLogin
                          }
                          disabled={
                            biometricBusy ||
                            !biometricEnabled
                          }
                          className="mt-3 w-full border-2 border-blue-800 dark:border-blue-500 text-blue-800 dark:text-blue-300 font-bold py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          {biometricBusy
                            ? "Waiting for biometric verification..."
                            : "Log in with biometrics / passkey"}
                        </button>

                        {!biometricEnabled && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
                            First log in normally, then enable
                            biometric/passkey login from your
                            profile.
                          </p>
                        )}
                      </div>
                    )
                  )}

                  <div className="text-center mt-4">
                    <button
                      type="button"
                      className="text-sm text-blue-700 dark:text-blue-300 underline"
                      onClick={() =>
                        setShowForgot(
                          s => !s
                        )
                      }
                    >
                      Forgot password?
                    </button>

                    {showForgot && (
                      <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">
                        There's no self-service
                        password reset yet.
                        Contact an administrator
                        directly.
                      </p>
                    )}
                  </div>

                  <p className="text-center text-sm text-slate-500 dark:text-slate-300 mt-4">
                    New here?{" "}
                    <button
                      type="button"
                      className="text-blue-700 dark:text-blue-300 font-semibold underline"
                      onClick={() => {
                        resetWizard();
                        setMode(
                          "register"
                        );
                        window.scrollTo(0, 0);
                      }}
                    >
                      Register instead
                    </button>
                  </p>
                </Panel>
              </>
            ) : (
              <>
                <div className="flex justify-between mb-5 text-xs font-bold flex-wrap gap-2">
                  {STEP_LABELS.map(
                    (x, i) => (
                      <span
                        className={
                          step ===
                          i
                            ? "text-red-600"
                            : "text-slate-400 dark:text-slate-500"
                        }
                        key={x}
                      >
                        {i + 1}. {x}
                      </span>
                    )
                  )}
                </div>

                {msg && (
                  <div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                    {msg}
                  </div>
                )}

                {error && (
                  <div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                {step === 0 && (
                  <Panel title="Personal information">
                    {[
                      "firstName",
                      "lastName",
                      "username",
                      "email",
                      "primaryPhone"
                    ].map(k => (
                      <Input
                        key={k}
                        label={k}
                        value={
                          form[k]
                        }
                        onChange={(
                          v: string
                        ) =>
                          set(
                            k,
                            v
                          )
                        }
                      />
                    ))}

                    <label className="block mb-4">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        How should we send your
                        verification code?
                      </span>

                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "otpChannel",
                              "email"
                            )
                          }
                          className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border ${
                            form.otpChannel ===
                            "email"
                              ? "bg-blue-800 text-white border-blue-800"
                              : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          Email (free)
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "otpChannel",
                              "sms"
                            )
                          }
                          className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border ${
                            form.otpChannel ===
                            "sms"
                              ? "bg-blue-800 text-white border-blue-800"
                              : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          SMS to my phone
                        </button>
                      </div>

                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Email is the default and
                        doesn't cost anything to send.
                      </p>
                    </label>

                    <PasswordInput
                      label="Password"
                      value={
                        form.password
                      }
                      onChange={(
                        v: string
                      ) =>
                        set(
                          "password",
                          v
                        )
                      }
                    />

                    <PasswordInput
                      label="Confirm password"
                      value={
                        confirmPassword
                      }
                      onChange={
                        setConfirmPassword
                      }
                    />

                    <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-3">
                      {
                        PASSWORD_TIP
                      }
                    </p>

                    <Input
                      label="Residential address"
                      value={
                        form.residentialAddress
                      }
                      onChange={(
                        v: string
                      ) =>
                        set(
                          "residentialAddress",
                          v
                        )
                      }
                    />

                    <button
                      type="button"
                      onClick={
                        goPersonalContinue
                      }
                      className="btn"
                    >
                      Continue
                    </button>

                    <p className="text-center text-sm text-slate-500 dark:text-slate-300 mt-4">
                      Already registered?{" "}
                      <button
                        type="button"
                        className="text-blue-700 dark:text-blue-300 font-semibold underline"
                        onClick={() => {
                          setMode(
                            "login"
                          );
                          window.scrollTo(0, 0);
                        }}
                      >
                        Log in instead
                      </button>
                    </p>
                  </Panel>
                )}

                {step === 1 && (
                  <Panel title="Bank details">
                    <Input
                      label="Bank name"
                      value={
                        form.bank
                          .bankName
                      }
                      onChange={(
                        v: string
                      ) =>
                        setBank(
                          "bankName",
                          v
                        )
                      }
                    />

                    <Input
                      label="Account number"
                      value={
                        form.bank
                          .accountNumber
                      }
                      onChange={(
                        v: string
                      ) =>
                        setBank(
                          "accountNumber",
                          v
                        )
                      }
                    />

                    <Input
                      label="Account name"
                      value={
                        form.bank
                          .accountName
                      }
                      onChange={(
                        v: string
                      ) =>
                        setBank(
                          "accountName",
                          v
                        )
                      }
                    />

                    <StepNav
                      onBack={() =>
                        setStep(0)
                      }
                    >
                      <button
                        type="button"
                        onClick={
                          start
                        }
                        className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition"
                      >
                        Register &amp; Send OTP
                      </button>
                    </StepNav>
                  </Panel>
                )}

                {step === 2 && (
                  <Panel
                    title={
                      form.otpChannel ===
                      "sms"
                        ? "Verify your phone number"
                        : "Verify your email"
                    }
                  >
                    <p className="text-slate-600 dark:text-slate-300">
                      We sent a 6-digit verification
                      code to{" "}
                      {form.otpChannel ===
                      "sms" ? (
                        <b>
                          {
                            form.primaryPhone
                          }
                        </b>
                      ) : (
                        <b>
                          {
                            form.email
                          }
                        </b>
                      )}
                      .
                    </p>

                    <Input
                      label="OTP"
                      value={
                        otp
                      }
                      onChange={
                        setOtp
                      }
                    />

                    <StepNav
                      onBack={() =>
                        setStep(1)
                      }
                    >
                      <button
                        type="button"
                        onClick={
                          verify
                        }
                        className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition"
                      >
                        Verify OTP
                      </button>
                    </StepNav>

                    <button
                      type="button"
                      className="mt-3 w-full py-3 border dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={async () => {
                        try {
                          setMsg(
                            (
                              await api(
                                "/api/auth/resend-otp",
                                {
                                  method:
                                    "POST",

                                  body:
                                    JSON.stringify({
                                      userId
                                    })
                                }
                              )
                            ).message
                          );
                        } catch (
                          e: any
                        ) {
                          setError(
                            e.message
                          );
                        }
                      }}
                    >
                      Resend OTP
                    </button>

                    <p className="text-xs text-slate-400 dark:text-slate-400 mt-3 text-center">
                      Didn't get your OTP? Contact
                      an admin directly.
                    </p>
                  </Panel>
                )}

                {step === 3 && (
                  <Panel title="Digital guarantor nomination">
                    <Input
                      label="Guarantor full name"
                      value={
                        guarantor.name
                      }
                      onChange={(
                        v: string
                      ) =>
                        setGuarantor({
                          ...guarantor,
                          name: v
                        })
                      }
                    />

                    <Input
                      label="Guarantor phone"
                      value={
                        guarantor.phone
                      }
                      onChange={(
                        v: string
                      ) =>
                        setGuarantor({
                          ...guarantor,
                          phone: v
                        })
                      }
                    />

                    <StepNav
                      onBack={() =>
                        setStep(2)
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setStep(
                            4
                          )
                        }
                        className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition"
                      >
                        Continue to Rules
                      </button>
                    </StepNav>
                  </Panel>
                )}

                {step === 4 && (
                  <Panel title="Rules Lock Area">
                    <div
                      onScroll={e => {
                        const x =
                          e.currentTarget;

                        setRulesEnd(
                          x.scrollTop +
                            x.clientHeight >=
                          x.scrollHeight -
                            4
                        );
                      }}
                      className="h-72 overflow-y-auto border-2 dark:border-slate-700 rounded p-4 whitespace-pre-line text-sm"
                    >
                      {
                        rules
                      }
                    </div>

                    <label
                      className={`flex gap-2 mt-4 ${
                        rulesEnd
                          ? ""
                          : "opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={
                          !rulesEnd
                        }
                        checked={
                          accepted
                        }
                        onChange={e =>
                          setAccepted(
                            e.target
                              .checked
                          )
                        }
                      />

                      I have read and agree to the
                      Unique Youth rules.
                    </label>

                    <StepNav
                      onBack={() =>
                        setStep(3)
                      }
                    >
                      <button
                        type="button"
                        disabled={
                          !rulesEnd ||
                          !accepted
                        }
                        onClick={
                          finish
                        }
                        className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Register &amp; Join Circle
                      </button>
                    </StepNav>
                  </Panel>
                )}
              </>
            )}
          </main>

          <AppFooter />
        </div>
      );
    }

    // Otherwise, show the new Landing Page with scroll‑capturing callbacks
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <LandingPage
          onNavigateLogin={() => {
            setLandingScrollPos(window.scrollY);
            setMode('login');
            window.scrollTo(0, 0);
          }}
          onNavigateRegister={() => {
            setLandingScrollPos(window.scrollY);
            setMode('register');
            window.scrollTo(0, 0);
          }}
          onGetStarted={() => {
            setLandingScrollPos(window.scrollY);
            setMode('register');
            window.scrollTo(0, 0);
          }}
          theme={theme}
          setTheme={setTheme}
        />
      </div>
    );
  }

  // ============================================================
  // LOGGED IN – DASHBOARD
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Dashboard
        dashboard={dashboard}
        announcements={ann}
        onRefresh={loadDashboard}
        theme={theme}
        setTheme={setTheme}
        onLogout={onLogout}
        drawState={drawState}
        drawRemaining={drawRemaining}
        webAuthnSupported={webAuthnSupported}
        platformAuthenticatorAvailable={platformAuthenticatorAvailable}
        nativeBiometricAvailable={nativeBiometricAvailable}
        nativeFingerprintAvailable={nativeFingerprintAvailable}
        isNativeAndroid={isNativeAndroidApp()}
        biometricBusy={biometricBusy}
        biometricEnabled={biometricEnabled}
        enableBiometricLogin={enableBiometricLogin}
        disableBiometricLogin={disableBiometricLogin}
        reportMonthlyPayment={reportMonthlyPayment}
        isPaymentReportingOpen={isPaymentReportingOpen}
      />

      {/* Floating Back button – only shown when not on home page */}
      {location.pathname !== "/" && (
        <button
          onClick={() => navigate(-1)}
          className="fixed bottom-6 left-4 z-40 bg-blue-800 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition"
          aria-label="Go back"
        >
          ← Back
        </button>
      )}

      {/* Fingerprint password modal */}
      {showFingerprintPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
              Enter password
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Enter your account password to enable fingerprint login.
            </p>
            {fingerprintPasswordError && (
              <div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
                {fingerprintPasswordError}
              </div>
            )}
            <input
              type="password"
              value={fingerprintPassword}
              onChange={e => {
                setFingerprintPassword(e.target.value);
                setFingerprintPasswordError("");
              }}
              placeholder="Password"
              className="w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFingerprintPasswordModal(false);
                  setBiometricBusy(false);
                }}
                className="flex-1 py-3 rounded-lg border dark:border-slate-600 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFingerprintPassword}
                disabled={biometricBusy}
                className="flex-1 py-3 rounded-lg bg-blue-800 text-white font-bold disabled:opacity-50"
              >
                {biometricBusy ? "Setting up..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * DASHBOARD
 * ============================================================ */

function Dashboard({
  dashboard,
  announcements,
  onLogout,
  onRefresh,
  theme,
  setTheme,
  drawState,
  drawRemaining,
  webAuthnSupported,
  platformAuthenticatorAvailable,
  nativeBiometricAvailable,
  nativeFingerprintAvailable,
  isNativeAndroid,
  biometricBusy,
  biometricEnabled,
  enableBiometricLogin,
  disableBiometricLogin,
  reportMonthlyPayment,
  isPaymentReportingOpen = true
}: any) {
  const [
    view,
    setView
  ] =
    useState<
      "home" |
        "profile"
    >("home");

  const [
    refreshing,
    setRefreshing
  ] = useState(false);

  const status =
    dashboard?.user
      ?.registrationStatus;

  const isActive =
    status === "active";

  const isVerified =
    status ===
      "awaiting_slot_assignment" ||
    status ===
      "active";

  const profileDone =
    !!dashboard?.user
      ?.profileCompletedAt;

  const manualRefresh =
    async () => {
      setRefreshing(
        true
      );

      try {
        await onRefresh?.();
      } finally {
        setTimeout(
          () =>
            setRefreshing(
              false
            ),
          400
        );
      }
    };

  const paid =
    dashboard?.ledgers?.filter(
      (x: any) =>
        x.isPaid
    ).length || 0;

  const mp =
    dashboard?.monthProgress;

  const circle =
    dashboard?.circle;

  const currentMonthFinance =
    dashboard?.currentMonthFinance;

  const currentMonthPayment =
    dashboard?.currentMonthPayment;

  const currentMonthPaymentStatus =
    currentMonthPayment?.status ||
    "unreported";

  // NEW: state to control visibility of the payment confirmation
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(true);

  // Helper to get the dismissal key for the current month
  const getDismissalKey = () => {
    const month = currentMonthPayment?.month || "";
    return `uy_payment_confirmation_dismissed_${month}`;
  };

  // NEW: auto‑clear after 2 minutes, but also respect localStorage dismissal
  useEffect(() => {
    if (currentMonthPaymentStatus === "paid") {
      const month = currentMonthPayment?.month || "";
      const dismissedKey = getDismissalKey();
      const isDismissed = localStorage.getItem(dismissedKey) === "true";

      if (isDismissed) {
        setShowPaymentConfirmation(false);
        return;
      }

      setShowPaymentConfirmation(true);

      // Auto‑clear after 2 minutes (120,000ms)
      const timer = setTimeout(() => {
        setShowPaymentConfirmation(false);
      }, 120000);

      return () => clearTimeout(timer);
    } else {
      setShowPaymentConfirmation(false);
    }
  }, [currentMonthPaymentStatus, currentMonthPayment?.month]);

  // Manual dismiss handler
  const dismissConfirmation = () => {
    const dismissedKey = getDismissalKey();
    localStorage.setItem(dismissedKey, "true");
    setShowPaymentConfirmation(false);
  };

  // ============================================================
  // SCROLL DIRECTION FOR HEADER (within Dashboard)
  // ============================================================
  const headerVisible = useScrollDirection();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <AppUpdateBanner
        announcements={
          announcements
        }
      />

      <header className={`bg-blue-800 text-white px-3 sm:px-4 py-3 sm:py-4 sticky top-0 z-50 transition-transform duration-300 ${
        headerVisible ? "translate-y-0" : "-translate-y-full"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <Brand />

          <div className="flex items-center gap-2 shrink-0">
            {isVerified && (
              <AvatarButton
                user={
                  dashboard?.user
                }
                onClick={() =>
                  setView(
                    v =>
                      v ===
                      "profile"
                        ? "home"
                        : "profile"
                  )
                }
              />
            )}

            <div className="hidden sm:block">
              <ThemeToggle
                theme={
                  theme
                }
                setTheme={
                  setTheme
                }
              />
            </div>

            <button
              type="button"
              onClick={
                manualRefresh
              }
              className="w-10 h-10 rounded-lg bg-blue-700 hover:bg-blue-600 flex items-center justify-center"
              title="Refresh dashboard"
              aria-label="Refresh dashboard"
            >
              <RefreshIcon
                spinning={
                  refreshing
                }
              />
            </button>

            <button
              type="button"
              onClick={
                onLogout
              }
              className="px-2.5 sm:px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs sm:text-sm font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="sm:hidden mt-2 flex justify-end">
          <ThemeToggle
            theme={
              theme
            }
            setTheme={
              setTheme
            }
          />
        </div>
      </header>

      <PartyBanner
        announcements={
          announcements
        }
      />

      <BroadcastModal
        announcements={
          announcements
        }
      />

      {view ===
      "profile" ? (
        <ProfilePage
          dashboard={
            dashboard
          }
          onSaved={
            onRefresh
          }
          onDone={() =>
            setView(
              "home"
            )
          }
          webAuthnSupported={
            webAuthnSupported
          }
          platformAuthenticatorAvailable={
            platformAuthenticatorAvailable
          }
          nativeBiometricAvailable={
            nativeBiometricAvailable
          }
          nativeFingerprintAvailable={
            nativeFingerprintAvailable
          }
          isNativeAndroid={
            isNativeAndroid
          }
          biometricBusy={
            biometricBusy
          }
          biometricEnabled={
            biometricEnabled
          }
          enableBiometricLogin={
            enableBiometricLogin
          }
          disableBiometricLogin={
            disableBiometricLogin
          }
        />
      ) : (
        <main className="max-w-6xl mx-auto p-3 sm:p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Welcome,{" "}
              {dashboard
                ?.user
                ?.firstName ||
                "..."}
            </h1>

            {dashboard?.user
              ?.isOnline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2.5 py-1 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />

                  <span className="relative inline-flex rounded-full w-2 h-2 bg-green-500" />
                </span>

                You're online
              </span>
            )}
          </div>

          <GetTheApp />

          <MemberRollingDice
            drawState={
              drawState
            }
            drawRemaining={
              drawRemaining
            }
          />

          {!isActive &&
            status && (
              <div
                className="mt-5 bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 shadow border-l-4 border-red-600"
                style={
                  STATUS_FONT
                }
              >
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {
                    STATUS_COPY[
                      status
                    ]?.title ||
                    "Pending"
                  }
                </h2>

                <p className="text-slate-600 dark:text-slate-200 mt-1 font-bold">
                  {status ===
                    "awaiting_slot_assignment" &&
                  profileDone
                    ? "Your guarantor has been verified. An administrator will place you into a circle slot shortly."
                    : STATUS_COPY[
                        status
                      ]?.text}
                </p>

                {isVerified &&
                  !profileDone && (
                    <p className="text-slate-600 dark:text-slate-200 mt-3 text-sm font-bold">
                      While you wait, you
                      can{" "}
                      <button
                        type="button"
                        className="text-blue-700 dark:text-blue-300 underline"
                        onClick={() =>
                          setView(
                            "profile"
                          )
                        }
                      >
                        set up your
                        profile
                      </button>
                      .
                    </p>
                  )}
              </div>
            )}

                    <div className="mt-5">
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow">
            <h2 className="font-bold text-xl text-slate-900 dark:text-white">
              My payment history
            </h2>

            <p className="text-slate-600 dark:text-slate-300">
              Confirmed months:{" "}
              {paid}
            </p>

            <div className="mt-4 bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-200">
              <p>
                Send your ₦11,000 to the
                admin's account and share your
                receipt/proof in the WhatsApp
                community.
              </p>

              {currentMonthPaymentStatus === "paid" && (
                <div className="mt-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3 text-center">
                  <p className="font-bold text-green-700 dark:text-green-300">
                    ✓ {currentMonthPayment?.month} payment confirmed
                  </p>
                  <p className="text-xs text-green-700/80 dark:text-green-300/80 mt-1">
                    An administrator has acknowledged this payment.
                  </p>
                </div>
              )}

              {currentMonthPaymentStatus === "reported" && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
                  <p className="font-bold text-amber-700 dark:text-amber-300">
                    Payment reported — awaiting confirmation
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                    The admin still needs to verify your {currentMonthPayment?.month} payment.
                  </p>
                </div>
              )}

              {currentMonthPaymentStatus === "rejected" && (
                <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3">
                  <p className="font-bold text-red-700 dark:text-red-300">
                    Payment report needs attention
                  </p>
                  <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-1">
                    {currentMonthPayment?.rejectionReason ||
                      "The admin could not confirm the payment report. Check your proof and report it again."}
                  </p>
                </div>
              )}

              {currentMonthPaymentStatus === "unreported" && (
                <>
                  <button
                    type="button"
                    onClick={reportMonthlyPayment}
                    disabled={!isPaymentReportingOpen}
                    className="mt-3 w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPaymentReportingOpen
                      ? "I've paid for this month"
                      : "Payment reporting is currently closed"}
                  </button>
                  {!isPaymentReportingOpen && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Payments can only be reported when the admin opens the window.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
          </div>

{isActive && (
            <>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                <Card
                  t="Monthly mandate"
                  v="₦11,000"
                />

                <Card
                  t="Pot contribution"
                  v="₦10,000"
                />

                <Card
                  t="Party fund"
                  v="₦1,000"
                />

                <Card
                  t="Late fine"
                  v="₦4,000"
                />
              </div>

              {mp && (
                <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      This month's contribution
                      target
                    </h2>

                    {mp.met ? (
                      <span className="text-green-600 dark:text-green-400 font-bold text-sm">
                        Target met! 🎉
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-300 font-semibold text-sm">
                        In progress
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 dark:text-slate-300 mt-1">
                    ₦
                    {mp.collected.toLocaleString()}{" "}
                    of ₦
                    {mp.target.toLocaleString()}{" "}
                    collected ·{" "}
                    {mp.paidCount} of{" "}
                    {mp.memberCount} members paid
                  </p>

                  <div className="mt-3 h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all ${
                        mp.met
                          ? "bg-green-600"
                          : "bg-blue-700"
                      }`}
                      style={{
                        width:
                          `${mp.percentage}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {currentMonthFinance && (
                <div className="mt-5 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        Current month's payout
                      </h2>

                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Based on the members whose savings
                        contribution has actually been
                        confirmed this month.
                      </p>
                    </div>

                    <span className="text-xs font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full">
                      {
                        currentMonthFinance
                          .paidMemberCount
                      } paid
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Savings pot
                      </p>

                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                        {formatNaira(
                          currentMonthFinance.savingsPot
                        )}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Recipients
                      </p>

                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                        {
                          currentMonthFinance
                            .recipientCount
                        }
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Gross each
                      </p>

                      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                        {formatNaira(
                          currentMonthFinance.grossPayoutPerRecipient
                        )}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Net each
                      </p>

                      <p className="text-xl font-black text-green-700 dark:text-green-400 mt-1">
                        {formatNaira(
                          currentMonthFinance.netPayoutPerRecipient
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                    Maintenance fee per selected recipient:{" "}
                    {formatNaira(
                      currentMonthFinance.maintenanceFeePerRecipient
                    )}
                    . This is separate from the ₦10,000 savings
                    contribution and ₦1,000 party contribution.
                  </p>
                </div>
              )}

              {dashboard?.lateFee && (
                <div
                  className={`mt-5 rounded-2xl p-4 sm:p-5 shadow border-l-4 ${
                    dashboard
                      .lateFee
                      .status ===
                    "paid"
                      ? "bg-green-50 dark:bg-green-950 border-green-500"
                      : "bg-amber-50 dark:bg-amber-950 border-amber-500"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Late fee
                    </h2>

                    {dashboard
                      .lateFee
                      .status ===
                    "paid" ? (
                      <span className="text-green-700 dark:text-green-400 font-bold text-sm">
                        Paid ✓
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-bold text-sm">
                        Owed
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 dark:text-slate-300 mt-1">
                    ₦
                    {dashboard.lateFee.amount.toLocaleString()}{" "}
                    {dashboard
                      .lateFee
                      .status ===
                    "paid"
                      ? "paid on"
                      : "outstanding since"}{" "}
                    {new Date(
                      dashboard
                        .lateFee
                        .status ===
                      "paid"
                        ? dashboard
                            .lateFee
                            .paidAt
                        : dashboard
                            .lateFee
                            .imposedAt
                    ).toLocaleDateString(
                      undefined,
                      {
                        year:
                          "numeric",
                        month:
                          "short",
                        day:
                          "numeric"
                      }
                    )}
                  </p>

                  {dashboard
                    .lateFee
                    .status !==
                    "paid" && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      This is separate from your
                      monthly contribution. Pay via bank
                      transfer and send proof to the admin.
                    </p>
                  )}
                </div>
              )}

                <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow">
                  <h2 className="font-bold text-xl text-slate-900 dark:text-white">
                    Your circle
                  </h2>

                  {circle ? (
                    <div className="mt-3 flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-blue-800 text-white flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] uppercase tracking-wide text-blue-200">
                          Your number
                        </span>

                        <span className="text-3xl font-black">
                          {
                            circle.myNumber ??
                            "—"
                          }
                        </span>
                      </div>

                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        <p>
                          <b className="text-slate-900 dark:text-white">
                            {
                              circle.name
                            }
                          </b>{" "}
                          · Cycle{" "}
                          {
                            circle.cycleNumber
                          }
                        </p>

                        <p className="mt-1">
                          {
                            circle.size
                          }{" "}
                          of{" "}
                          {
                            circle.baselineSize
                          }{" "}
                          slots filled —{" "}
                          {
                            circle.slotsRemaining
                          }{" "}
                          remaining.
                        </p>

                        <p className="mt-1">
                          Monthly recipients:{" "}
                          <b className="text-slate-900 dark:text-white">
                            {
                              circle.recipientCount
                            }
                          </b>
                        </p>

                        {circle.myDisbursed && (
                          <p className="mt-1 text-red-600 dark:text-red-400 font-semibold">
                            You've already received your payout this cycle.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                      Not assigned to a circle yet.
                    </p>
                  )}
                </section>
            </>

          )}
        </main>
      )}

      <AppFooter />
    </div>
  );
}

/* ============================================================
 * IMAGE RESIZE
 * ============================================================ */

function resizeImageFile(
  file: File,
  maxSize = 320
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        const img =
          new Image();

        img.onload = () => {
          let {
            width,
            height
          } = img;

          if (
            width >
            height
          ) {
            if (
              width >
              maxSize
            ) {
              height =
                Math.round(
                  (height *
                    maxSize) /
                    width
                );

              width =
                maxSize;
            }
          } else if (
            height >
            maxSize
          ) {
            width =
              Math.round(
                (width *
                  maxSize) /
                  height
              );

            height =
              maxSize;
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            width;

          canvas.height =
            height;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {
            reject(
              new Error(
                "Could not process image"
              )
            );

            return;
          }

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          resolve(
            canvas.toDataURL(
              "image/jpeg",
              0.82
            )
          );
        };

        img.onerror = () =>
          reject(
            new Error(
              "Could not read that image"
            )
          );

        img.src = String(
          reader.result
        );
      };

      reader.onerror = () =>
        reject(
          new Error(
            "Could not read that file"
          )
        );

      reader.readAsDataURL(
        file
      );
    }
  );
}

/* ============================================================
 * PROFILE PAGE – FULLY CORRECTED AND RESPONSIVE
 * ============================================================ */

function ProfilePage({
  dashboard,
  onSaved,
  onDone,
  webAuthnSupported,
  platformAuthenticatorAvailable,
  nativeBiometricAvailable,
  nativeFingerprintAvailable,
  isNativeAndroid,
  biometricBusy,
  biometricEnabled,
  enableBiometricLogin,
  disableBiometricLogin
}: any) {
  const u =
    dashboard?.user ||
    {};

  const circle =
    dashboard?.circle;

  const [
    avatarPreview,
    setAvatarPreview
  ] =
    useState<
      string | null
    >(
      u.avatarDataUrl ||
        null
    );

  const [
    avatarChanged,
    setAvatarChanged
  ] = useState(false);

  const [
    showAvatarViewer,
    setShowAvatarViewer
  ] = useState(false);

  const [
    showMoreMenu,
    setShowMoreMenu
  ] = useState(false);

  const [
    showFaq,
    setShowFaq
  ] = useState(false);

  const [
    showFeedback,
    setShowFeedback
  ] = useState(false);

  const [
    showSupport,
    setShowSupport
  ] = useState(false);

  // NEW: RULES MODAL STATE
  const [showRules, setShowRules] = useState(false);

  const [
    feedbackText,
    setFeedbackText
  ] = useState("");

  const [
    feedbackBusy,
    setFeedbackBusy
  ] = useState(false);

  const [
    supportBusy,
    setSupportBusy
  ] = useState(false);

  const [
    day,
    setDay
  ] = useState(
    u.dateOfBirthDay
      ? String(
          u.dateOfBirthDay
        )
      : ""
  );

  const [
    month,
    setMonth
  ] = useState(
    u.dateOfBirthMonth
      ? String(
          u.dateOfBirthMonth
        )
      : ""
  );

  const [
    busy,
    setBusy
  ] = useState(false);

  const [
    msg,
    setMsg
  ] = useState("");

  const [
    err,
    setErr
  ] = useState("");

  const [
    passwordOpen,
    setPasswordOpen
  ] = useState(false);

  const [
    passwordBusy,
    setPasswordBusy
  ] = useState(false);

  const [
    passwordMsg,
    setPasswordMsg
  ] = useState("");

  const [
    passwordErr,
    setPasswordErr
  ] = useState("");

  const [
    passwordForm,
    setPasswordForm
  ] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const onPickFile =
    async (
      e: ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        e.target.files?.[0];

      if (!file) {
        return;
      }

      setErr("");

      try {
        const dataUrl =
          await resizeImageFile(
            file
          );

        setAvatarPreview(
          dataUrl
        );

        setAvatarChanged(
          true
        );
      } catch (
        ex: any
      ) {
        setErr(
          ex.message
        );
      }
    };

  const removeAvatar =
    () => {
      setAvatarPreview(
        null
      );

      setAvatarChanged(
        true
      );

      setMsg("");
      setErr("");
    };

  const save =
    async () => {
      setErr("");
      setMsg("");
      setBusy(true);

      try {
        const body: any =
          {};

        if (
          avatarChanged
        ) {
          body.avatarDataUrl =
            avatarPreview;
        }

        if (
          day
        ) {
          body.dateOfBirthDay =
            Number(day);
        }

        if (
          month
        ) {
          body.dateOfBirthMonth =
            Number(month);
        }

        const res =
          await api(
            "/api/member/profile",
            {
              method:
                "PUT",

              headers: {
                Authorization:
                  `Bearer ${sessionStorage.getItem(
                    TOKEN_KEY
                  )}`,

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  body
                )
            }
          );

        setAvatarChanged(
          false
        );

        await onSaved?.();

        if (
          res.justCompleted
        ) {
          onDone?.();
        } else {
          setMsg(
            "Profile saved successfully."
          );
        }
      } catch (
        ex: any
      ) {
        setErr(
          ex.message
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  const changePassword =
    async () => {
      setPasswordErr("");
      setPasswordMsg("");

      if (
        !passwordForm.currentPassword ||
        !passwordForm.newPassword ||
        !passwordForm.confirmPassword
      ) {
        setPasswordErr(
          "All password fields are required."
        );

        return;
      }

      if (
        passwordForm.newPassword.length <
        8
      ) {
        setPasswordErr(
          "New password must be at least 8 characters."
        );

        return;
      }

      if (
        passwordForm.newPassword !==
        passwordForm.confirmPassword
      ) {
        setPasswordErr(
          "New password and confirmation do not match."
        );

        return;
      }

      setPasswordBusy(
        true
      );

      try {
        const result =
          await api(
            "/api/auth/member/change-password",
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${sessionStorage.getItem(
                    TOKEN_KEY
                  )}`,

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  passwordForm
                )
            }
          );

        setPasswordMsg(
          result.message ||
            "Your password has been changed successfully."
        );

        setPasswordForm({
          currentPassword:
            "",
          newPassword:
            "",
          confirmPassword:
            ""
        });
      } catch (
        ex: any
      ) {
        setPasswordErr(
          ex.message ||
            "Unable to change password."
        );
      } finally {
        setPasswordBusy(
          false
        );
      }
    };

  const openFeedback =
    () => {
      setShowMoreMenu(
        false
      );

      setShowFeedback(
        true
      );

      setFeedbackText(
        ""
      );
    };

  const openSupport =
    () => {
      setShowMoreMenu(
        false
      );

      setShowSupport(
        true
      );
    };

  const openFaq =
    () => {
      setShowMoreMenu(
        false
      );

      setShowFaq(
        true
      );
    };

  const sendFeedback =
    async () => {
      const text =
        feedbackText.trim();

      if (!text) {
        return;
      }

      setErr("");
      setMsg("");
      setFeedbackBusy(true);

      try {
        const token =
          sessionStorage.getItem(
            TOKEN_KEY
          );

        if (!token) {
          throw new Error(
            "Your session has expired. Please log in again."
          );
        }

        const result =
          await api(
            "/api/member/support",
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${token}`,

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  category:
                    "feedback",

                  message:
                    text
                })
            }
          );

        setFeedbackText("");
        setShowFeedback(false);

        setMsg(
          result.message ||
            "Your feedback has been sent successfully."
        );
      } catch (
        ex: any
      ) {
        setErr(
          ex.message ||
            "Unable to send your feedback."
        );
      } finally {
        setFeedbackBusy(false);
      }
    };

  const contactSupport =
    async () => {
      setErr("");
      setMsg("");
      setSupportBusy(true);

      try {
        const token =
          sessionStorage.getItem(
            TOKEN_KEY
          );

        if (!token) {
          throw new Error(
            "Your session has expired. Please log in again."
          );
        }

        const result =
          await api(
            "/api/member/support",
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${token}`,

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  category:
                    "support",

                  message:
                    "Member requested support from the Contact Support section."
                })
            }
          );

        setShowSupport(false);

        setMsg(
          result.message ||
            "Your support request has been sent successfully."
        );
      } catch (
        ex: any
      ) {
        setErr(
          ex.message ||
            "Unable to contact support."
        );
      } finally {
        setSupportBusy(false);
      }
    };

  const rows = [
    [
      "Full name",
      `${u.firstName || ""} ${
        u.lastName || ""
      }`.trim() ||
        "—"
    ],

    [
      "Residential address",
      u.residentialAddress ||
        "—"
    ],

    [
      "Phone number",
      u.primaryPhone ||
        "—"
    ],

    [
      "Circle number",
      circle?.myNumber
        ? `Slot ${
            circle.myNumber
          }${
            circle.name
              ? ` · ${circle.name} (Cycle ${circle.cycleNumber})`
              : ""
          }`
        : "Not yet assigned"
    ],

    [
      "Date of birth",
      u.dateOfBirthDay &&
      u.dateOfBirthMonth
        ? `${u.dateOfBirthDay} ${
            [
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December"
            ][
              u.dateOfBirthMonth -
                1
            ]
          }`
        : "Not set yet"
    ]
  ];

  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-5">
      {/* ====================================================
          PROFILE HEADER
          ==================================================== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() =>
              setShowAvatarViewer(
                true
              )
            }
            className="w-14 h-14 rounded-full overflow-hidden border-2 border-blue-200 dark:border-blue-800 bg-blue-800 text-white flex items-center justify-center text-xl font-black shrink-0"
            title="View profile photo"
          >
            {avatarPreview ? (
              <img
                src={
                  avatarPreview
                }
                alt="Your profile"
                className="w-full h-full object-cover"
              />
            ) : (
              (
                u.firstName ||
                "?"
              )[0]
            )}
          </button>

          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              My Profile
            </h1>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage your account settings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto justify-end sm:justify-start">
          <button
            type="button"
            onClick={
              openSupport
            }
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-800 text-white font-bold text-sm hover:bg-blue-900 transition"
          >
            🛟 Contact Support
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setShowMoreMenu(
                  v => !v
                )
              }
            className="w-10 h-10 rounded-full border dark:border-slate-600 bg-white dark:bg-slate-900 text-xl font-black text-slate-700 dark:text-slate-200 flex items-center justify-center"
            aria-label="More profile options"
            title="More options"
          >
            ⋮
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
              <button
                type="button"
                onClick={openFaq}
                className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                ❓ FAQ
              </button>

              {/* NEW: RULES & REGULATIONS BUTTON IN PROFILE MENU */}
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowRules(true);
                }}
                className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                📜 Rules & Regulations
              </button>

              <button
                type="button"
                onClick={openFeedback}
                className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                💬 Send Feedback
              </button>

              <button
                type="button"
                onClick={openSupport}
                className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                🛟 Contact Support
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="mb-5 w-full flex justify-start sm:justify-start">
        <button
          type="button"
          onClick={() =>
            onDone?.()
          }
          className="text-sm font-semibold text-blue-700 dark:text-blue-300 underline"
        >
          ← Back to dashboard
        </button>
      </div>

      {msg && (
        <div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
          {msg}
        </div>
      )}

      {err && (
        <div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {/* ====================================================
          PROFILE PHOTO - FULLY CORRECTED AND RESPONSIVE
          ==================================================== */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow">
        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-5">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                setShowAvatarViewer(
                  true
                )
              }
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-blue-100 dark:border-blue-900 bg-blue-800 text-white flex items-center justify-center text-4xl font-black"
              title="View profile photo"
            >
              {avatarPreview ? (
                <img
                  src={
                    avatarPreview
                  }
                  alt="Your avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                (
                  u.firstName ||
                  "?"
                )[0]
              )}
            </button>
          </div>

          <div className="flex-1 w-full flex flex-col items-center sm:items-start">
            <div className="flex flex-row flex-wrap items-center justify-center sm:justify-start gap-2 w-full">
              <button
                type="button"
                onClick={() =>
                  setShowAvatarViewer(
                    true
                  )
                }
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                View photo
              </button>

              <label className="inline-flex items-center bg-white dark:bg-slate-800 border border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700">
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={
                    onPickFile
                  }
                />
              </label>

              {avatarPreview && (
                <button
                  type="button"
                  onClick={
                    removeAvatar
                  }
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-600 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Delete photo
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center sm:text-left">
              Tap the photo or use View photo to open a larger preview.
              JPG or PNG files are resized automatically.
            </p>

            {avatarChanged && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-semibold text-center sm:text-left">
                Photo changes are not saved until you press "Save profile".
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ====================================================
          ACCOUNT INFORMATION
          ==================================================== */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow mt-5 overflow-hidden">
        <div className="p-4 sm:p-5">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">
            Account information
          </h2>
        </div>

        <div className="border-t dark:border-slate-700">
          {rows.map(
            ([
              label,
              value
            ]) => (
              <div
                key={
                  label
                }
                className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 p-4 border-b dark:border-slate-700 last:border-0"
              >
                <div className="sm:w-1/3 text-xs font-bold uppercase tracking-wide text-slate-400">
                  {
                    label
                  }
                </div>

                <div className="flex-1 text-sm text-slate-900 dark:text-white break-words">
                  {
                    value
                  }
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* ====================================================
          CHANGE PASSWORD
          ==================================================== */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow mt-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">
              Change password
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Update your account password securely.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setPasswordOpen(
                v => !v
              );

              setPasswordErr("");
              setPasswordMsg("");
            }}
            className="w-full sm:w-auto shrink-0 bg-blue-800 text-white font-bold px-4 py-2 rounded-lg hover:bg-blue-900 text-center"
          >
            {passwordOpen
              ? "Close"
              : "Change password"}
          </button>
        </div>

        {passwordOpen && (
          <div className="mt-5 pt-5 border-t dark:border-slate-700">
            {passwordMsg && (
              <div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm">
                {passwordMsg}
              </div>
            )}

            {passwordErr && (
              <div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
                {passwordErr}
              </div>
            )}

            <PasswordInput
              label="Current password"
              value={
                passwordForm.currentPassword
              }
              onChange={(
                v: string
              ) =>
                setPasswordForm(
                  x => ({
                    ...x,
                    currentPassword:
                      v
                  })
                )
              }
              autoComplete="current-password"
            />

            <PasswordInput
              label="New password"
              value={
                passwordForm.newPassword
              }
              onChange={(
                v: string
              ) =>
                setPasswordForm(
                  x => ({
                    ...x,
                    newPassword:
                      v
                  })
                )
              }
              autoComplete="new-password"
            />

            <PasswordInput
              label="Confirm new password"
              value={
                passwordForm.confirmPassword
              }
              onChange={(
                v: string
              ) =>
                setPasswordForm(
                  x => ({
                    ...x,
                    confirmPassword:
                      v
                  })
                )
              }
              autoComplete="new-password"
            />

            <button
              type="button"
              onClick={
                changePassword
              }
              disabled={
                passwordBusy
              }
              className="w-full sm:w-auto bg-red-600 text-white font-bold px-5 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {passwordBusy
                ? "Changing password..."
                : "Save new password"}
            </button>
          </div>
        )}
      </section>

      {/* ====================================================
          SECURITY / BIOMETRIC
          ==================================================== */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow mt-5">
        <h2 className="font-bold text-lg text-slate-900 dark:text-white">
          Security
        </h2>

        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white">
              {isNativeAndroid
                ? "Use fingerprint"
                : "Use fingerprint / Face ID"}
            </p>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              For login on this device
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={biometricEnabled}
            aria-label={
              isNativeAndroid
                ? "Use fingerprint for login on this device"
                : "Use fingerprint or Face ID for login on this device"
            }
            onClick={() => {
              if (
                biometricBusy
              ) {
                return;
              }

              void (
                biometricEnabled
                  ? disableBiometricLogin()
                  : enableBiometricLogin()
              );
            }}
            aria-busy={
              biometricBusy
            }
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              biometricBusy
                ? "cursor-wait opacity-60"
                : "cursor-pointer"
            } ${
              biometricEnabled
                ? "bg-blue-700"
                : "bg-slate-300 dark:bg-slate-700"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                biometricEnabled
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {biometricBusy && (
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 font-semibold">
            {biometricEnabled
              ? "Disabling biometric login..."
              : isNativeAndroid
              ? "Setting up fingerprint..."
              : "Setting up biometric login..."}
          </p>
        )}

        {isNativeAndroid &&
          nativeBiometricAvailable &&
          !nativeFingerprintAvailable && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
              Fingerprint authentication is not available. Register a
              fingerprint in Android Settings before turning this on.
            </p>
          )}

        {isNativeAndroid &&
          !nativeBiometricAvailable && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
              Native biometric authentication is unavailable on this device.
            </p>
          )}

        {!isNativeAndroid &&
          !webAuthnSupported && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
              This browser or device does not currently support fingerprint /
              Face ID passkey login.
            </p>
          )}

        {biometricEnabled && (
          <p className="text-xs text-green-700 dark:text-green-400 mt-3 font-semibold">
            {isNativeAndroid
              ? "Fingerprint login is enabled on this Android device."
              : "Biometric / passkey login is enabled on this device."}
          </p>
        )}
      </section>

      {/* ====================================================
          DATE OF BIRTH
          ==================================================== */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow mt-5">
        <h2 className="font-bold text-lg mb-3 text-slate-900 dark:text-white">
          Set your date of birth
        </h2>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Day and month only — no year needed.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 flex-wrap w-full">
          <label className="block w-full sm:w-auto">
            <span className="text-sm font-semibold">
              Day
            </span>

            <input
              type="number"
              min={1}
              max={31}
              value={
                day
              }
              onChange={e =>
                setDay(
                  e.target.value
                )
              }
              className="mt-1 w-full sm:w-24 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3"
            />
          </label>

          <label className="block w-full sm:w-auto">
            <span className="text-sm font-semibold">
              Month
            </span>

            <select
              value={
                month
              }
              onChange={e =>
                setMonth(
                  e.target.value
                )
              }
              className="mt-1 w-full sm:w-auto border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3"
            >
              <option value="">
                Select
              </option>

              {[
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December"
              ].map(
                (
                  m,
                  i
                ) => (
                  <option
                    key={m}
                    value={
                      i + 1
                    }
                  >
                    {m}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={
            busy
          }
          className="btn mt-5 disabled:opacity-50"
        >
          {busy
            ? "Saving..."
            : "Save profile"}
        </button>
      </section>

      {/* ====================================================
          AVATAR VIEW MODAL
          ==================================================== */}
      {showAvatarViewer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() =>
            setShowAvatarViewer(
              false
            )
          }
        >
          <div
            className="relative w-full max-w-6xl flex flex-col items-center justify-center gap-3"
            onClick={e =>
              e.stopPropagation()
            }
          >
            {avatarPreview ? (
              <img
                src={
                  avatarPreview
                }
                alt="Your profile"
                className="h-[82vh] w-auto max-h-[82vh] max-w-[90vw] rounded-2xl border-2 border-white/80 object-contain shadow-2xl"
              />
            ) : (
              <div className="w-56 h-56 rounded-full bg-blue-800 text-white flex items-center justify-center text-8xl font-black border-2 border-white/80">
                {
                  (
                    u.firstName ||
                    "?"
                  )[0]
                }
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                setShowAvatarViewer(
                  false
                )
              }
              className="w-full max-w-sm bg-white text-slate-900 font-bold py-3 rounded-lg shadow-lg hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ====================================================
          FAQ MODAL
          ==================================================== */}
      {showFaq && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b dark:border-slate-700 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Frequently Asked Questions
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Common questions about Unique Youth.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowFaq(
                    false
                  )
                }
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 font-black"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              {FAQ_ITEMS.map(
                item => (
                  <div
                    key={
                      item.question
                    }
                    className="border dark:border-slate-700 rounded-xl p-4"
                  >
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      {item.question}
                    </h3>

                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                      {
                        item.answer
                      }
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          FEEDBACK MODAL
          ==================================================== */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-5 py-4 border-b dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Send Feedback
                </h2>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tell us what you would like improved.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowFeedback(
                    false
                  )
                }
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 font-black"
              >
                ×
              </button>
            </div>

            <div className="p-5">
              <textarea
                value={
                  feedbackText
                }
                onChange={e =>
                  setFeedbackText(
                    e.target.value
                  )
                }
                rows={7}
                placeholder="Write your feedback here..."
                className="w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button
                  type="button"
                  onClick={() =>
                    setShowFeedback(
                      false
                    )
                  }
                  className="flex-1 py-3 rounded-lg border dark:border-slate-600 font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    sendFeedback
                  }
                  disabled={
                    feedbackBusy ||
                    !feedbackText.trim()
                  }
                  className="flex-1 py-3 rounded-lg bg-blue-800 text-white font-bold disabled:opacity-50"
                >
                  {feedbackBusy
                    ? "Sending..."
                    : "Send feedback"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          SUPPORT MODAL
          ==================================================== */}
      {showSupport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-5 py-4 border-b dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Contact Support
                </h2>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Get help with your account or the app.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowSupport(
                    false
                  )
                }
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 font-black"
              >
                ×
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4">
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  Contact support for help with
                  registration, account access, payments,
                  profile issues, or app problems.
                </p>
              </div>

              {SUPPORT_PHONE && (
                <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Call the administrator directly
                  </p>

                  <a
                    href={
                      SUPPORT_PHONE_TEL
                        ? `tel:${SUPPORT_PHONE_TEL}`
                        : `tel:${SUPPORT_PHONE}`
                    }
                    className="mt-1 inline-block text-lg font-black text-blue-800 dark:text-blue-300 break-all"
                  >
                    {SUPPORT_PHONE}
                  </a>

                  <a
                    href={
                      SUPPORT_PHONE_TEL
                        ? `tel:${SUPPORT_PHONE_TEL}`
                        : `tel:${SUPPORT_PHONE}`
                    }
                    className="mt-3 inline-flex w-full items-center justify-center py-3 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 transition"
                  >
                    📞 Call support
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={
                  contactSupport
                }
                disabled={
                  supportBusy
                }
                className="mt-4 w-full py-3 rounded-lg bg-blue-800 text-white font-bold disabled:opacity-50"
              >
                {supportBusy
                  ? "Sending..."
                  : "Send support request by email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RULES MODAL RENDER — now using the top‑level component (stable identity) */}
      {showRules && (
        <RulesModal
          onClose={() => setShowRules(false)}
        />
      )}
    </main>
  );
}