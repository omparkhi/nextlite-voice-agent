import hmac
import hashlib
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Initialize Argon2 hasher with default production settings
hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)

def hash_password(password: str) -> str:
    """Hash password securely using Argon2id."""
    return hasher.hash(password)

def compare_password(password: str, password_hash: str) -> bool:
    """Verify plain password against stored hash (Argon2 or bcrypt fallback)."""
    if password_hash.startswith("$argon2"):
        try:
            return hasher.verify(password_hash, password)
        except VerifyMismatchError:
            return False
    elif password_hash.startswith("$2a$") or password_hash.startswith("$2b$"):
        # bcrypt fallback
        try:
            import bcrypt
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except Exception:
            return False
    return False