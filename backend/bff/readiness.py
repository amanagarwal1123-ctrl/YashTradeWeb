"""Non-mutating, credential-scoped readiness. Never sends/validates an OTP or looks up a person.

Each website flow is decided from its own local configuration, the canonical per-flow
health payload and a server-only credential probe. Readiness is not authorization:
role, status and token checks stay on the canonical auth routes and are never cached here.
"""
import asyncio
import re
import time
from .config import BUILD, CONTRACT_COMMIT
from .canonical import UpstreamError, fail

MESSAGES = {
    'staff': 'Staff sign-in is temporarily unavailable. Your phone number has not been rejected. Please try again after the service is restored.',
    'enrollment': 'Registration verification is temporarily unavailable. Your details have not been submitted. Please try again after the service is restored.',
    'deletion': 'Account-deletion verification is temporarily unavailable. No deletion has been made. Please try again after the service is restored.',
}
CREDENTIAL = {'staff': ('staff', '/integrations/staff/readiness'),
              'enrollment': ('enrollment', '/integrations/enrollment/readiness'),
              'deletion': ('enrollment', '/integrations/enrollment/readiness')}
INCOMPATIBLE = 'CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE'
MISMATCH = 'CANONICAL_CREDENTIAL_MISMATCH'
CONFIGURATION_KEYS = ('JWT_SECRET', 'MSG91_AUTHKEY', 'ENROLLMENT_INTEGRATION_KEY', 'STAFF_SERVICE_KEY')
PARSE_ERRORS = (UpstreamError, AttributeError, TypeError, ValueError, KeyError)


def issue_names(value):
    """Only short identifiers from the documented issues array; never upstream free text."""
    if not isinstance(value, list) or not all(isinstance(x, str) and re.fullmatch(r'[A-Z0-9_]{1,64}', x) for x in value):
        raise TypeError('issues')
    return ['CANONICAL.' + x for x in value]


def label(value):
    return value[:80] if isinstance(value, str) else None


def parse_health(status, health):
    """Validate the documented AuthReadiness (200/503) or the older public health (200 only)."""
    capabilities, configuration, app_flows = health.get('capabilities'), health.get('configuration'), health.get('flows')
    if not isinstance(capabilities, dict) or capabilities.get('canonical_auth') != 1 or not isinstance(configuration, dict):
        raise TypeError('health')
    upstream = {'reachable': True, 'build': label(health.get('build')), 'commit': label(health.get('commit')), 'contract': None,
                'credential_verification_supported': capabilities.get('credential_readiness') == 1,
                'database_ready': health.get('database_ready') is True,
                'configuration': {k: configuration.get(k) is True for k in CONFIGURATION_KEYS}}
    issues = {name: [] for name in MESSAGES}
    if upstream['credential_verification_supported']:
        # Declared capability requires the per-flow payload; never fall back to public booleans.
        if not isinstance(app_flows, dict) or (status, health.get('status')) not in ((200, 'ok'), (503, 'not_ready')):
            raise TypeError('status')
        upstream['contract'] = 'credential_readiness'
        for name in MESSAGES:
            scoped = app_flows.get(name)
            if not isinstance(scoped, dict) or not isinstance(scoped.get('ready'), bool):
                raise TypeError('flow')
            issues[name] += issue_names(scoped.get('issues'))
            if not scoped['ready'] and not issues[name]:
                issues[name].append('CANONICAL.FLOW_NOT_READY')
    else:
        # Older public-health contract: no per-flow payload, so only HTTP 200 'ok' is interpretable and
        # credential matching stays UNKNOWN (credential_verified null), never reported as verified.
        if status != 200 or health.get('status') != 'ok':
            raise TypeError('legacy')
        upstream['contract'] = 'public_health'
        for name in MESSAGES:
            key = 'STAFF_SERVICE_KEY' if name == 'staff' else 'ENROLLMENT_INTEGRATION_KEY'
            issues[name] += ['CANONICAL.' + k for k in ('JWT_SECRET', 'MSG91_AUTHKEY', key) if not upstream['configuration'][k]]
    if capabilities.get('enrollment_grants') != 1:
        for name in ('enrollment', 'deletion'):
            issues[name].append('CANONICAL.ENROLLMENT_GRANTS')
    return upstream, issues


def parse_credential(key, status, body):
    """Documented CredentialReadiness/SharedError → (credential_verified, issues)."""
    if status == 401:
        return False, [MISMATCH]
    if body.get('credential_verified') is True:
        if body.get('flow') != key or not isinstance(body.get('ready'), bool):
            raise TypeError('credential')
        if status == 200 and body['ready'] and body.get('status') == 'ok':
            return True, []
        if status == 503 and not body['ready']:
            return True, issue_names(body.get('issues')) or ['CANONICAL.FLOW_NOT_READY']
        raise TypeError('credential')
    if status == 503 and re.fullmatch(r'[A-Z0-9_]{1,64}', str(body.get('code', ''))):
        return False, ['CANONICAL.' + body['code']]
    raise TypeError('credential')


class Readiness:
    def __init__(self, cfg, canonical, clock=time.monotonic):
        self.cfg, self.canonical, self.clock = cfg, canonical, clock
        self._lock = asyncio.Lock()
        self._snapshot, self._until = None, 0

    def invalidate(self):
        self._snapshot, self._until = None, 0

    async def snapshot(self):
        # Per-worker bound: concurrent callers coalesce behind one refresh and never
        # amplify upstream traffic. Never used for role/status authorization or refresh.
        if self._snapshot is not None and self.clock() < self._until:
            return self._snapshot
        async with self._lock:
            if self._snapshot is not None and self.clock() < self._until:
                return self._snapshot
            self._snapshot = await self.compute()
            self._until = self.clock() + (30 if self._snapshot['configuration_ready'] else 5)
            return self._snapshot

    async def compute(self):
        flows = {name: {'ready': False, 'issues': self.cfg.flow_issues(name), 'credential_verified': None} for name in MESSAGES}
        upstream = {'reachable': False, 'build': None, 'commit': None, 'contract': None, 'credential_verification_supported': False,
                    'database_ready': False, 'configuration': {}}
        if self.cfg.valid_base:
            try:
                upstream, issues = parse_health(*await self.canonical.probe('/health'))
                for name, state in flows.items():
                    state['issues'] += issues[name]
            except PARSE_ERRORS:
                for state in flows.values():
                    state['issues'].append(INCOMPATIBLE)
            if upstream['contract'] == 'credential_readiness':
                await self.verify_credentials(flows)
        for state in flows.values():
            state['ready'] = not state['issues'] and upstream['reachable']
        return {'flows': flows, 'upstream': upstream, 'configuration_ready': all(s['ready'] for s in flows.values()),
                'key_matching_verified_by_this_check': all(s['credential_verified'] is True for s in flows.values())}

    async def verify_credentials(self, flows):
        # Credentials only travel for flows with no local/upstream issue; one probe per secret.
        pending = {}
        for name, state in flows.items():
            if not state['issues']:
                pending.setdefault(CREDENTIAL[name], []).append(name)
        outcomes = await asyncio.gather(*(self.credential(key, path) for key, path in pending))
        for (key, path), (verified, issues) in zip(pending, outcomes):
            for name in pending[(key, path)]:
                flows[name]['credential_verified'] = verified
                flows[name]['issues'] += issues

    async def credential(self, key, path):
        try:
            return parse_credential(key, *await self.canonical.probe(path, key=key))
        except PARSE_ERRORS:
            return False, [INCOMPATIBLE]

    async def public(self):
        result = await self.snapshot()
        return {'flows': {name: {'available': state['ready'], 'message': '' if state['ready'] else MESSAGES[name]}
                          for name, state in result['flows'].items()},
                'retry_after': 30, 'real_login_verified_by_this_check': False}


async def ensure_flow(request, flow):
    snapshot = await request.app.state.readiness.snapshot()
    if not snapshot['flows'][flow]['ready']:
        fail(503, 'AUTH_SERVICE_UNAVAILABLE', MESSAGES[flow])


async def health_report(app):
    snapshot = await app.state.readiness.snapshot()
    database_ready = False
    try:
        await asyncio.wait_for(app.state.db.command('ping'), timeout=2)
        database_ready = True
    except Exception:
        pass
    operational = snapshot['configuration_ready'] and database_ready
    return {'status': 'ok' if operational else 'not_ready', 'build': BUILD,
            'commit': app.state.cfg.commit, 'app_contract_commit': CONTRACT_COMMIT,
            'integration_ready': operational, 'database_ready': database_ready,
            'configuration': app.state.cfg.presence(), **snapshot,
            'sms_delivery_verified': False, 'account_role_verified': False, 'real_login_verified_by_this_check': False}
