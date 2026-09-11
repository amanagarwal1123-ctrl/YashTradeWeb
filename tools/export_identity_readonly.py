"""Explicitly invoked private identity export. NEVER called by website startup/API.

Requires IDENTITY_EXPORT_READONLY_MONGO_URL, original DB_NAME and an absolute
IDENTITY_EXPORT_DIR outside the website repository. Only .find/.count are used.
No reconciliation, normalization, verification inference or account mutation.
"""
import json
import os
import stat
from datetime import datetime
from pathlib import Path
from pymongo import MongoClient

IDENTITY_COLLECTIONS = ('customers', 'staff_users')
REFERENCE_COLLECTIONS = ('admin_sessions', 'deletion_requests', 'bff_sessions', 'bff_drafts', 'bff_outbox', 'bff_cache')
FIELDS = ('phone', 'live_user_id', 'canonical_user_id', 'phone_verified', 'verified_at', 'role', 'account_status', 'created_at', 'updated_at')


def scalar(value):
    return value.isoformat() if isinstance(value, datetime) else value


def export_row(collection, doc):
    # _id is ONLY used for the required private source record_id string.
    # A website id/role never becomes a canonical id/role grant.
    canonical = doc.get('canonical_user_id') or doc.get('live_user_id')
    return {'collection': collection, 'record_id': str(doc.get('id') or doc['_id']),
            'canonical_user_id': str(canonical) if canonical is not None else None,
            'phone': doc.get('phone'),
            'phone_verified': doc.get('phone_verified') if isinstance(doc.get('phone_verified'), bool) else None,
            **{k: scalar(doc.get(k)) for k in ('verified_at', 'role', 'account_status', 'created_at', 'updated_at')}}


def private_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)


def main():
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / 'backend' / '.env')
    supplied_directory = Path(os.environ['IDENTITY_EXPORT_DIR'])
    directory = supplied_directory.resolve()
    if not supplied_directory.is_absolute() or directory == root or root in directory.parents:
        raise RuntimeError('Export directory must be private and outside the repository/served website')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if stat.S_IMODE(directory.stat().st_mode) & 0o077:
        raise RuntimeError('Export directory permissions must be0700')
    client = MongoClient(os.environ['IDENTITY_EXPORT_READONLY_MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    rows, manifest = [], {'collections': {}, 'references': {}, 'reconciliation': 'NOT_RUN'}
    for coll in IDENTITY_COLLECTIONS:
        documents = db[coll].find({}, {k: 1 for k in ('_id', 'id', *FIELDS)})
        items = [export_row(coll, d) for d in documents]
        rows.extend(items)
        manifest['collections'][coll] = {'records': len(items), 'stored_canonical_links': sum(r['canonical_user_id'] is not None for r in items)}
    for coll in REFERENCE_COLLECTIONS:
        manifest['references'][coll] = {'records': db[coll].count_documents({}),
            'live_user_id_references': db[coll].count_documents({'live_user_id': {'$exists': True}}),
            'canonical_user_id_references': db[coll].count_documents({'canonical_user_id': {'$exists': True}})}
    private_json(directory / 'identity-export.json', rows)
    private_json(directory / 'count-manifest.json', manifest)
    notes = ('PRIVATE RECONCILIATION INPUT; no changes authorized. Preserve source phone formatting. '
             'Legacy status is overloaded (enrollment state/staff state) and is deliberately NOT mapped '
             'to account_status. Unknown verification and dates remain null. Only explicitly stored '
             'live_user_id/canonical_user_id are linked. Owner target9999813334 must retain its existing '
             'canonical ID/history; website-local admin is NOT approval to promote/merge. Require '
             'restorable backup, exact conflict report hash and per-ID owner approval before any write. '
             'Transfer using restricted channel; define recipient/access/retention and destroy working '
             'copies according to approved retention after reconciliation. No export is a backup.')
    fd = os.open(directory / 'PRIVATE_RECONCILIATION_NOTES.txt', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(notes)
    client.close()
    print(json.dumps(manifest))  # Only counts, no identities or secret values.


if __name__ == '__main__':
    main()