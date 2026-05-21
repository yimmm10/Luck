# Cosmic Tarot

สัมผัสประสบการณ์ดูดวงไพ่ยิปซีแบบโต้ตอบ 3 มิติ ธีมห้วงอวกาศลึกลับเสมือนจริง

## โครงสร้างโปรเจกต์ (Project Structure)

- `index.html`: ไฟล์หลักสำหรับเข้าใช้งานแอปพลิเคชัน
- `src/`: โค้ดโปรแกรมหลัก
  - `js/`: ไฟล์ JavaScript (`app.js`, `cards.js`)
  - `css/`: ไฟล์ Stylesheet (`styles.css`)
- `data/`: ข้อมูลดิบของไพ่
  - `cards.json`: แหล่งข้อมูลหลัก (Single Source of Truth)
- `assets/`: ไฟล์รูปภาพและสื่อต่างๆ
- `scripts/`: สคริปต์ช่วยจัดการข้อมูล
  - `generate_cards.py`: ใช้สำหรับแปลงข้อมูลจาก `data/cards.json` ไปเป็น `src/js/cards.js`
  - `download_tarot.py`: ใช้สำหรับดาวน์โหลดรูปภาพไพ่จาก Wikimedia

## วิธีอัปเดตข้อมูลไพ่

หากต้องการแก้ไขคำทำนายหรือข้อมูลไพ่:
1. แก้ไขไฟล์ `data/cards.json`
2. รันคำสั่ง `python scripts/generate_cards.py` เพื่ออัปเดตไฟล์ที่เว็บแอปใช้งาน
