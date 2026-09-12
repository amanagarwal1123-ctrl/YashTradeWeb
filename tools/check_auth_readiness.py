"""Read-only release gate. No keys, phone lookups, OTP or mutation requests.

Environment (all required; an absent expectation is a FAILURE, never a wildcard):
  WEBSITE_CHECK_ORIGINS        comma-separated explicit HTTPS website origins (both production domains)
  EXPECTED_WEBSITE_BUILD       website build string reported by /api/health/ready
  EXPECTED_WEBSITE_COMMIT      website source SHA (hex, 7-40) expected in `commit` (BUILD_COMMIT)
  EXPECTED_APP_CONTRACT_COMMIT app contract pin expected in `app_contract_commit`
  EXPECTED_UPSTREAM_BUILD      canonical app build expected in `upstream.build`
  EXPECTED_UPSTREAM_COMMIT     canonical app commit expected in `upstream.commit`
  PUBLICATION_RECEIPT          publish/deploy receipt identifier retained in the output (a reported
                               BUILD_COMMIT alone is not independent deployment attestation)
Exit 0 only when EVERY origin passes every check below with credential-verified readiness.
Legacy public-health booleans, null/false credential verification, unrecorded commits, malformed
bodies or a public status that contradicts readiness all fail the gate.
"""
import json
import os
import re
import sys
from urllib.parse import urlsplit
import httpx

FLOWS = ('staff', 'enrollment', 'deletion')
EXPECTATIONS = ('EXPECTED_WEBSITE_BUILD', 'EXPECTED_WEBSITE_COMMIT', 'EXPECTED_APP_CONTRACT_COMMIT',
                'EXPECTED_UPSTREAM_BUILD', 'EXPECTED_UPSTREAM_COMMIT', 'PUBLICATION_RECEIPT')


def expectations():
    values = {name: os.environ.get(name, '').strip() for name in EXPECTATIONS}
    missing = [name for name, value in values.items() if not value]
    if not re.fullmatch(r'[0-9a-f]{7,40}', values['EXPECTED_WEBSITE_COMMIT'] or ''):
        missing.append('EXPECTED_WEBSITE_COMMIT:hex')
    return values, missing


def evaluate(ready_status, ready, public_status, public, expected):
    """Pure gate over already-fetched bodies. Returns the list of failed check names."""
    failed = []
    if not isinstance(ready, dict):
        return ['READY_BODY_NOT_OBJECT']
    if ready_status != 200:
        failed.append('READY_HTTP_%s' % ready_status)
    checks = {
        'integration_ready': ready.get('integration_ready') is True,
        'status_ok': ready.get('status') == 'ok',
        'website_build': ready.get('build') == expected['EXPECTED_WEBSITE_BUILD'],
        'website_commit': ready.get('commit') == expected['EXPECTED_WEBSITE_COMMIT'],
        'app_contract_commit': ready.get('app_contract_commit') == expected['EXPECTED_APP_CONTRACT_COMMIT'],
        'key_matching_verified': ready.get('key_matching_verified_by_this_check') is True,
    }
    upstream = ready.get('upstream')
    checks['upstream_object'] = isinstance(upstream, dict)
    if checks['upstream_object']:
        checks['upstream_contract'] = upstream.get('contract') == 'credential_readiness'
        checks['upstream_build'] = upstream.get('build') == expected['EXPECTED_UPSTREAM_BUILD']
        checks['upstream_commit'] = upstream.get('commit') == expected['EXPECTED_UPSTREAM_COMMIT']
    flows = ready.get('flows')
    checks['flows_object'] = isinstance(flows, dict)
    for name in FLOWS:
        state = flows.get(name) if checks['flows_object'] else None
        checks['flow_%s' % name] = (isinstance(state, dict) and state.get('ready') is True
                                    and state.get('credential_verified') is True and state.get('issues') == [])
    checks['public_http_200'] = public_status == 200 and isinstance(public, dict)
    if checks['public_http_200']:
        checks['origin_allowed'] = public.get('origin_allowed') is True
        public_flows = public.get('flows') if isinstance(public.get('flows'), dict) else {}
        for name in FLOWS:
            state = public_flows.get(name)
            checks['public_%s_available' % name] = isinstance(state, dict) and state.get('available') is True
    failed += [name for name, ok in checks.items() if not ok]
    return failed


def fetch(client, origin):
    response = client.get(origin + '/api/health/ready')
    try:
        ready = response.json()
    except ValueError:
        ready = None
    status = client.get(origin + '/api/public/auth-status', params={'website_origin': origin})
    try:
        public = status.json()
    except ValueError:
        public = None
    return response.status_code, ready, status.status_code, public


def main():
    origins = [u.strip().rstrip('/') for u in os.environ.get('WEBSITE_CHECK_ORIGINS', '').split(',') if u.strip()]
    if not origins:
        raise SystemExit('At least one explicit website origin is required')
    expected, missing = expectations()
    report = {'publication_receipt': expected['PUBLICATION_RECEIPT'] or None, 'missing_expectations': missing,
              'live_login_verified_by_this_check': False, 'origins': []}
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.username or parsed.password:
            raise SystemExit('Only explicit HTTPS origins are accepted')
        row = {'origin': origin, 'passed': False}
        try:
            with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
                ready_status, ready, public_status, public = fetch(client, origin)
            failed = evaluate(ready_status, ready, public_status, public, expected) if not missing else ['EXPECTATIONS_MISSING']
            observed = ready if isinstance(ready, dict) else {}
            row.update({'http_status': ready_status, 'failed_checks': failed, 'passed': not failed,
                        'build': observed.get('build'), 'commit': observed.get('commit'),
                        'app_contract_commit': observed.get('app_contract_commit'),
                        'upstream_contract': (observed.get('upstream') or {}).get('contract') if isinstance(observed.get('upstream'), dict) else None,
                        'key_matching_verified_by_this_check': observed.get('key_matching_verified_by_this_check') is True,
                        'issues': {flow: data.get('issues') for flow, data in (observed.get('flows') or {}).items() if isinstance(data, dict)}})
        except httpx.HTTPError as exc:
            row.update({'failed_checks': ['READINESS_UNAVAILABLE:' + type(exc).__name__]})
        report['origins'].append(row)
    report['release_gate'] = 'PASS' if report['origins'] and all(r['passed'] for r in report['origins']) and not missing else 'FAIL'
    print(json.dumps(report, indent=2))
    return 0 if report['release_gate'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
