"""MSG91 SMS transport layer for Yash Ornaments enrollment.

Uses the MSG91 FLOW API with the account's DLT-approved flow template
("Login OTP", sender YSILVR): the same delivery route the existing
yashornaments.in website uses successfully.

Flow template text: "Welcome to Yash Ornaments. Your OTP for login is
##otp##. Valid for 10 Minutes. ..." -> variable key: otp
"""
import os
import logging
import httpx

logger = logging.getLogger("yash.sms")

MSG91_AUTHKEY = os.environ.get("MSG91_AUTHKEY", "")
MSG91_FLOW_URL = os.environ.get("MSG91_FLOW_URL", "https://control.msg91.com/api/v5/flow")
MSG91_TEMPLATE_ID = (os.environ.get("MSG91_TEMPLATE_ID") or "").strip()


async def send_otp_sms(phone10: str, otp: str, expiry_minutes: int = 10) -> dict:
    """Send a 4-digit OTP SMS via the MSG91 Flow API. Returns {sent: bool, ...}. Never raises."""
    if not MSG91_AUTHKEY or not MSG91_TEMPLATE_ID:
        logger.error("MSG91 not configured (authkey/template missing) - SMS not sent")
        return {"sent": False, "error": "sms_not_configured"}
    payload = {
        "template_id": MSG91_TEMPLATE_ID,
        "realTimeResponse": "1",
        "recipients": [{"mobiles": f"91{phone10}", "otp": otp}],
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                MSG91_FLOW_URL,
                json=payload,
                headers={"authkey": MSG91_AUTHKEY, "Content-Type": "application/json"},
            )
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text[:200]}
        ok = r.status_code == 200 and data.get("type") == "success"
        if ok:
            logger.info("MSG91 flow sms queued for ******%s ref=%s", phone10[-4:], data.get("message"))
        else:
            logger.error("MSG91 flow send failed status=%s body=%s", r.status_code, str(data)[:300])
        return {"sent": ok, "ref": data.get("message")}
    except Exception as e:
        logger.error("MSG91 flow send exception: %s", e)
        return {"sent": False, "error": "provider_unreachable"}
