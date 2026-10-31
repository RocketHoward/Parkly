/** A practical email check; Supabase remains the authority for valid accounts. */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  const [local, domain, extra] = email.split("@");
  if (
    email.length > 254 ||
    !local ||
    local.length > 64 ||
    !domain ||
    extra !== undefined ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
      domain,
    )
  )
    return "Enter a valid email address.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Enter a password.";
  if (value.length < 8) return "Use at least 8 characters for your password.";
  if (!/\S/.test(value)) return "Your password cannot contain only spaces.";
  return null;
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter your full name.";
  if (name.length < 2) return "Use at least 2 characters for your name.";
  if (name.length > 80) return "Keep your name to 80 characters or fewer.";
  if (/[\u0000-\u001f\u007f]/.test(name))
    return "Enter your name without control characters.";
  return null;
}
