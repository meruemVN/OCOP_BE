# test_recommender.py
import json
import sys # Thêm sys để có thể print ra stderr nếu cần
from recommender_cli import (
    get_user_content_based_recommendations_dynamic,
    load_artifacts 
)
# Thêm import traceback nếu bạn muốn in chi tiết lỗi
import traceback

if __name__ == "__main__":
    print("--- TEST SCRIPT STARTED ---", file=sys.stderr) # In ra stderr để chắc chắn thấy
    try:
        print("Attempting to load artifacts...", file=sys.stderr)
        load_artifacts() 
        print("Artifacts loading process completed (or attempted).", file=sys.stderr)

        test_user_id = "67fe1b494365124f151881f0" 
        test_interacted_pids = ["12731"] 
        top_n_test = 5

        print(f"Testing get_user_content_based_recommendations_dynamic for user: {test_user_id}", file=sys.stderr)
        print(f"With interacted PIDs: {test_interacted_pids}", file=sys.stderr)
        
        recommendations_result = get_user_content_based_recommendations_dynamic(
            test_user_id,
            test_interacted_pids,
            top_n_test
        )
        
        print("--- Result from get_user_content_based_recommendations_dynamic ---", file=sys.stderr)
        # In kết quả ra stdout để có thể dùng cho các mục đích khác nếu cần
        # Và cũng in ra stderr để debug
        result_str = json.dumps(recommendations_result, ensure_ascii=False, indent=2)
        print(result_str) # Ra stdout
        print(f"Raw result object: {recommendations_result}", file=sys.stderr) # Ra stderr

        if recommendations_result: # Kiểm tra xem result có phải là None hay rỗng không
            if "recommendations" in recommendations_result and recommendations_result["recommendations"] is not None:
                print(f"Number of recommendations: {len(recommendations_result['recommendations'])}", file=sys.stderr)
            else:
                print("No 'recommendations' key in result or it's None/empty.", file=sys.stderr)
            
            if recommendations_result.get("error"):
                print(f"Error from function: {recommendations_result['error']}", file=sys.stderr)
            if recommendations_result.get("message"):
                print(f"Message from function: {recommendations_result['message']}", file=sys.stderr)
        else:
            print("Function returned None or an empty result.", file=sys.stderr)

    except FileNotFoundError as fnf:
        print(f"TEST SCRIPT CAUGHT FileNotFoundError: {fnf}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    except IOError as ioe:
        print(f"TEST SCRIPT CAUGHT IOError: {ioe}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    except Exception as e:
        print(f"TEST SCRIPT CAUGHT An unexpected error: {type(e).__name__} - {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    
    print("--- TEST SCRIPT FINISHED ---", file=sys.stderr)