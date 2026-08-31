-- PCCC26 · dữ liệu mẫu để chạy thử
-- Chạy sau 0001_init.sql. Xoá và chạy lại được nhiều lần (idempotent theo tên bộ đề).

delete from question_sets where name = 'PCCC cơ bản (mẫu)';

with s as (
  insert into question_sets (name) values ('PCCC cơ bản (mẫu)') returning id
)
insert into questions (set_id, order_index, type, content, options, correct, explanation)
select s.id, v.order_index, v.type, v.content, v.options, v.correct, v.explanation
from s, (values
  (1, 'single',
   'Số điện thoại gọi lực lượng Cảnh sát phòng cháy chữa cháy là số nào?',
   '["113","114","115","116"]'::jsonb, '[1]'::jsonb,
   '114 là số gọi lực lượng Cảnh sát phòng cháy chữa cháy và cứu nạn cứu hộ. 113 là Cảnh sát phản ứng nhanh, 115 là cấp cứu y tế.'),

  (2, 'boolean',
   'Khi có cháy ở nhà cao tầng, nên dùng thang máy để thoát ra ngoài cho nhanh.',
   null, '[false]'::jsonb,
   'Không dùng thang máy khi có cháy. Thang máy có thể mất điện và kẹt lại giữa các tầng, trục thang máy còn hút khói. Hãy thoát bằng thang bộ theo lối thoát nạn.'),

  (3, 'multi',
   'Khi phát hiện cháy, những việc nào nên làm ngay?',
   '["Báo động cho những người xung quanh","Gọi 114","Ngắt nguồn điện khu vực đang cháy","Mở toàn bộ cửa sổ cho khói bay ra"]'::jsonb,
   '[0,1,2]'::jsonb,
   'Mở toàn bộ cửa sổ sẽ đưa thêm không khí vào và làm đám cháy bùng lên mạnh hơn. Ba việc còn lại đều đúng.'),

  (4, 'text',
   'Bình chữa cháy dạng bột dùng được cho cả chất rắn, chất lỏng và chất khí được ký hiệu bằng ba chữ cái nào?',
   null, '["ABC","abc"]'::jsonb,
   'Bột ABC chữa được cháy chất rắn (A), chất lỏng (B) và chất khí (C) nên là loại bình phổ biến nhất trong nhà và văn phòng.'),

  (5, 'single',
   'Chảo dầu ăn trên bếp bốc cháy. Cách xử lý đúng là gì?',
   '["Đổ nước vào chảo cho tắt lửa","Tắt bếp rồi đậy kín chảo bằng vung hoặc nắp","Bê chảo ra ngoài sân","Quạt mạnh cho lửa tắt"]'::jsonb,
   '[1]'::jsonb,
   'Đổ nước vào dầu đang cháy sẽ làm dầu bắn ra và lửa bùng lên dữ dội. Tắt nguồn nhiệt rồi đậy kín để cắt oxy là cách an toàn nhất.'),

  (6, 'boolean',
   'Có thể dùng nước để dập đám cháy thiết bị điện khi thiết bị vẫn đang có điện.',
   null, '[false]'::jsonb,
   'Nước dẫn điện nên có nguy cơ điện giật. Phải ngắt điện trước, và dùng bình khí CO2 hoặc bình bột cho cháy thiết bị điện.'),

  (7, 'single',
   'Khi phải di chuyển qua khu vực nhiều khói, nên làm thế nào?',
   '["Đứng thẳng và chạy nhanh nhất có thể","Hạ thấp người, bò sát sàn và dùng khăn ẩm che mũi miệng","Nín thở rồi đi thật chậm","Đi lùi để tránh hít khói"]'::jsonb,
   '[1]'::jsonb,
   'Khói nóng và khí độc bay lên cao, lớp không khí gần sàn còn thở được. Khăn ẩm giúp lọc bớt khói.'),

  (8, 'multi',
   'Những lối nào phải luôn thông thoáng, không được để vật cản?',
   '["Hành lang thoát nạn","Cầu thang bộ","Cửa ra vào lối thoát hiểm","Ngăn để đồ cá nhân trong phòng"]'::jsonb,
   '[0,1,2]'::jsonb,
   'Hành lang, cầu thang bộ và cửa thoát hiểm là đường sống khi có cháy. Vật cản trên các lối này làm chậm việc thoát nạn của cả toà nhà.')
) as v(order_index, type, content, options, correct, explanation);
