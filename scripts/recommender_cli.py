# scripts/recommender_cli.py
import os
import json
import argparse
import traceback
import pathlib
import pandas as pd
import numpy as np
import pickle
import sys # Quan trọng để print ra stderr

# --- ĐỊNH NGHĨA ĐƯỜNG DẪN ---
PROJECT_ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = PROJECT_ROOT_DIR / "python_recommender_artifacts"

PRODUCT_DATA_CSV_FILE = ARTIFACTS_DIR / 'buudien_ocop_products_detailed_v2_rerun.csv'
PRODUCT_MAP_JSON_FILE = ARTIFACTS_DIR / 'product_id_name_map_v2_adv.json'
PRECOMPUTED_PRODUCT_RECS_JSON_FILE = ARTIFACTS_DIR / 'precomputed_recommendations_v2_raw_adv.json'
COSINE_SIM_MATRIX_FILE = ARTIFACTS_DIR / 'cosine_similarity_matrix_v2_adv.npy'
PRODUCT_INDICES_MAP_FILE = ARTIFACTS_DIR / 'product_indices_map_v2_adv.pkl'

TOP_N_FINAL_RECS = 10

# --- Biến toàn cục để cache các file đã load ---
LOADED_PRODUCT_MAP = None
LOADED_COSINE_SIM_MATRIX = None
LOADED_PRODUCT_INDICES_MAP = None # Đây sẽ là Pandas Series
LOADED_ALL_PRODUCTS_DF = None
# Thêm biến global cho map ngược đã xử lý
CACHED_ID_TO_IDX_MAP = None
CACHED_IDX_TO_ID_MAP = None


def safe_int_convert(value):
    try: return int(float(value))
    except (ValueError, TypeError, OverflowError): return None

def safe_float_convert(value):
    try: return float(value)
    except (ValueError, TypeError, OverflowError): return None

def load_artifacts():
    global LOADED_PRODUCT_MAP, LOADED_COSINE_SIM_MATRIX, LOADED_PRODUCT_INDICES_MAP
    global LOADED_ALL_PRODUCTS_DF, CACHED_ID_TO_IDX_MAP, CACHED_IDX_TO_ID_MAP

    if LOADED_PRODUCT_MAP is None:
        if not os.path.exists(PRODUCT_MAP_JSON_FILE):
            raise FileNotFoundError(f"Product map file not found: {PRODUCT_MAP_JSON_FILE}")
        with open(PRODUCT_MAP_JSON_FILE, 'r', encoding='utf-8') as f:
            LOADED_PRODUCT_MAP = json.load(f)

    if LOADED_COSINE_SIM_MATRIX is None:
        if not os.path.exists(COSINE_SIM_MATRIX_FILE):
            raise FileNotFoundError(f"Cosine similarity matrix file not found: {COSINE_SIM_MATRIX_FILE}")
        LOADED_COSINE_SIM_MATRIX = np.load(COSINE_SIM_MATRIX_FILE)

    if LOADED_PRODUCT_INDICES_MAP is None: # LOADED_PRODUCT_INDICES_MAP sẽ là Pandas Series
        if not os.path.exists(PRODUCT_INDICES_MAP_FILE):
            raise FileNotFoundError(f"Product indices map file not found: {PRODUCT_INDICES_MAP_FILE}")
        with open(PRODUCT_INDICES_MAP_FILE, 'rb') as f:
            LOADED_PRODUCT_INDICES_MAP = pickle.load(f)
        
        # Xử lý và cache các map sau khi LOADED_PRODUCT_INDICES_MAP được load
        if isinstance(LOADED_PRODUCT_INDICES_MAP, pd.Series) and not LOADED_PRODUCT_INDICES_MAP.empty:
            # Đảm bảo index của Series (là product_id) cũng là string
            LOADED_PRODUCT_INDICES_MAP.index = LOADED_PRODUCT_INDICES_MAP.index.astype(str) # QUAN TRỌNG
            
            CACHED_ID_TO_IDX_MAP = LOADED_PRODUCT_INDICES_MAP 
            temp_idx_to_id_map = {}
            for pid_str_from_series_index, df_idx in CACHED_ID_TO_IDX_MAP.items():
                temp_idx_to_id_map[df_idx] = pid_str_from_series_index # df_idx là int, pid_str là string
            CACHED_IDX_TO_ID_MAP = temp_idx_to_id_map
            print(f"[PYTHON ARTIFACTS] CACHED_ID_TO_IDX_MAP (Series) index type: {CACHED_ID_TO_IDX_MAP.index.dtype}, sample: {CACHED_ID_TO_IDX_MAP.index[:3]}", file=sys.stderr)
            print(f"[PYTHON ARTIFACTS] CACHED_IDX_TO_ID_MAP (dict) sample (first 3): {list(CACHED_IDX_TO_ID_MAP.items())[:3]}", file=sys.stderr)
        else:
            # Nếu LOADED_PRODUCT_INDICES_MAP không phải là Series hoặc rỗng, đặt các map cache là None hoặc dict rỗng
            CACHED_ID_TO_IDX_MAP = pd.Series(dtype='int64')
            CACHED_IDX_TO_ID_MAP = {}
            print(f"Warning: LOADED_PRODUCT_INDICES_MAP is not a valid Pandas Series or is empty. Type: {type(LOADED_PRODUCT_INDICES_MAP)}", file=sys.stderr)


    if LOADED_ALL_PRODUCTS_DF is None:
        if not os.path.exists(PRODUCT_DATA_CSV_FILE):
            print(f"Warning: Product CSV data file not found: {PRODUCT_DATA_CSV_FILE}. Popular/Product list fallback may not work well.", file=sys.stderr)
            LOADED_ALL_PRODUCTS_DF = pd.DataFrame() # Khởi tạo DataFrame rỗng
        else:
            try:
                LOADED_ALL_PRODUCTS_DF = pd.read_csv(PRODUCT_DATA_CSV_FILE, dtype={'product_id': str})
                for col in ['price', 'ocop_rating', 'num_reviews', 'sold']: # 'total_sales' đã bị đổi thành 'sold'
                    if col in LOADED_ALL_PRODUCTS_DF.columns:
                        LOADED_ALL_PRODUCTS_DF[col] = pd.to_numeric(LOADED_ALL_PRODUCTS_DF[col], errors='coerce')
            except Exception as e:
                print(f"Warning: Could not load or process product CSV {PRODUCT_DATA_CSV_FILE}: {e}", file=sys.stderr)
                LOADED_ALL_PRODUCTS_DF = pd.DataFrame() # Khởi tạo DataFrame rỗng khi lỗi

# --- HÀM LẤY GỢI Ý SẢN PHẨM (THEO PRODUCT_ID - PRECOMPUTED) ---
def get_recommendations_from_precomputed(product_id_input, top_n=TOP_N_FINAL_RECS):
    load_artifacts() 
    
    precomputed_recs_data = None
    if not os.path.exists(PRECOMPUTED_PRODUCT_RECS_JSON_FILE):
        return {"error": f"Precomputed product recommendations file not found: {PRECOMPUTED_PRODUCT_RECS_JSON_FILE}"}
    try:
        with open(PRECOMPUTED_PRODUCT_RECS_JSON_FILE, 'r', encoding='utf-8') as f:
            precomputed_recs_data = json.load(f)
    except Exception as e:
        return {"error": f"Failed to load JSON files for product recommendations: {str(e)}", "trace": traceback.format_exc()}

    product_id_str_input = str(product_id_input)
    recommended_ids_int_list = precomputed_recs_data.get(product_id_str_input)

    if recommended_ids_int_list is None:
        if LOADED_PRODUCT_MAP and product_id_str_input not in LOADED_PRODUCT_MAP:
            return {"error": f"Product ID '{product_id_str_input}' not found in product data."}
        else:
            return {"product_id_input": product_id_str_input, "recommendations": [], "message": f"No precomputed recommendations for Product ID '{product_id_str_input}'."}
    
    if not recommended_ids_int_list:
        return {"product_id_input": product_id_str_input, "recommendations": []}

    recommendations = []
    count = 0
    for rec_id_int in recommended_ids_int_list:
        if count >= top_n: break
        rec_id_str = str(rec_id_int)
        rec_details = LOADED_PRODUCT_MAP.get(rec_id_str) if LOADED_PRODUCT_MAP else None
        if rec_details:
            recommendations.append({
                "product_id": rec_id_int, "name": rec_details.get("name", "N/A"),
                "price": safe_float_convert(rec_details.get("price")),
                "image_url": rec_details.get("image_url", ""),
                "product_url": rec_details.get("product_url", ""),
                "ocop_rating": safe_int_convert(rec_details.get("ocop_rating")),
            })
            count += 1
    return {"product_id_input": product_id_str_input, "recommendations": recommendations}


# --- HÀM LẤY GỢI Ý CHO USER DỰA TRÊN CONTENT-BASED (ĐỘNG) ---
def get_user_content_based_recommendations_dynamic(user_id_input, interacted_product_ids_str_list, top_n=TOP_N_FINAL_RECS):
    load_artifacts()

    if LOADED_COSINE_SIM_MATRIX is None or CACHED_ID_TO_IDX_MAP is None or CACHED_IDX_TO_ID_MAP is None or LOADED_PRODUCT_MAP is None :
         return {"error": "Required artifacts (similarity matrix, indices map, or product map) not properly loaded or cached."}
    
    # Kiểm tra CACHED_ID_TO_IDX_MAP có phải là Series và không rỗng
    if not isinstance(CACHED_ID_TO_IDX_MAP, pd.Series) or CACHED_ID_TO_IDX_MAP.empty:
        return {"error": "Product ID to index map (CACHED_ID_TO_IDX_MAP) is invalid or empty."}
    if not CACHED_IDX_TO_ID_MAP: # Kiểm tra map ngược
        return {"error": "Index to Product ID map (CACHED_IDX_TO_ID_MAP) is invalid or empty."}


    if not interacted_product_ids_str_list:
        if LOADED_ALL_PRODUCTS_DF is not None and not LOADED_ALL_PRODUCTS_DF.empty:
            sort_col = None
            if 'sold' in LOADED_ALL_PRODUCTS_DF.columns: sort_col = 'sold'
            elif 'num_reviews' in LOADED_ALL_PRODUCTS_DF.columns: sort_col = 'num_reviews'
            
            popular_df = LOADED_ALL_PRODUCTS_DF.copy()
            if sort_col:
                popular_df = popular_df.sort_values(by=sort_col, ascending=False, na_position='last')
            
            popular_ids_str = popular_df['product_id'].astype(str).head(top_n).tolist()
            
            recommendations = []
            for pid_str in popular_ids_str:
                details = LOADED_PRODUCT_MAP.get(pid_str) if LOADED_PRODUCT_MAP else None
                if details:
                    recommendations.append({
                        "product_id": safe_int_convert(pid_str), "name": details.get("name", "N/A"),
                        "price": safe_float_convert(details.get("price")),
                        "image_url": details.get("image_url", ""),
                        "ocop_rating": safe_int_convert(details.get("ocop_rating")),
                    })
            return {"user_id_input": user_id_input, "recommendations": recommendations, "message": "Showing popular products due to no interaction history."}
        else:
            return {"user_id_input": user_id_input, "recommendations": [], "message": "No interaction history and no popular products data available."}

    user_profile_accumulator = np.zeros(LOADED_COSINE_SIM_MATRIX.shape[1])
    valid_interacted_count = 0

    for pid_str in interacted_product_ids_str_list: # pid_str từ Node.js đã là string
        print(f"[PYTHON DEBUG] Processing interacted_pid_str: '{pid_str}' (type: {type(pid_str)})", file=sys.stderr)
        # Kiểm tra sự tồn tại của pid_str trong index của Series CACHED_ID_TO_IDX_MAP
        if pid_str in CACHED_ID_TO_IDX_MAP.index: 
            idx = CACHED_ID_TO_IDX_MAP[pid_str] # Lấy giá trị (df_model_idx)
            print(f"[PYTHON DEBUG] Found df_model_idx {idx} for pid '{pid_str}'", file=sys.stderr)
            if idx < LOADED_COSINE_SIM_MATRIX.shape[0]:
                user_profile_accumulator += LOADED_COSINE_SIM_MATRIX[idx]
                valid_interacted_count += 1
            else:
                print(f"[PYTHON DEBUG] Index {idx} for pid '{pid_str}' is out of bounds for sim matrix.", file=sys.stderr)
        else:
            print(f"[PYTHON DEBUG] PID '{pid_str}' NOT FOUND in CACHED_ID_TO_IDX_MAP's index.", file=sys.stderr)
            # Có thể print một vài key mẫu từ CACHED_ID_TO_IDX_MAP.index để so sánh
            # print(f"[PYTHON DEBUG] Sample keys from CACHED_ID_TO_IDX_MAP.index: {list(CACHED_ID_TO_IDX_MAP.index[:5])}", file=sys.stderr)

    
    if valid_interacted_count == 0:
        return {"user_id_input": user_id_input, "recommendations": [], "message": "None of the interacted products found in similarity matrix."}

    user_profile_vector = user_profile_accumulator / valid_interacted_count
    sorted_product_indices_by_score = np.argsort(user_profile_vector)[::-1]

    recommendations = []
    count = 0
    for product_df_model_idx in sorted_product_indices_by_score:
        if count >= top_n: break
        recommended_pid_str = CACHED_IDX_TO_ID_MAP.get(product_df_model_idx)
        if recommended_pid_str and recommended_pid_str not in interacted_product_ids_str_list:
            details = LOADED_PRODUCT_MAP.get(recommended_pid_str) if LOADED_PRODUCT_MAP else None
            if details:
                recommendations.append({
                    "product_id": safe_int_convert(recommended_pid_str),
                    "name": details.get("name", "N/A"), "price": safe_float_convert(details.get("price")),
                    "image_url": details.get("image_url", ""), "product_url": details.get("product_url", ""),
                    "ocop_rating": safe_int_convert(details.get("ocop_rating")),
                })
                count += 1
    return {"user_id_input": user_id_input, "recommendations": recommendations}

# --- HÀM LẤY DANH SÁCH SẢN PHẨM (CẬP NHẬT VỚI LỌC VÀ SẮP XẾP) ---
def get_products_from_files(page=1, per_page=20, category=None, province=None, min_price=None, max_price=None, sort_by=None):
    load_artifacts()
    
    current_df_source = None
    if LOADED_ALL_PRODUCTS_DF is not None and not LOADED_ALL_PRODUCTS_DF.empty:
        current_df_source = LOADED_ALL_PRODUCTS_DF.copy()
        current_df_source['product_id'] = current_df_source['product_id'].astype(str) # Đảm bảo ID là string
    elif LOADED_PRODUCT_MAP:
        temp_list = []
        for id_str, details in LOADED_PRODUCT_MAP.items():
            item = {"product_id": id_str}
            item.update(details)
            item["price"] = safe_float_convert(details.get("price"))
            item["ocop_rating"] = safe_int_convert(details.get("ocop_rating"))
            item["num_reviews"] = safe_int_convert(details.get("num_reviews"))
            # Thêm các trường khác từ details nếu cần cho lọc/sort
            item["category"] = details.get("category", "")
            item["origin"] = details.get("origin", "") # Giả sử có trường origin trong product_map
            item["sold"] = safe_int_convert(details.get("sold"))

            temp_list.append(item)
        current_df_source = pd.DataFrame(temp_list)
        if current_df_source.empty:
             return {"products": [], "count": 0, "page": page, "pages": 0, "status": "success", "message":"No product data available from JSON map."}
    else:
        return {"error": "No product data available (CSV and JSON map failed to load or are empty)."}

    df_to_filter = current_df_source
    
    # Lọc isActive nếu cột tồn tại (từ CSV)
    if 'isActive' in df_to_filter.columns:
        df_to_filter = df_to_filter[df_to_filter['isActive'] == True]


    if category:
        df_to_filter = df_to_filter[df_to_filter['category'].astype(str).str.contains(category, case=False, na=False)]
    if province: # Giả định lọc theo trường 'origin'
        df_to_filter = df_to_filter[df_to_filter['origin'].astype(str).str.contains(province, case=False, na=False)]
    if min_price is not None:
        min_p = safe_float_convert(min_price)
        if min_p is not None: df_to_filter = df_to_filter[df_to_filter['price'].notna() & (df_to_filter['price'] >= min_p)]
    if max_price is not None:
        max_p = safe_float_convert(max_price)
        if max_p is not None: df_to_filter = df_to_filter[df_to_filter['price'].notna() & (df_to_filter['price'] <= max_p)]
    
    if sort_by:
        if sort_by == 'popular':
            sort_col_popular = None
            if 'sold' in df_to_filter.columns: sort_col_popular = 'sold'
            elif 'num_reviews' in df_to_filter.columns: sort_col_popular = 'num_reviews'
            elif 'rating' in df_to_filter.columns: sort_col_popular = 'rating' # Thêm rating làm lựa chọn
            if sort_col_popular: df_to_filter = df_to_filter.sort_values(by=sort_col_popular, ascending=False, na_position='last')
            else: df_to_filter = df_to_filter.sort_values(by='product_id', ascending=False, na_position='last') # Fallback
        elif sort_by == 'newest':
            # Cần cột 'createdAt' thực sự. Nếu không, dùng product_id (nếu số và tăng dần)
            if 'createdAt' in df_to_filter.columns: # Giả sử cột này tồn tại và là datetime hoặc string có thể sort
                 try: # Cố gắng chuyển sang datetime nếu là string
                     df_to_filter['createdAt_dt'] = pd.to_datetime(df_to_filter['createdAt'], errors='coerce')
                     df_to_filter = df_to_filter.sort_values(by='createdAt_dt', ascending=False, na_position='last').drop(columns=['createdAt_dt'])
                 except: # Nếu lỗi, fallback
                     df_to_filter = df_to_filter.sort_values(by='product_id', ascending=False, na_position='last')
            else:
                df_to_filter = df_to_filter.sort_values(by='product_id', ascending=False, na_position='last')
        elif sort_by == 'priceAsc':
            df_to_filter = df_to_filter.sort_values(by='price', ascending=True, na_position='last')
        elif sort_by == 'priceDesc':
            df_to_filter = df_to_filter.sort_values(by='price', ascending=False, na_position='last')
    else: # Mặc định sort
        df_to_filter = df_to_filter.sort_values(by='product_id', ascending=False, na_position='last')


    total_products = len(df_to_filter)
    start_index = (page - 1) * per_page
    end_index = start_index + per_page
    paginated_df = df_to_filter.iloc[start_index:end_index]
    
    products_summary = []
    for _, row in paginated_df.iterrows():
        pid_str_from_df = str(row.get("product_id"))
        details_from_map = LOADED_PRODUCT_MAP.get(pid_str_from_df, {}) if LOADED_PRODUCT_MAP else {}

        products_summary.append({
            "_id": pid_str_from_df, # Frontend dùng _id là string
            "name": row.get("name", details_from_map.get("name", "N/A")),
            "images": [row.get("image_url", details_from_map.get("image_url"))] if row.get("image_url", details_from_map.get("image_url")) else ["/images/placeholder-image.png"],
            "price": safe_float_convert(row.get("price", details_from_map.get("price"))),
            "category": row.get("category", details_from_map.get("category")),
            "province": row.get("origin", details_from_map.get("origin")), # Lấy từ origin
            "rating": safe_int_convert(row.get("ocop_rating", details_from_map.get("ocop_rating"))),
            "numReviews": safe_int_convert(row.get("num_reviews", details_from_map.get("num_reviews",0))),
            "countInStock": safe_int_convert(row.get("countInStock", details_from_map.get("countInStock",1))) # Giả sử CSV có countInStock
        })

    return {
        "products": products_summary, "count": total_products,
        "page": page, "pages": (total_products + per_page - 1) // per_page if per_page > 0 else 0,
        "status": "success"
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Recommender CLI")
    subparsers = parser.add_subparsers(dest="command", required=True, help="Available commands")

    parser_get_rec = subparsers.add_parser("get_recommendations", help="Get product-based recommendations")
    parser_get_rec.add_argument("--product_id", type=str, required=True)
    parser_get_rec.add_argument("--top_n", type=int, default=TOP_N_FINAL_RECS)

    parser_get_user_rec = subparsers.add_parser("get_user_recommendations", help="Get user-based content recommendations")
    parser_get_user_rec.add_argument("--user_id", type=str, required=True)
    parser_get_user_rec.add_argument("--top_n", type=int, default=TOP_N_FINAL_RECS)
    parser_get_user_rec.add_argument("--interacted_product_ids", type=str, required=True, help='JSON string list of product IDs user interacted with')

    parser_get_prod = subparsers.add_parser("get_products", help="List products with filters")
    parser_get_prod.add_argument("--page", type=int, default=1)
    parser_get_prod.add_argument("--per_page", type=int, default=20)
    parser_get_prod.add_argument("--category", type=str)
    parser_get_prod.add_argument("--province", type=str)
    parser_get_prod.add_argument("--min_price", type=float)
    parser_get_prod.add_argument("--max_price", type=float)
    parser_get_prod.add_argument("--sort_by", type=str, choices=['popular', 'newest', 'priceAsc', 'priceDesc'])
    parser_get_prod.add_argument("--keyword", type=str) # Thêm keyword cho get_products
    
    args = parser.parse_args()
    result = {}
    try:
        load_artifacts() 

        if args.command == "get_recommendations":
            result = get_recommendations_from_precomputed(args.product_id, args.top_n)
        elif args.command == "get_user_recommendations":
            try:
                interacted_ids = json.loads(args.interacted_product_ids)
                if not isinstance(interacted_ids, list): raise ValueError("interacted_product_ids must be a JSON list.")
                interacted_ids = [str(pid) for pid in interacted_ids]
            except Exception as e:
                result = {"error": f"Invalid interacted_product_ids: {e}"}
            else:
                result = get_user_content_based_recommendations_dynamic(args.user_id, interacted_ids, args.top_n)
        elif args.command == "get_products":
            result = get_products_from_files(
                page=args.page, per_page=args.per_page, category=args.category,
                province=args.province, min_price=args.min_price, max_price=args.max_price,
                sort_by=args.sort_by #  keyword=args.keyword # Cần truyền keyword vào hàm nếu get_products xử lý nó
            )
    except FileNotFoundError as fnf_error:
        result = {"error": str(fnf_error), "trace": traceback.format_exc()}
    except Exception as e:
        result = {"error": f"CLI Main Error: {type(e).__name__} - {e}", "trace": traceback.format_exc()}
    
    print(json.dumps(result, ensure_ascii=False)) # Bỏ indent để output trên 1 dòng cho Node.js
    sys.stdout.flush()