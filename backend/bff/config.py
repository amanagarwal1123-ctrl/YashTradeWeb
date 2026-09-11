import os
from dataclasses import dataclass
from urllib.parse import urlsplit

BUILD = 'website-shared-v1-staging-2026-09-11'
CONTRACT_COMMIT = 'c4ee70d8134625a1a4e04073c43b9460c3c4e40d'


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

    @classmethod
    def from_env(cls):
        # Explicit per-runtime website origin allowlist; never depend on frontend files.
        origins = os.environ.get('BFF_ALLOWED_ORIGINS', '')
        return cls(os.environ['MONGO_URL'], os.environ['DB_NAME'], tuple(x.strip().rstrip('/') for x in origins.split(',') if x.strip()),
                   os.environ.get('CANONICAL_API_BASE_URL', '').rstrip('/'),
                   os.environ.get('ENROLLMENT_INTEGRATION_KEY', ''), os.environ.get('STAFF_SERVICE_KEY', ''),
                   os.environ.get('SESSION_SECRET', ''), os.environ.get('BUILD_COMMIT', ''),
                   tuple(x.strip() for x in os.environ.get('TRUSTED_INGRESS_CIDRS', '').split(',') if x.strip()),
                   os.environ.get('FORWARD_CANONICAL_CLIENT_IP') == 'true',
                   os.environ.get('ANDROID_APP_URL', '') if os.environ.get('ANDROID_RELEASE_VERIFIED') == 'true' else '',
                   os.environ.get('IOS_APP_URL', '') if os.environ.get('IOS_RELEASE_VERIFIED') == 'true' else '',
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
        return bool(self.valid_base and len(self.session_secret) >= 32 and len(self.staff_key) >= 32
                    and len(self.enrollment_key) >= 32 and self.staff_key != self.enrollment_key)

    def presence(self):
        return {'CANONICAL_API_BASE_URL': bool(self.base), 'ENROLLMENT_INTEGRATION_KEY': bool(self.enrollment_key),
                'STAFF_SERVICE_KEY': bool(self.staff_key), 'SESSION_SECRET': bool(self.session_secret),
                'BUILD_COMMIT': bool(self.build_commit), 'BFF_ALLOWED_ORIGINS': bool(self.origins), 'TRUSTED_INGRESS_CIDRS': bool(self.trusted_ingress),
                'FORWARD_CANONICAL_CLIENT_IP': self.forward_client_ip}

    def downloads(self):
        def allowed(url, host):
            u = urlsplit(url)
            return url if u.scheme == 'https' and u.hostname == host and not u.username and 'id000000' not in url else None
        return {'android_url': allowed(self.android_url, 'play.google.com'), 'ios_url': allowed(self.ios_url, 'apps.apple.com')}