-- Reset 2FA for locked-out admin user (secret mismatch - authenticator app has different secret)
-- This is a one-time fix. After login, admin should re-setup 2FA with a fresh QR code.
UPDATE "User"
SET two_factor_enabled = false,
    two_factor_secret = NULL,
    two_factor_backup_codes = '{}'
WHERE id = 'cmjul3uys000043avi0csh1wg';
