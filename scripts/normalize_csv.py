import csv
import unicodedata

# Đường dẫn đến file CSV gốc của bạn
csv_input_path = 'buudien_ocop_products_detailed_v2_rerun.csv'
# Đường dẫn đến file CSV mới đã được chuẩn hóa
csv_output_path = 'buudien_ocop_products_normalized.csv'
# Giả sử cột chứa tên sản phẩm có header là 'name' (điều chỉnh nếu cần)
product_name_column_header = 'name'

try:
    with open(csv_input_path, 'r', encoding='utf-8-sig') as infile, \
         open(csv_output_path, 'w', encoding='utf-8', newline='') as outfile:
        
        reader = csv.DictReader(infile)
        if not reader.fieldnames:
            print(f"Lỗi: Không đọc được header từ file CSV: {csv_input_path}")
            exit()
            
        writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames)
        writer.writeheader()

        print(f"Đang chuẩn hóa file CSV. Header cột tên sản phẩm mong đợi: '{product_name_column_header}'")
        if product_name_column_header not in reader.fieldnames:
            print(f"Lỗi: Không tìm thấy cột '{product_name_column_header}' trong header của file CSV.")
            print(f"Các header tìm thấy: {reader.fieldnames}")
            exit()

        count = 0
        normalized_count = 0
        for row in reader:
            count += 1
            original_name = row.get(product_name_column_header)
            if original_name:
                # Chuẩn hóa tên sản phẩm sang dạng NFC (precomposed)
                normalized_name = unicodedata.normalize('NFC', original_name)
                if original_name != normalized_name:
                    # print(f"Đã chuẩn hóa: '{original_name}' -> '{normalized_name}'")
                    normalized_count +=1
                row[product_name_column_header] = normalized_name
            writer.writerow(row)
        
        print(f"Hoàn tất. Đã xử lý {count} dòng. Chuẩn hóa {normalized_count} tên sản phẩm.")
        print(f"File CSV đã chuẩn hóa được lưu tại: {csv_output_path}")

except FileNotFoundError:
    print(f"Lỗi: Không tìm thấy file CSV đầu vào: {csv_input_path}")
except Exception as e:
    print(f"Đã xảy ra lỗi: {e}")