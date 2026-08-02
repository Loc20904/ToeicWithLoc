import requests
import urllib.parse

def get_image_url(keyword: str, access_key: str = None) -> str:
    """Tìm kiếm hình ảnh chính xác dựa trên từ khóa từ vựng TOEIC.
    
    Quy trình đa tầng (Multi-tier image search):
    1. Unsplash Official Search API (nếu được cấp Key & chưa bị rate limit).
    2. Openverse Stock Photo API (miễn phí, chất lượng cao từ Flickr/Wikimedia).
    3. Wikipedia Page Summary API (hình ảnh minh họa cho khái niệm/danh từ).
    4. LoremFlickr Redirect Resolution (tải link ảnh tĩnh JPG thật).
    5. Fallback ảnh chuẩn Unsplash.
    """
    clean_term = keyword.split('(')[0].split('/')[0].strip()
    if not clean_term:
        clean_term = keyword.strip()
    
    encoded_term = urllib.parse.quote(clean_term)
    
    # 1. Thử dùng Unsplash API nếu có Key
    if access_key and access_key != "YOUR_UNSPLASH_ACCESS_KEY" and access_key.strip():
        url = f"https://api.unsplash.com/search/photos?query={encoded_term}&per_page=1&client_id={access_key.strip()}"
        try:
            response = requests.get(url, timeout=3)
            if response.status_code == 200:
                data = response.json()
                if data.get("results") and len(data["results"]) > 0:
                    return data["results"][0]["urls"]["regular"]
        except Exception as e:
            pass

    # 2. Openverse API
    try:
        ov_url = f"https://api.openverse.org/v1/images/?q={encoded_term}&page_size=3"
        r = requests.get(ov_url, headers={'User-Agent': 'TOEIC-App/1.0'}, timeout=3)
        if r.status_code == 200:
            data = r.json()
            results = data.get('results', [])
            for item in results:
                img_url = item.get('url') or item.get('thumbnail')
                if img_url and (img_url.startswith('http://') or img_url.startswith('https://')):
                    return img_url
    except Exception:
        pass

    # 3. Wikipedia Summary API
    try:
        w_term = clean_term.lower().replace(' ', '_')
        w_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(w_term)}"
        r = requests.get(w_url, headers={'User-Agent': 'TOEIC-App/1.0'}, timeout=3)
        if r.status_code == 200:
            data = r.json()
            if 'thumbnail' in data:
                return data['thumbnail']['source']
            elif 'originalimage' in data:
                return data['originalimage']['source']
    except Exception:
        pass

    # 4. LoremFlickr Redirect Resolution
    try:
        lf_url = f"https://loremflickr.com/600/400/{encoded_term}"
        res = requests.get(lf_url, allow_redirects=True, timeout=4)
        if res.status_code == 200 and res.url and "loremflickr.com" not in res.url:
            return res.url
    except Exception:
        pass

    # 5. Fallback mặc định
    return "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80"

