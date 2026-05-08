"""Screenshot capture for Imagen PWA documentation - mobile resolution.

API key is injected into Zustand localStorage before page navigation.
Then each page waits for content to render before capturing.
"""
import json
import os
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = "/work"
BASE = "https://imagen.angelatos.gr"
API_KEY = "change-332-production"
VIEWPORT = {"width": 375, "height": 667}
DEVICE_SCALE = 2
TEST_IMAGE = os.path.join(SCREENSHOT_DIR, "test-image.png")


def snap(page, name, full=False):
    path = os.path.join(SCREENSHOT_DIR, name)
    page.screenshot(path=path, full_page=full)
    size = os.path.getsize(path)
    print(f"  -> {name} ({size:,} bytes)")


def inject_api_key(page, key):
    """Inject API key into Zustand localStorage (imagen-settings key)."""
    settings = json.dumps({
        "state": {"apiBaseUrl": "", "apiKey": key, "theme": "system"},
        "version": 0,
    })
    # Pass JSON as arg to JS function — Playwright Python syntax
    page.evaluate("data => localStorage.setItem('imagen-settings', data)", settings)
    # Verify
    val = page.evaluate("() => localStorage.getItem('imagen-settings')")
    stored = json.loads(val) if val else None
    key_stored = stored["state"]["apiKey"] if stored else None
    print(f"  localStorage apiKey: {key_stored}")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport=VIEWPORT, device_scale_factor=DEVICE_SCALE, locale="en-US"
    )
    page = ctx.new_page()

    # Seed localStorage
    print("=== Seed localStorage ===")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(500)
    inject_api_key(page, API_KEY)
    # Reload so the SPA picks up the injected key
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(2000)

    # ── 1. Settings — verify connection ──
    print("=== 1. Settings Page ===")
    page.goto(f"{BASE}/settings", wait_until="networkidle")
    page.wait_for_timeout(1500)
    for btn in page.query_selector_all("button"):
        if "Test Connection" in (btn.text_content() or ""):
            btn.click()
            break
    page.wait_for_timeout(3000)
    try:
        page.wait_for_selector("text=Connected", timeout=5000)
        print("  Connection confirmed")
    except:
        print("  WARNING: connection not confirmed")
    snap(page, "01-settings.png", full=True)

    # ── 2. Capture — wait for prompts ──
    print("=== 2. Capture — Prompt Selection ===")
    page.goto(f"{BASE}/capture", wait_until="networkidle")
    page.wait_for_timeout(2000)
    try:
        page.wait_for_selector('button:has(h3)', timeout=10000)
        print("  Prompts loaded")
    except:
        print("  WARNING: prompts didn't load")
    page.wait_for_timeout(1000)
    snap(page, "02-capture-prompts.png", full=True)

    # ── 3. Click "Image Description" ──
    print("=== 3. Capture — Prompt Selected ===")
    for btn in page.query_selector_all("button"):
        text = btn.text_content() or ""
        if "Image Description" in text and "detailed" in text.lower():
            btn.click()
            print(f"  Clicked: {text[:80]}")
            break
    page.wait_for_timeout(2000)
    snap(page, "03-prompt-selected.png", full=True)

    # ── 4. Camera/gallery ──
    print("=== 4. Capture — Gallery Upload ===")
    for btn in page.query_selector_all("button"):
        text = btn.text_content() or ""
        if "Open Camera" in text or "Ready" in text:
            btn.click()
            print(f"  Clicked: {text[:80]}")
            break
    page.wait_for_timeout(4000)

    # Debug page state
    body = (page.text_content("body") or "")[:300]
    print(f"  Page text: {body}")

    # Try file input directly
    fi = page.query_selector('input[type="file"]')
    if fi:
        fi.set_input_files(TEST_IMAGE)
        print("  Uploaded via file input")
    else:
        # Try gallery button → file chooser
        gbtn = None
        for btn in page.query_selector_all("button"):
            if "choose from gallery" in (btn.text_content() or "").lower():
                gbtn = btn
                break
        if gbtn:
            with page.expect_file_chooser(timeout=10000) as fc:
                gbtn.click()
            fc.value.set_files(TEST_IMAGE)
            print("  Uploaded via file chooser")
        else:
            print("  ERROR: no upload found")

    page.wait_for_timeout(4000)
    try:
        page.wait_for_selector("text=Processing", timeout=15000)
    except:
        pass
    page.wait_for_timeout(1000)
    snap(page, "04-processing.png", full=True)

    # ── 5. Result ──
    print("=== 5. Capture — Result ===")
    try:
        page.wait_for_selector("text=completed", timeout=120000)
        print("  Job completed")
    except:
        print("  (timeout waiting for completion)")
    page.wait_for_timeout(2000)
    snap(page, "05-result.png", full=True)

    # ── 6. Prompts ──
    print("=== 6. Prompts Page ===")
    page.goto(f"{BASE}/prompts", wait_until="networkidle")
    page.wait_for_timeout(2000)
    snap(page, "06-prompts.png", full=True)

    # ── 7. Jobs ──
    print("=== 7. Jobs Page ===")
    page.goto(f"{BASE}/jobs", wait_until="networkidle")
    page.wait_for_timeout(2000)
    snap(page, "07-jobs.png", full=True)

    # ── 8. Jobs completed ──
    print("=== 8. Jobs — Completed ===")
    for btn in page.query_selector_all("button"):
        if (btn.text_content() or "").strip().lower() == "completed":
            btn.click()
            break
    page.wait_for_timeout(1500)
    snap(page, "08-jobs-completed.png", full=True)

    browser.close()
    print("\nDone!")
    for f in sorted(os.listdir(SCREENSHOT_DIR)):
        if f.endswith(".png"):
            print(f"  {f}")