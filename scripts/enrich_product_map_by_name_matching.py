# scripts/enrich_product_map_by_name_matching.py
import json
import os
import pathlib
from pymongo import MongoClient
import re # Để chuẩn hóa tên

# --- ĐỊNH NGHĨA ĐƯỜNG DẪN ---
PROJECT_ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = PROJECT_ROOT_DIR / "python_recommender_artifacts"
PRODUCT_MAP_JSON_FILE = ARTIFACTS_DIR / 'product_id_name_map_v2_adv.json' # File gốc từ crawl
ENRICHED_PRODUCT_MAP_JSON_FILE = ARTIFACTS_DIR / 'product_id_name_map_v2_adv_enriched_with_mongo_id.json'

# --- Cấu hình MongoDB ---
MONGO_URI = "mongodb://localhost:27017/"
MONGO_DATABASE_NAME = "ocop_store"
MONGO_PRODUCTS_COLLECTION = "products"

def normalize_name(name):
    """Chuẩn hóa tên sản phẩm để tăng khả năng khớp."""
    if not isinstance(name, str):
        return ""
    name = name.lower().strip()
    # Bỏ các ký tự đặc biệt, dấu câu không cần thiết, có thể giữ lại số
    name = re.sub(r'[^\w\s\d-]', '', name) # Giữ chữ, số, khoảng trắng, gạch ngang
    name = re.sub(r'\s+', ' ', name) # Chuẩn hóa nhiều khoảng trắng thành một
    return name

def enrich_map_by_name_matching():
    if not PRODUCT_MAP_JSON_FILE.exists():
        print(f"LỖI: Không tìm thấy file map gốc: {PRODUCT_MAP_JSON_FILE}")
        return

    print(f"Đang đọc file map gốc: {PRODUCT_MAP_JSON_FILE}...")
    with open(PRODUCT_MAP_JSON_FILE, 'r', encoding='utf-8') as f:
        product_map_from_crawl = json.load(f) # Key là original_id (crawl_id), value là chi tiết
    
    if not product_map_from_crawl:
        print("File map gốc rỗng.")
        return

    print(f"Đang kết nối tới MongoDB: {MONGO_URI}...")
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DATABASE_NAME]
    products_collection = db[MONGO_PRODUCTS_COLLECTION]
    print(f"Đã kết nối tới DB: '{MONGO_DATABASE_NAME}', Collection: '{MONGO_PRODUCTS_COLLECTION}'.")

    # Lấy tất cả sản phẩm từ MongoDB với các trường cần thiết để khớp
    # Lấy _id và name (hoặc full_name nếu nó khớp tốt hơn với dữ liệu crawl)
    print("Đang lấy dữ liệu tên và _id từ MongoDB...")
    mongo_products_list = list(products_collection.find({}, {"_id": 1, "name": 1, "full_name": 1})) # Thêm full_name nếu có
    
    # Tạo một lookup table từ tên đã chuẩn hóa (từ MongoDB) sang _id
    mongo_name_to_id_lookup = {}
    for mongo_prod in mongo_products_list:
        mongo_name_norm = normalize_name(mongo_prod.get("name"))
        mongo_full_name_norm = normalize_name(mongo_prod.get("full_name")) # Nếu có full_name
        
        if mongo_name_norm and mongo_name_norm not in mongo_name_to_id_lookup: # Ưu tiên name
            mongo_name_to_id_lookup[mongo_name_norm] = str(mongo_prod["_id"])
        if mongo_full_name_norm and mongo_full_name_norm not in mongo_name_to_id_lookup: # Sau đó đến full_name
             mongo_name_to_id_lookup[mongo_full_name_norm] = str(mongo_prod["_id"])


    print(f"Đã tạo lookup table với {len(mongo_name_to_id_lookup)} tên chuẩn hóa từ MongoDB.")

    enriched_map = {}
    found_mongo_id_count = 0
    not_found_count = 0

    for crawl_id_key, details_from_crawl in product_map_from_crawl.items():
        enriched_details = details_from_crawl.copy()
        
        crawl_name = details_from_crawl.get("name")
        crawl_full_name = details_from_crawl.get("full_name") # Nếu file map của bạn có full_name

        crawl_name_norm = normalize_name(crawl_name)
        crawl_full_name_norm = normalize_name(crawl_full_name)

        mongo_db_id = None
        # Thử khớp bằng tên đã chuẩn hóa
        if crawl_name_norm and crawl_name_norm in mongo_name_to_id_lookup:
            mongo_db_id = mongo_name_to_id_lookup[crawl_name_norm]
        elif crawl_full_name_norm and crawl_full_name_norm in mongo_name_to_id_lookup: # Thử khớp full_name
            mongo_db_id = mongo_name_to_id_lookup[crawl_full_name_norm]
        # Bạn có thể thêm các logic khớp phức tạp hơn ở đây nếu cần (ví dụ: fuzzy matching)

        if mongo_db_id:
            enriched_details["_id"] = mongo_db_id # Thêm MongoDB ObjectId
            found_mongo_id_count += 1
        else:
            enriched_details["_id"] = None # Hoặc một giá trị placeholder
            print(f"CẢNH BÁO: Không tìm thấy _id trong MongoDB cho sản phẩm crawl_id: {crawl_id_key} (Tên: {crawl_name}) bằng cách khớp tên.")
            not_found_count += 1
        
        enriched_map[crawl_id_key] = enriched_details
    
    client.close()

    print(f"Đang ghi file map đã làm giàu vào: {ENRICHED_PRODUCT_MAP_JSON_FILE}...")
    with open(ENRICHED_PRODUCT_MAP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(enriched_map, f, ensure_ascii=False, indent=2)
    
    print("Hoàn tất làm giàu file map!")
    print(f"  - Số sản phẩm được thêm MongoDB _id: {found_mongo_id_count}")
    print(f"  - Số sản phẩm không tìm thấy _id tương ứng trong MongoDB: {not_found_count}")

if __name__ == "__main__":
    enrich_map_by_name_matching()