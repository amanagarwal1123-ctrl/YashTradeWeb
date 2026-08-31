"""MSG91 SMS transport layer for Yash Ornaments enrollment.
Proven in POC: v5 OTP API works with authkey alone (default template).
If MSG91_TEMPLATE_ID is configured it is included in the request.
"""
import os
import logging
import httpx

logger = logging.getLogger("yash.sms")

MSG91_AUTHKEY = os.environ.get("MSG91_AUTHKEY", "")
MSG91_SEND_URL = os.environ.get("MSG91_SEND_URL", "https://control.msg91.com/api/v5/otp")
MSG91_TEMPLATE_ID = (os.environ.get("MSG91_TEMPLATE_ID") or "").strip()


async def send_otp_sms(phone10: str, otp: str, expiry_minutes: int = 5) -> dict:
    """Send a 4-digit OTP SMS via MSG91. Returns {sent: bool, ...}. Never raises."""
    if not MSG91_AUTHKEY:
        logger.error("MSG91_AUTHKEY missing - SMS not sent")
        return {"sent": False, "error": "sms_not_configured"}
    params = {
        "authkey": MSG91_AUTHKEY,
        "mobile": f"91{phone10}",
        "otp": otp,
        "otp_expiry": expiry_minutes,
    }
    if MSG91_TEMPLATE_ID:
        params["template_id"] = MSG91_TEMPLATE_ID
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(MSG91_SEND_URL, params=params)
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text[:200]}
        ok = data.get("type") == "success"
        if ok:
            logger.info("MSG91 OTP sms queued for ******%s request_id=%s", phone10[-4:], data.get("request_id"))
        else:
            logger.error("MSG91 send failed status=%s body=%s", r.status_code, str(data)[:300])
        return {"sent": ok, "request_id": data.get("request_id")}
    except Exception as e:
        logger.error("MSG91 send exception: %s", e)
        return {"sent": False, "error": "provider_unreachable"}
