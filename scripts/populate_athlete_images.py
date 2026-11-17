import urllib.request
import io
import base64
import json
from PIL import Image

KNOWN_URLS = {
    # Kevin Quiambao (Basketball)
    "JSnT46ObzENZSZvGRJta54dK3og1": "https://upload.wikimedia.org/wikipedia/commons/7/79/Kevin_Quiambao_%28cropped%2C_2024%29.webp",
    # Thirdy Ravena (Basketball)
    "PB9XZyCMr5VdllbuHrSPCno1UGM2": "https://upload.wikimedia.org/wikipedia/commons/7/75/Thirdy_Ravena.jpg",
    # Dwight Ramos (Basketball)
    "XSJ8y261fzT704MYyw8d0tgw50f2": "https://upload.wikimedia.org/wikipedia/commons/3/3f/Dwight_Ramos.jpg",
    # EJ Obiena (Track & Field)
    "i8GhjKihDdMaVMhsZH6SvW9e0wm1": "https://upload.wikimedia.org/wikipedia/commons/6/6c/Ernest_Obiena_2019_%28cropped%29.jpeg",
    # Kayla Sanchez (Swimming)
    "2cgkfyTqEVOIijykaKJTr9fsrta2": "https://upload.wikimedia.org/wikipedia/commons/e/e1/Kayla_Sanchez.jpg",
    # Alyssa Valdez (Volleyball)
    "gZIiuL8RLsbxYOxJVmw2ZmrSYJ82": "https://upload.wikimedia.org/wikipedia/commons/d/d7/Alyssa_Valdez.jpg",
    # Jia Morado (Volleyball)
    "WMq0nKBbsFRIePuK70WPK8xah9w1": "https://upload.wikimedia.org/wikipedia/commons/8/89/Jia_morado_in_2026.png",
}

def download_and_crop(url):
    req = urllib.request.Request(url, headers={"User-Agent": "AtletaApp/1.0 (contact@atleta.ph)"})
    with urllib.request.urlopen(req, timeout=12) as resp:
        data = resp.read()
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    min_d = min(w, h)
    left = (w - min_d) // 2
    top = (h - min_d) // 2
    im = im.crop((left, top, left + min_d, top + min_d)).resize((160, 160), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("utf-8")

def get_ui_avatar(name, sport=""):
    # Sport color themes
    color = "0284C7" # default cyan/blue
    sport_upper = (sport or "").upper()
    if "BASKET" in sport_upper:
        color = "EA580C" # orange
    elif "VOLLEY" in sport_upper:
        color = "8B5CF6" # purple
    elif "TRACK" in sport_upper or "FIELD" in sport_upper:
        color = "10B981" # emerald
    elif "SWIM" in sport_upper:
        color = "0284C7" # ocean blue
        
    encoded = urllib.parse.quote(name)
    url = f"https://ui-avatars.com/api/?name={encoded}&background={color}&color=FFFFFF&size=160&bold=true"
    req = urllib.request.Request(url, headers={"User-Agent": "AtletaApp/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
    im = Image.open(io.BytesIO(data)).convert("RGB")
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("utf-8")

if __name__ == "__main__":
    results = {}
    for uid, url in KNOWN_URLS.items():
        try:
            print(f"Fetching real photo for {uid}...")
            b64 = download_and_crop(url)
            results[uid] = b64
            print(f"  OK: {len(b64)} chars")
        except Exception as e:
            print(f"  Failed: {e}")

    with open("/home/gerard/Desktop/School/Atleta-dev_test_branch/Backend/scripts/athlete_avatars_cache.json", "w") as f:
        json.dump(results, f)
    print("Saved athlete_avatars_cache.json")

