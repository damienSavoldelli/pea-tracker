"""Offline private capture CLI; no transport construction or external I/O."""
import argparse
from datetime import datetime
import hashlib
import json
import os
import stat

from .eodhd_http import RawEodhdResponse
from .model import CollectorError
from .provider_mapping import ProviderMapping
from .provider_observation import observe_response
from .provider_shadow import FeedPolicy


def _private_read(path, limit=131072):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise CollectorError("unsafe_observation_input")
        body = source.read(limit + 1)
        if len(body) > limit:
            raise CollectorError("observation_input_too_large")
        return body


def main(argv=None):
    """Emit only allowlisted shadow counts/decisions, never private quote rows."""
    parser = argparse.ArgumentParser(description="Replay an EODHD capture offline; no supplier call.", allow_abbrev=False)
    parser.add_argument("--policies", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--existing")
    parser.add_argument("--previous")
    args = parser.parse_args(argv)
    try:
        declarations = json.loads(_private_read(args.policies))
        policies = []
        for declaration in declarations:
            declaration = dict(declaration)
            mapping = ProviderMapping.parse(declaration.pop("mapping"))
            policies.append(FeedPolicy(mapping=mapping, **declaration))
        receipt = json.loads(_private_read(args.receipt))
        body = _private_read(args.body, 65536)
        if (receipt["state"] != "response_saved"
                or receipt["body_sha256"] != hashlib.sha256(body).hexdigest()
                or type(receipt["http_status"]) is not int or not 100 <= receipt["http_status"] <= 599
                or not isinstance(receipt["content_type"], str)):
            raise CollectorError("invalid_observation_receipt")
        received = datetime.fromisoformat(receipt["body_received_at"])
        existing = json.loads(_private_read(args.existing)) if args.existing else []
        previous = json.loads(_private_read(args.previous)) if args.previous else None
        result = observe_response(policies, RawEodhdResponse(receipt["http_status"], body, receipt["content_type"]),
                                  received, existing=existing, previous=previous)
        print(json.dumps(result["summary"], sort_keys=True))
        return 0
    except Exception:
        print(json.dumps({"event": "provider_shadow_rejected", "reason": "invalid_private_capture_or_policy"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
