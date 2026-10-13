// Source of truth for user-facing strings. Every other locale must define the
// same keys. Placeholders use {name} syntax and must be preserved.
export const en = {
  'common.continue': 'Continue',
  'common.cancel': 'Cancel',
  'common.termsOfService': 'Terms of Service',
  'common.privacyPolicy': 'Privacy Policy',
  'common.signInPageTitle': 'Bubbly Clouds – Sign in',

  'login.enterCode': 'Enter code sent via email',
  'login.notReceived': 'Not received? Try a different method',
  'login.signInWithGoogle': 'Sign in with Google',
  'login.signInWithApple': 'Sign in with Apple',
  'login.signInWithEmail': 'Sign in with email',
  'login.emailPlaceholder': 'your@email.com',

  'consent.returnToApp': 'Press continue to return to the app.',
  'consent.switchUser': 'Switch User',

  'logout.pageTitle': 'Bubbly Clouds – Sign out',
  'logout.confirm': 'Do you want to sign-out?',
  'logout.yes': 'Yes, sign me out',
  'logout.no': 'No, stay signed in',

  'email.subject': 'Finish signing in to Bubbly Clouds',
  'email.preheader': 'Here is your sign in code',
  'email.logoAlt': 'Bubbly Clouds',
  'email.heading': 'Use this code to sign in',
  'email.instruction':
    'Enter this code to verify your email address and continue signing in.',
  'email.ignore': 'Not trying to sign in? Please ignore this email.',
  'email.thanks': 'Thanks, Bubbly Clouds',

  // App names, shown as the heading for the matching client_name
  'client.sudokuRace': 'Sudoku Race',
  'client.unblockRace': 'Unblock Race',
} as const;

export type TranslationKey = keyof typeof en;
export type Catalog = Record<TranslationKey, string>;
