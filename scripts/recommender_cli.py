import os
import json
import argparse
import traceback
import pathlib # Để xử lý đường dẫn tương đối tốt hơn

# --- ĐỊNH NGHĨA ĐƯỜNG DẪN ĐẾN THƯ MỤC ARTIFACTS ---
# Script này sẽ được gọi từ thư mục gốc của dự án Node.js
# Nên đường dẫn tương đối sẽ dựa trên đó.
# Hoặc bạn có thể dùng đường dẫn tuyệt đối.
PROJECT_ROOT_DIR = pathlib.Path(__file__).parent.parent.resolve() 
ARTIFACTS_DIR = PROJECT_ROOT_DIR / "python_recommender_artifacts"
# Giả sử thư mục python_recommender_artifacts nằm cùng cấp với recommender_cli.py
# Nếu khác, bạn cần điều chỉnh đường dẫn này.
# Ví dụ, nếu recommender_cli.py nằm trong project-nodejs/scripts/
# và artifacts ở project-nodejs/python_recommender_artifacts/
# ARTIFACTS_DIR = pathlib.Path(__file__).parent.parent.resolve() / "python_recommender_artifacts"


PRODUCT_MAP_JSON_FILE = ARTIFACTS_DIR / 'product_id_name_map_v2_adv.json'
PRECOMPUTED_RECS_JSON_FILE = ARTIFACTS_DIR / 'precomputed_recommendations_v2_raw_adv.json'

# Nếu bạn muốn tính lại score, thêm các file này và logic tương ứng
COSINE_SIM_MATRIX_FILE = ARTIFACTS_DIR / 'cosine_similarity_matrix_v2_adv.npy'
INDICES_MAP_FILE = ARTIFACTS_DIR / 'product_indices_map_v2_adv.pkl'

TOP_N_FINAL_RECS = 10

def safe_int_convert(value):
    try: return int(float(value))
    except: return None

def get_recommendations_from_precomputed(product_id_input, top_n=TOP_N_FINAL_RECS):
    # ... (Copy code hàm get_recommendations_from_precomputed_files từ câu trả lời trước)
    # Đảm bảo nó sử dụng PRODUCT_MAP_JSON_FILE và PRECOMPUTED_RECS_JSON_FILE đã định nghĩa ở trên
    product_map = None
    precomputed_recs = None

    if not os.path.exists(PRODUCT_MAP_JSON_FILE):
        return {"error": f"Product map file not found: {PRODUCT_MAP_JSON_FILE}"}
    if not os.path.exists(PRECOMPUTED_RECS_JSON_FILE):
        return {"error": f"Precomputed recommendations file not found: {PRECOMPUTED_RECS_JSON_FILE}"}

    try:
        with open(PRODUCT_MAP_JSON_FILE, 'r', encoding='utf-8') as f:
            product_map = json.load(f)
        with open(PRECOMPUTED_RECS_JSON_FILE, 'r', encoding='utf-8') as f:
            precomputed_recs = json.load(f)
    except Exception as e:
        return {"error": f"Failed to load JSON files: {str(e)}", "trace": traceback.format_exc()}

    product_id_str_input = str(product_id_input)
    product_id_int_input = safe_int_convert(product_id_input)

    if product_id_int_input is None:
        return {"error": f"Invalid Product ID format: '{product_id_input}'."}

    recommended_ids_int_list = precomputed_recs.get(product_id_str_input)

    if recommended_ids_int_list is None:
        if product_id_str_input not in product_map:
            return {"error": f"Product ID {product_id_str_input} not found in product data."}
        else:
            return {"error": f"No precomputed recommendations for Product ID {product_id_str_input}."}
    
    if not recommended_ids_int_list:
        return {"product_id_input": product_id_int_input, "recommendations": []}

    recommendations = []
    count = 0
    for rec_id_int in recommended_ids_int_list:
        if count >= top_n: break
        rec_id_str = str(rec_id_int)
        rec_details = product_map.get(rec_id_str)
        if rec_details:
            recommendation_item = {
                "product_id": rec_id_int,
                "name": rec_details.get("name", "N/A"),
                "price": rec_details.get("price", 0),
                "image_url": rec_details.get("image_url", ""),
                "product_url": rec_details.get("product_url", ""),
                # Thêm các trường khác nếu cần
            }
            recommendations.append(recommendation_item)
            count += 1
    return {"product_id_input": product_id_int_input, "recommendations": recommendations}
    
# --- HÀM LẤY DANH SÁCH SẢN PHẨM (PHÂN TRANG) - Giữ nguyên như trước ---
def get_products_from_files(page=1, per_page=20):
    # ... (Copy code hàm get_products_from_files từ câu trả lời trước)
    # Đảm bảo nó sử dụng PRODUCT_MAP_JSON_FILE đã định nghĩa ở trên
    if not os.path.exists(PRODUCT_MAP_JSON_FILE):
        return {"error": f"Product map file not found: {PRODUCT_MAP_JSON_FILE}"}
    try:
        with open(PRODUCT_MAP_JSON_FILE, 'r', encoding='utf-8') as f:
            product_map = json.load(f)
        
        all_products_list = []
        for id_str, details in product_map.items():
            product_item = {"product_id": safe_int_convert(id_str)}
            product_item.update(details)
            all_products_list.append(product_item)

        total_products = len(all_products_list)
        start_index = (page - 1) * per_page
        end_index = start_index + per_page
        paginated_products = all_products_list[start_index:end_index]
        
        products_summary = []
        for p in paginated_products:
            products_summary.append({
                "product_id": p.get("product_id"), "name": p.get("name", "N/A"),
                "price": p.get("price", 0), "image_url": p.get("image_url", ""),
                "ocop_rating": p.get("ocop_rating")
            })

        return {
            "products": products_summary, "total_products": total_products,
            "page": page, "per_page": per_page,
            "total_pages": (total_products + per_page - 1) // per_page, "status": "success"
        }
    except Exception as e:
        return {"error": f"Failed to load or process product map: {str(e)}", "trace": traceback.format_exc()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Recommender CLI (reads pre-built files)")
    parser.add_argument("command", choices=["get_recommendations", "get_products"], help="Command")
    parser.add_argument("--product_id", type=str)
    parser.add_argument("--top_n", type=int, default=TOP_N_FINAL_RECS)
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--per_page", type=int, default=20)
    args = parser.parse_args()
    result = {}
    try:
        if args.command == "get_recommendations":
            if not args.product_id: result = {"error": "Product ID required."}
            else: result = get_recommendations_from_precomputed(args.product_id, args.top_n)
        elif args.command == "get_products":
            result = get_products_from_files(args.page, args.per_page)
    except Exception as e:
        result = {"error": f"CLI Error: {str(e)}", "trace": traceback.format_exc()}
    print(json.dumps(result, ensure_ascii=False, indent=2 if 'error' not in result else None))