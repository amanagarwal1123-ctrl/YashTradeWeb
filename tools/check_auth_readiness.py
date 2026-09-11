"""Read-only promotion gate. No keys, phone lookups, OTP or mutation requests.

Set WEBSITE_CHECK_ORIGINS to the explicit comma-separated HTTPS website origins.
Checks both service readiness and whether each explicitly supplied website origin
is configured. This script never chooses a canonical target or sends credentials.
"""
import json
import os
import sys
from urllib.parse import urlsplit
import httpx


def main():
    origins = [u.strip().rstrip('/') for u in os.environ['WEBSITE_CHECK_ORIGINS'].split(',') if u.strip()]
    if not origins:
        raise SystemExit('At least one explicit website origin is required')
    results = []
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.username or parsed.password:
            raise SystemExit('Only explicit HTTPS origins are accepted')
        try:
            with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
                response = client.get(origin + '/api/health/ready')
                payload = response.json()
                origin_response = client.get(origin + '/api/public/auth-status', params={'website_origin': origin})
                origin_allowed = origin_response.status_code == 200 and origin_response.json().get('origin_allowed') is True
                ready = response.status_code == 200 and payload.get('integration_ready') is True and origin_allowed
                results.append({'origin': origin, 'ready': ready, 'http_status': response.status_code,
                    'origin_allowed': origin_allowed,
                    'build': payload.get('build'), 'commit': payload.get('commit'),
                    'missing': {flow: data.get('issues', []) for flow, data in payload.get('flows', {}).items()},
                    'live_login_verified_by_this_check': False})
        except (httpx.HTTPError, ValueError):
            results.append({'origin': origin, 'ready': False, 'error': 'READINESS_UNAVAILABLE'})
    print(json.dumps(results, indent=2))
    return 0 if all(row['ready'] for row in results) else 1


if __name__ == '__main__':
    sys.exit(main())