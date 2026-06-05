import secrets
import string

from .models import UserProfile


def get_user_role(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    profile = getattr(user, 'profile', None)
    return getattr(profile, 'role', None)


def is_regie_user(user):
    return get_user_role(user) == UserProfile.ROLE_REGIE


def is_source_user(user):
    return get_user_role(user) == UserProfile.ROLE_SOURCE


def is_source_or_regie_user(user):
    return get_user_role(user) in {UserProfile.ROLE_SOURCE, UserProfile.ROLE_REGIE}


def serialize_user(user):
    profile = getattr(user, 'profile', None)
    return {
        'id': user.id,
        'username': user.username,
        'display_name': getattr(profile, 'display_name', '') or user.username,
        'role': getattr(profile, 'role', None),
    }


def generate_password(length=14):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))
