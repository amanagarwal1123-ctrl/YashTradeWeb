import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

BUILD = 'website-shared-v1-d2d3d4-consumers-v3'
CONTRACT_COMMIT = '9596a5578a61bb1fb187e63345b7f93eda95bc9c'
# Bootstrap markers shared with the app (shared/core.py PLACEHOLDER_MARKERS): such values count as ABSENT.
PLACEHOLDER_MARKERS = ('SET_IN_PUBLISH_SECRETS', 'PLACEHOLDER', 'REPLACE_ME', 'CHANGE_ME', 'UNCONFIGURED')


def is_placeholder(value):
    upper = value.strip().upper()
    return not upper or any(marker in upper for marker in PLACEHOLDER_MARKERS)


def setting(name):
    """Runtime environment wins over .env (load_dotenv never overrides); placeholders read as ''."""
    value = os.environ.get(name, '').strip()
    return '' if is_placeholder(value) else value


@dataclass
class Settings:
    mongo_url: str
    db_name: str
    origins: tuple
    base: str = ''
    enrollment_key: str = ''
    staff_key: str = ''
    session_secret: str = ''
    build_commit: str = ''
    trusted_ingress: tuple = ()
    forward_client_ip: bool = False
    android_url: str = ''
    ios_url: str = ''
    ingress_origins: tuple = ()

    def __post_init__(self):
        # Executable placeholder rejection for every construction path, not only from_env().
        for field in ('base', 'enrollment_key', 'staff_key', 'session_secret', 'build_commit', 'android_url', 'ios_url'):
            if is_placeholder(getattr(self, field)):
                setattr(self, field, '')
        self.origins = tuple(o for o in self.origins if not is_placeholder(o))
        self.ingress_origins = tuple(o for o in self.ingress_origins if not is_placeholder(o))
        self.trusted_ingress = tuple(o for o in self.trusted_ingress if not is_placeholder(o))

    @classmethod
    def from_env(cls):
        # Explicit per-runtime website origin allowlist; never depend on frontend files.
        origins = os.environ.get('BFF_ALLOWED_ORIGINS', '')  # list values are filtered per entry in __post_init__
        return cls(os.environ['MONGO_URL'], os.environ['DB_NAME'], tuple(x.strip().rstrip('/') for x in origins.split(',') if x.strip()),
                   setting('CANONICAL_API_BASE_URL').rstrip('/'),
                   setting('ENROLLMENT_INTEGRATION_KEY'), setting('STAFF_SERVICE_KEY'),
                   setting('SESSION_SECRET'), setting('BUILD_COMMIT'),
                   tuple(x.strip() for x in os.environ.get('TRUSTED_INGRESS_CIDRS', '').split(',') if x.strip()),
                   os.environ.get('FORWARD_CANONICAL_CLIENT_IP') == 'true',
                   setting('ANDROID_APP_URL') if os.environ.get('ANDROID_RELEASE_VERIFIED') == 'true' else '',
                   setting('IOS_APP_URL') if os.environ.get('IOS_RELEASE_VERIFIED') == 'true' else '',
                   tuple(x.strip().rstrip('/') for x in os.environ.get('BFF_INGRESS_ORIGINS', '').split(',') if x.strip()))

    @property
    def valid_base(self):
        try:
            u = urlsplit(self.base)
            return (u.scheme == 'https' and bool(u.hostname) and u.path == '/api' and not u.query
                    and not u.fragment and not u.username and not u.password and u.port in (None, 443))
        except ValueError:
            return False

    @property
    def ready(self):
        return not any(self.flow_issues(flow) for flow in ('staff', 'enrollment', 'deletion'))

    @staticmethod
    def valid_origin(value):
        try:
            parsed = urlsplit(value)
            return bool(parsed.scheme == 'https' and parsed.hostname and parsed.path == ''
                        and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
                        and parsed.port in (None, 443))
        except ValueError:
            return False

    def flow_issues(self, flow):
        """Return configuration NAMES only, never values. No legacy/production fallback."""
        issues = []
        if not self.valid_base:
            issues.append('CANONICAL_API_BASE_URL')
        if len(self.session_secret) < 32:
            issues.append('SESSION_SECRET')
        if not self.origins or not all(self.valid_origin(o) for o in self.origins):
            issues.append('BFF_ALLOWED_ORIGINS')
        if not all(self.valid_origin(o) for o in self.ingress_origins):
            issues.append('BFF_INGRESS_ORIGINS')
        name, value = ('STAFF_SERVICE_KEY', self.staff_key) if flow == 'staff' else ('ENROLLMENT_INTEGRATION_KEY', self.enrollment_key)
        if len(value) < 32:
            issues.append(name)
        if self.staff_key and self.staff_key == self.enrollment_key:
            issues.append('SERVICE_KEYS_MUST_DIFFER')
        return issues

    @property
    def commit(self):
        return self.build_commit if re.fullmatch(r'[0-9a-f]{7,40}', self.build_commit) else 'unrecorded'

    def presence(self):
        """Validity flags by setting NAME (placeholders and malformed values report false); never values."""
        return {'CANONICAL_API_BASE_URL': self.valid_base, 'ENROLLMENT_INTEGRATION_KEY': len(self.enrollment_key) >= 32,
                'STAFF_SERVICE_KEY': len(self.staff_key) >= 32 and self.staff_key != self.enrollment_key,
                'SESSION_SECRET': len(self.session_secret) >= 32, 'BUILD_COMMIT': self.commit != 'unrecorded',
                'BFF_ALLOWED_ORIGINS': bool(self.origins) and all(self.valid_origin(o) for o in self.origins),
                'BFF_INGRESS_ORIGINS': bool(self.ingress_origins) and all(self.valid_origin(o) for o in self.ingress_origins),
                'TRUSTED_INGRESS_CIDRS': bool(self.trusted_ingress), 'FORWARD_CANONICAL_CLIENT_IP': self.forward_client_ip}

    def downloads(self):
        def allowed(url, host):
            u = urlsplit(url)
            return url if u.scheme == 'https' and u.hostname == host and not u.username and 'id000000' not in url else None
        return {'android_url': allowed(self.android_url, 'play.google.com'), 'ios_url': allowed(self.ios_url, 'apps.apple.com')}