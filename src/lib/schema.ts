import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const reportInputSchema = z.object({
  department: trimmed(50),
  reporterName: trimmed(30),
  title: trimmed(200),
  body: trimmed(5000),
  /** 게시글 전용 비번. 평소 쓰는 비번을 넣지 말라고 화면에 안내한다. */
  password: z.string().min(4).max(72), // bcrypt 는 72바이트 초과분을 버린다
  appVersion: z.string().trim().max(20).optional(),
  platform: z.enum(['iOS', 'Android']).optional(),
  deviceModel: z.string().trim().max(50).optional(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

export const adminPatchSchema = z.object({
  status: z.enum(['접수', '확인중', '수정완료', '재현불가']).optional(),
  adminNote: z.string().trim().max(2000).nullable().optional(),
});
