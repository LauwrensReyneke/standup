export const ALLOWED_EMAILS = new Set(
  [
    'lauwrens@r-e-d.online',
    'kopo@r-e-d.online',
    'arsalan@r-e-d.online',
    'bongi@r-e-d.online',
    'kaylen@r-e-d.online',
    'paul@r-e-d.online',
    'ruben@r-e-d-solutions.co.za',
  ].map((e) => e.toLowerCase()),
)

export function isEmailAllowed(email: string) {
  return ALLOWED_EMAILS.has(email.trim().toLowerCase())
}

