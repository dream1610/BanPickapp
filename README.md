# Gdreed — Valorant Draft Console MVP

> `Gdreed` là nhà phát triển. Đây là Web MVP cho công cụ cấm/chọn map Valorant; tên sản phẩm chưa được chốt.

## Chạy dự án

```powershell
cd 'C:\Users\admin\Downloads\Ban Pick app'
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal, thường là `http://localhost:5173`.

## Các phần đã hiện thực hóa

- Lõi rule engine dạng dữ liệu: BO1, BO3, BO5, BO7 Custom.
- State machine MVP: lobby → ban/pick → pause/resume → tổng kết.
- Auto-balance theo rating/seed; tạo captain mặc định và đổi captain bằng giao diện.
- Timer 30 giây và auto-action khi hết giờ.
- Audit log cho chia đội, captain, ban/pick, timeout, pause/resume và lưu kết quả.
- Lưu trạng thái localStorage — phù hợp demo một trình duyệt.
- Responsive desktop/mobile, hệ màu đen vũ trụ/vàng kim.

## Cấu trúc media tách riêng

- `public/media/background-music/`
- `public/media/ban-pick-music/`
- `public/media/sfx/`
- `public/media/background-video/`

Các thư mục hiện để trống, sẵn sàng nhận asset hợp lệ của bạn. Không thêm tài nguyên Valorant/Riot vào dự án vì cần xác minh quyền sử dụng.

## Giới hạn hiện tại và bước production

Bản MVP dùng `localStorage`, không phải realtime đa người dùng. Để triển khai thật, thay lớp persistence/dispatch bằng Supabase Auth + Postgres + Realtime (hoặc room service WebSocket server-authoritative). Những xác thực quan trọng — quyền captain, state version, action ID, deadline — phải nằm phía server.

Discord chỉ nên mở invite link theo đội; không thể tự động ép tài khoản người dùng join/chuyển voice channel qua API công khai.

## Lệnh kiểm tra

```powershell
npm run build
```

