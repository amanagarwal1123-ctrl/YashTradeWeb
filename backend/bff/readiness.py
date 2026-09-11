"""Non-mutating readiness. Never sends/validates an OTP or looks up a person.

This checks local configuration plus the canonical PUBLIC health contract. Key
presence is not proof that secret values match, SMS delivery works or users' roles
are correct. Those boundaries remain enforced by the canonical auth routes.
"""
import asyncio
import time
from .config import BUILD, CONTRACT_COMMIT
from .canonical import UpstreamError, fail

MESSAGES = {
    'staff': 'Staff sign-in is temporarily unavailable. Your phone number has not been rejected. Please try again after the service is restored.',
    'enrollment': 'Registration verification is temporarily unavailable. Your details have not been submitted. Please try again after the service is restored.',
    'deletion': 'Account-deletion verification is temporarily unavailable. No deletion has been made. Please try again after the service is restored.',
}


class Readiness:
    def __init__(self, cfg, canonical):
        self.cfg, self.canonical = cfg, canonical
        self._lock = asyncio.Lock()
        self._snapshot, self._until = None, 0

    async def snapshot(self):
        # Per-worker bound prevents the anonymous UI status endpoint from amplifying
        # upstream traffic. Never used for role/status authorization or token refresh.
        if self._snapshot is not None and time.monotonic() < self._until:
            return self._snapshot
        async with self._lock:
            if self._snapshot is not None and time.monotonic() < self._until:
                return self._snapshot
            flows = {name: {'ready': False, 'issues': self.cfg.flow_issues(name)} for name in MESSAGES}
            upstream = {'reachable': False, 'build': None, 'commit': None, 'configuration': {}}
            if self.cfg.valid_base:
                try:
                    health = await self.canonical.request('GET', '/health')
                    capabilities = health.get('capabilities', {})
                    configuration = health.get('configuration', {})
                    if health.get('status') != 'ok' or capabilities.get('canonical_auth') != 1:
                        raise UpstreamError(503, 'CANONICAL_HEALTH_UNSUPPORTED', 'Unexpected canonical health contract')
                    # Only stable known fields; never copy arbitrary upstream body/error.
                    upstream = {'reachable': True, 'build': health.get('build'), 'commit': health.get('commit'),
                        'configuration': {k: configuration.get(k) is True for k in ('JWT_SECRET', 'MSG91_AUTHKEY', 'ENROLLMENT_INTEGRATION_KEY', 'STAFF_SERVICE_KEY')}}
                    for name, state in flows.items():
                        key = 'STAFF_SERVICE_KEY' if name == 'staff' else 'ENROLLMENT_INTEGRATION_KEY'
                        for required in ('JWT_SECRET', 'MSG91_AUTHKEY', key):
                            if upstream['configuration'][required] is not True:
                                state['issues'].append('CANONICAL.' + required)
                        if name != 'staff' and capabilities.get('enrollment_grants') != 1:
                            state['issues'].append('CANONICAL.ENROLLMENT_GRANTS')
                except (UpstreamError, AttributeError, TypeError):
                    for state in flows.values():
                        state['issues'].append('CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE')
            for state in flows.values():
                state['ready'] = not state['issues'] and upstream['reachable']
            self._snapshot = {'flows': flows, 'upstream': upstream,
                              'configuration_ready': all(s['ready'] for s in flows.values())}
            self._until = time.monotonic() + (30 if self._snapshot['configuration_ready'] else 5)
            return self._snapshot

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
            'commit': app.state.cfg.build_commit or 'unrecorded', 'app_contract_commit': CONTRACT_COMMIT,
            'integration_ready': operational, 'database_ready': database_ready,
            'configuration': app.state.cfg.presence(), **snapshot,
            'key_matching_verified_by_this_check': False, 'real_login_verified_by_this_check': False}