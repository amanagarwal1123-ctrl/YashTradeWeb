"""MSG91 SMS transport layer for Yash Ornaments enrollment.

Uses the MSG91 FLOW API with the account's DLT-approved flow template
("Login OTP", sender YSILVR). Flow template text:
  "Welcome to Yash Ornaments. Your OTP for login is ##otp##. Valid for 10 Minutes. ..."
  -> variable key: otp

IMPORTANT (learned the hard way):
  * MSG91's flow endpoints return {"type":"success"} + a request id even for an
    INVALID authkey or INVALID template (validation is asynchronous and NOT
    consistent between calls). Such messages are then dropped with NO entry in the
    MSG91 dashboard log at all - the classic "OTP sent but nothing arrives".
  * https://api.msg91.com/api/v5/flow/ validates synchronously MORE often than
    https://control.msg91.com/api/v5/flow, so it is our primary endpoint; the
    control host is only a fallback for network-level failures.
  * The ONLY reliable way to know the config is right is the flow-detail API
    (GET /api/v5/flows/{id}) which requires a valid authkey and returns the DLT
    status of the template -> we run it as a cached PRE-FLIGHT before sending.
  * The ONLY reliable way to know a message went out is the log API
    (POST /api/v5/report/logs/sms {requestId}) -> we poll it after each send and
    store the real operator status (Delivered / Failed / not logged = dropped).
"""
import os
import time
import asyncio
import logging

import httpx

logger = logging.getLogger("yash.sms")


def _env(name: str, default: str = "") -> str:
    """Read an env var and strip stray whitespace / quotes that sometimes leak in
    from deployment consoles (a quoted authkey is silently rejected by MSG91)."""
    return (os.environ.get(name) or default).strip().strip('"').strip("'").strip()


MSG91_AUTHKEY = _env("MSG91_AUTHKEY")
MSG91_TEMPLATE_ID = _env("MSG91_TEMPLATE_ID")
MSG91_PRIMARY_URL = _env("MSG91_FLOW_URL", "https://api.msg91.com/api/v5/flow/")
MSG91_FALLBACK_URL = _env("MSG91_FLOW_FALLBACK_URL", "https://control.msg91.com/api/v5/flow")
MSG91_FLOW_DETAIL_URL = "https://control.msg91.com/api/v5/flows/{template_id}"
MSG91_LOGS_URL = "https://control.msg91.com/api/v5/report/logs/sms"
SMS_TIMEOUT_SECONDS = 20
PREFLIGHT_CACHE_SECONDS = 300  # a passing authkey/template check is trusted for 5 minutes

# Provider messages that are definitive (retrying / falling back will not help)
_NON_RETRYABLE_MARKERS = ("authkey", "token", "template", "sender", "dlt", "invalid", "missing")

_preflight_cache: dict = {"at": 0.0, "result": None}


def sms_config_status() -> dict:
    """Non-secret snapshot of the SMS configuration of THIS running backend."""
    return {
        "provider": "MSG91 Flow API",
        "ready": bool(MSG91_AUTHKEY and MSG91_TEMPLATE_ID),
        "authkey_configured": bool(MSG91_AUTHKEY),
        "authkey_hint": f"{MSG91_AUTHKEY[:4]}…{MSG91_AUTHKEY[-3:]}" if len(MSG91_AUTHKEY) >= 8 else ("set" if MSG91_AUTHKEY else None),
        "template_configured": bool(MSG91_TEMPLATE_ID),
        "template_id": MSG91_TEMPLATE_ID or None,
        "primary_endpoint": MSG91_PRIMARY_URL,
        "fallback_endpoint": MSG91_FALLBACK_URL,
    }


def _parse(r: httpx.Response) -> dict:
    try:
        data = r.json()
        if not isinstance(data, dict):
            data = {"raw": str(data)[:300]}
    except Exception:
        data = {"raw": (r.text or "")[:300]}
    return data


def _is_retryable(http_status: int, message: str) -> bool:
    if http_status >= 500 or http_status == 429:
        return True
    low = (message or "").lower()
    return not any(m in low for m in _NON_RETRYABLE_MARKERS)


async def send_otp_sms(phone10: str, otp: str, expiry_minutes: int = 10) -> dict:
    """Send a 4-digit OTP SMS via the MSG91 Flow API.

    Returns a structured result and NEVER raises:
      {sent: bool, request_id?: str, endpoint?: str, http_status?: int,
       error?: str, error_detail?: str, provider_response?: dict, attempts: int}
    error codes: sms_not_configured | provider_rejected | provider_timeout | provider_unreachable
    """
    if not MSG91_AUTHKEY or not MSG91_TEMPLATE_ID:
        missing = [k for k, v in (("MSG91_AUTHKEY", MSG91_AUTHKEY), ("MSG91_TEMPLATE_ID", MSG91_TEMPLATE_ID)) if not v]
        logger.error("MSG91 not configured - missing %s - SMS not sent", ",".join(missing))
        return {"sent": False, "error": "sms_not_configured",
                "error_detail": f"Backend environment is missing: {', '.join(missing)}", "attempts": 0}

    # PRE-FLIGHT: MSG91 happily "accepts" sends with a wrong authkey/template and
    # then drops them silently. Verify the configuration deterministically first.
    pre = await preflight_provider_check()
    if pre["ok"] is False:
        logger.error("MSG91 pre-flight failed - SMS not sent: %s", pre["error"])
        return {"sent": False, "error": "config_invalid", "error_detail": pre["error"], "attempts": 0}

    payload = {
        "template_id": MSG91_TEMPLATE_ID,
        "short_url": "0",
        "realTimeResponse": "1",
        "recipients": [{"mobiles": f"91{phone10}", "otp": otp}],
    }
    headers = {"authkey": MSG91_AUTHKEY, "Content-Type": "application/json", "Accept": "application/json"}

    endpoints = [MSG91_PRIMARY_URL]
    if MSG91_FALLBACK_URL and MSG91_FALLBACK_URL != MSG91_PRIMARY_URL:
        endpoints.append(MSG91_FALLBACK_URL)

    last: dict = {"sent": False, "error": "provider_unreachable", "error_detail": "no attempt made", "attempts": 0}
    attempts = 0
    for idx, url in enumerate(endpoints):
        attempts += 1
        try:
            async with httpx.AsyncClient(timeout=SMS_TIMEOUT_SECONDS) as client:
                r = await client.post(url, json=payload, headers=headers)
            data = _parse(r)
            msg = str(data.get("message") or data.get("raw") or "")
            if r.status_code == 200 and data.get("type") == "success":
                logger.info("MSG91 sms accepted for ******%s request_id=%s via %s", phone10[-4:], msg, url)
                return {"sent": True, "request_id": msg, "endpoint": url, "http_status": r.status_code,
                        "provider_response": data, "attempts": attempts}
            last = {"sent": False, "error": "provider_rejected", "error_detail": msg[:300] or f"HTTP {r.status_code}",
                    "endpoint": url, "http_status": r.status_code, "provider_response": data, "attempts": attempts}
            logger.error("MSG91 rejected sms for ******%s via %s status=%s body=%s", phone10[-4:], url, r.status_code, str(data)[:300])
            if not _is_retryable(r.status_code, msg):
                break  # config problem - falling back to the lenient host would only hide it
        except httpx.TimeoutException as e:
            last = {"sent": False, "error": "provider_timeout", "error_detail": f"Timeout after {SMS_TIMEOUT_SECONDS}s contacting {url}",
                    "endpoint": url, "attempts": attempts}
            logger.error("MSG91 timeout via %s: %s", url, e)
        except Exception as e:
            last = {"sent": False, "error": "provider_unreachable", "error_detail": f"{type(e).__name__}: {str(e)[:200]}",
                    "endpoint": url, "attempts": attempts}
            logger.error("MSG91 unreachable via %s: %s", url, e)
        if idx < len(endpoints) - 1:
            await asyncio.sleep(0.5)
    return last


async def check_msg91_connectivity() -> dict:
    """Validate authkey + flow template FROM THIS ENVIRONMENT without sending an SMS.
    Uses the flow-detail API which requires a valid authkey and returns the
    template's DLT approval status. Never raises."""
    status = sms_config_status()
    result = {"config": status, "reachable": False, "authkey_valid": None, "template": None, "error": None}
    if not status["ready"]:
        result["error"] = "MSG91_AUTHKEY / MSG91_TEMPLATE_ID missing in backend environment"
        return result
    url = MSG91_FLOW_DETAIL_URL.format(template_id=MSG91_TEMPLATE_ID)
    try:
        async with httpx.AsyncClient(timeout=SMS_TIMEOUT_SECONDS) as client:
            r = await client.get(url, headers={"authkey": MSG91_AUTHKEY, "Accept": "application/json"})
        result["reachable"] = True
        data = _parse(r)
        body = data.get("data") if isinstance(data.get("data"), dict) else None
        ok = r.status_code == 200 and str(data.get("msg_type", data.get("type", ""))).lower() == "success" and body
        if ok:
            result["authkey_valid"] = True
            result["template"] = {
                "name": body.get("FlowName"),
                "sender_id": body.get("Sender"),
                "status": body.get("Status"),
                "state": body.get("FlowState"),
                "dlt_template_id": body.get("DLT_TE_ID"),
                "message": body.get("Message"),
                "variables": body.get("MessageVariable"),
            }
            if str(body.get("Status", "")).lower() != "approved" or str(body.get("FlowState", "")).lower() != "enabled":
                result["error"] = f"Template is {body.get('Status')} / {body.get('FlowState')} - it must be Approved and Enabled in MSG91."
        else:
            msg = str(data.get("message") or data.get("msg") or data.get("raw") or f"HTTP {r.status_code}")
            low = msg.lower()
            result["authkey_valid"] = False if ("authkey" in low or "token" in low or "unauth" in low or r.status_code in (401, 403)) else None
            result["error"] = msg[:300]
    except httpx.TimeoutException:
        result["error"] = f"Timeout after {SMS_TIMEOUT_SECONDS}s contacting MSG91"
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {str(e)[:200]}"
    return result


async def preflight_provider_check(force: bool = False) -> dict:
    """Cached deterministic validation of authkey + template.
    Returns {ok: True|False|None, error, checked_at, cached}. ok=None means MSG91
    was unreachable so we could not tell (sending is still attempted then)."""
    now = time.monotonic()
    cached = _preflight_cache["result"]
    if not force and cached and cached.get("ok") is True and now - _preflight_cache["at"] < PREFLIGHT_CACHE_SECONDS:
        return {**cached, "cached": True}
    check = await check_msg91_connectivity()
    if not check["reachable"]:
        result = {"ok": None, "error": check["error"], "cached": False}
    elif check["authkey_valid"] is True and not check["error"]:
        result = {"ok": True, "error": None, "cached": False}
    else:
        result = {"ok": False, "error": check["error"] or "MSG91 rejected the configured authkey/template", "cached": False}
    result["checked_at"] = time.time()
    _preflight_cache["at"] = now
    _preflight_cache["result"] = result
    return result


async def fetch_delivery_status(request_id: str) -> dict:
    """Ask MSG91's log API what really happened to a request id.
    Returns {found: bool, status?, status_code?, delivered_at?, failure_reason?, tel?, error?}.
    The OTP text (msgData) is deliberately NOT returned. Never raises."""
    if not MSG91_AUTHKEY or not request_id:
        return {"found": False, "error": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=SMS_TIMEOUT_SECONDS) as client:
            r = await client.post(MSG91_LOGS_URL, json={"requestId": request_id},
                                  headers={"authkey": MSG91_AUTHKEY, "Content-Type": "application/json", "Accept": "application/json"})
        data = _parse(r)
        rows = data.get("data") if isinstance(data.get("data"), list) else None
        if rows is None:
            return {"found": False, "error": str(data.get("message") or data.get("errors") or data.get("raw") or f"HTTP {r.status_code}")[:200]}
        if not rows:
            return {"found": False}
        row = rows[0]
        delivered_at = None
        if row.get("deliveryDate") and row.get("deliveryTime"):
            delivered_at = f"{row['deliveryDate']} {row['deliveryTime']} IST"
        return {
            "found": True,
            "status": row.get("status"),
            "status_code": row.get("statusCode"),
            "sent_at": row.get("sentDateTime"),
            "delivered_at": delivered_at,
            "failure_reason": row.get("failureReason"),
            "tel": row.get("telNum"),
            "circle": row.get("telecomCircle"),
            "credit": row.get("credit"),
        }
    except httpx.TimeoutException:
        return {"found": False, "error": "timeout"}
    except Exception as e:
        return {"found": False, "error": f"{type(e).__name__}: {str(e)[:150]}"}


def friendly_sms_error(res: dict) -> str:
    """Human readable message for the end user / admin when an SMS could not be sent."""
    code = (res or {}).get("error")
    detail = (res or {}).get("error_detail") or ""
    if code == "sms_not_configured":
        return "OTP service is not configured on the server (MSG91 credentials missing). Please contact Yash Ornaments support."
    if code == "config_invalid":
        return f"OTP could not be sent - MSG91 rejected the server's SMS configuration ({detail[:120]}). Please contact Yash Ornaments support."
    if code == "provider_rejected":
        return f"OTP could not be sent - SMS provider rejected the request ({detail[:120]}). Please contact Yash Ornaments support."
    if code == "provider_timeout":
        return "OTP could not be sent - the SMS provider is taking too long to respond. Please try again in a moment."
    return "OTP could not be sent right now - the SMS provider is unreachable. Please try again in a moment."
