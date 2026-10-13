5. Lịch sử thay đổi
12. Lịch sử call API
13. Mock server local
14. UX: Thêm param thì cần show lên header kiểu preview chứ
15. feat: Xuất API ra curl
16. auto-save
17. Bỏ slug hoàn toàn, dùng UUID thuần cho ID và tên file/folder (request: `<uuid>.json`, folder: `<uuid>/`, env: `<uuid>.json`, collection: `<uuid>/` trừ default). Bỏ field slug trong Collection model & API, dọn sạch code cũ.
18. Khi click vào thư mục thì hiện setting của thư mục ra luôn.
19. Khi test thì chỉ tạo vào collection Test-Collection để đảm bảo không động đến data thật tôi đang dùng. Trừ khi test tạo mới collection thì tạo mới xong nhớ xóa đi luôn không đụng vào collection cũ
20. Multisession: Mở được nhiều tab request, folder cùng 1 lúc
21. Cho phép folder config vào từng env theo list env gọi là folder-env. Cũ sẽ là folder global env. Thứ tự ưu tiên sẽ là `collection env -> global env -> folder global env -> folder-env`
22. Tạo collection env là env cho toàn bộ collection dùng chung cho all môi trường
23. Cho fontsize url bé xuống
